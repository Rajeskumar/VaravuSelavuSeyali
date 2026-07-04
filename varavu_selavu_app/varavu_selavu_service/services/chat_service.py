import os
import requests
import logging
from datetime import date
from dateutil.relativedelta import relativedelta
from fastapi import HTTPException
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage

logger = logging.getLogger("varavu_selavu.chat_service")


def _resolve_chat_period(
    year: int | None, month: int | None, start_date: str | None, end_date: str | None
) -> tuple[str, str, str]:
    """
    Resolves the effective date range for a chat turn using real wall-clock
    time (never left to the LLM to guess "today"). Precedence: explicit
    start/end date > year/month > rolling last-3-months default.

    Returns (start_date, end_date, label) as ISO date strings plus a human
    label describing the scope, for use in the system prompt.
    """
    today = date.today()

    if start_date or end_date:
        eff_start = start_date or (today - relativedelta(months=3)).isoformat()
        eff_end = end_date or today.isoformat()
        return eff_start, eff_end, f"{eff_start} to {eff_end} (custom range)"

    if year is not None and month is not None:
        period_start = date(year, month, 1)
        period_end = (period_start + relativedelta(months=1)) - relativedelta(days=1)
        return period_start.isoformat(), period_end.isoformat(), f"{period_start.strftime('%B %Y')}"

    if year is not None:
        return date(year, 1, 1).isoformat(), date(year, 12, 31).isoformat(), str(year)

    # Default: rolling last 3 months, anchored to the real current date.
    eff_start = (today - relativedelta(months=3)).isoformat()
    eff_end = today.isoformat()
    return eff_start, eff_end, "the last 3 months (default)"


# --------------------------------------------------------------------------- #
# Public API: Agentic Chat Model
# --------------------------------------------------------------------------- #

def call_chat_model(
    messages: list[dict],
    user_id: str,
    analysis_service,
    analytics_service,
    insight_service,
    model: str | None = None,
    provider: str | None = None,
    year: int | None = None,
    month: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    """
    Invoke a LangGraph ReAct agent to answer the user's question, using tools
    to dynamically query the database instead of loading everything upfront.
    """

    @tool
    def get_expense_summary(start_date: str = None, end_date: str = None) -> str:
        """Get summary of expenses, totals by category, and top categories. Dates are optional YYYY-MM-DD."""
        try:
            res = analysis_service.analyze(user_id=user_id, start_date=start_date, end_date=end_date, use_cache=False)
            return str(res)
        except Exception as e:
            return f"Error fetching expense summary: {str(e)}"

    @tool
    def get_item_insights(item_name: str, start_date: str = None, end_date: str = None) -> str:
        """Get price metrics and insights for a specific item over a period. Dates are optional YYYY-MM-DD."""
        try:
            res = insight_service.calculate_item_detail(
                user_id=user_id, item_name=item_name, start_date=start_date, end_date=end_date
            )
            return str(res) if res else f"No data found for item: {item_name}"
        except Exception as e:
            return f"Error fetching item insights: {str(e)}"

    @tool
    def get_merchant_insights(merchant_name: str) -> str:
        """Get metrics and spending trends for a specific merchant."""
        try:
            res = analytics_service.get_merchant_detail(user_email=user_id, merchant_name=merchant_name)
            return str(res) if res else f"No data found for merchant: {merchant_name}"
        except Exception as e:
            return f"Error fetching merchant insights: {str(e)}"

    tools = [get_expense_summary, get_item_insights, get_merchant_insights]
    
    # 2. Select Model
    env = os.getenv("ENVIRONMENT") or os.getenv("ENV") or "local"
    if not provider:
        provider = "gemini"
    else:
        provider = provider.lower()
    
    logger.info("Initializing LangGraph agent", extra={"provider": provider, "env": env, "model": model})
    
    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
        
        # We fallback to gpt-4o-mini as it supports tool calling natively
        llm = ChatOpenAI(
            model=model or os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            api_key=api_key,
            temperature=0
        )
    elif provider == "gemini":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
            
        llm = ChatGoogleGenerativeAI(
            model=model or os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
            google_api_key=api_key,
            temperature=0
        )
    else:
        # We fallback to llama3 for Ollama local usage
        llm = ChatOllama(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            model=model or os.getenv("OLLAMA_MODEL", "llama3.1"),
            temperature=0
        )
        
    history_text = ""
    if len(messages) > 1:
        history_text = "\n\nPrevious conversation history:\n"
        for m in messages[:-1]:
            role = "User" if m.get("role") == "user" else "Assistant"
            content = m.get("content", "")
            history_text += f"{role}: {content}\n"

    # Only pass the final message to the agent as the current input
    if not messages:
        return "Please ask a question."

    last_message = messages[-1]
    query_text = last_message.get("content", "")

    # Pre-fetch targeted item/merchant context so the agent starts with the
    # right numbers already in hand instead of having to guess a tool call
    # (see TS-ANL-005: this is the RAG-style context injection).
    rag_context_text = ""
    try:
        rag_context = insight_service.build_rag_context(user_email=user_id, query=query_text)
    except Exception:
        logger.exception("build_rag_context failed; falling back to tool-only context")
        rag_context = None

    if rag_context:
        rag_context_text = (
            f"\n\nRelevant {rag_context['type'].replace('_', ' ')} data for this question "
            f"(already fetched, use it directly instead of calling a tool unless you need more):\n"
            f"{rag_context['data']}\n"
        )

    # Resolve a real default period (today's actual date, not the LLM's guess)
    # and eagerly fetch the expense summary for it so the model always has
    # concrete numbers in hand, instead of depending on it correctly guessing
    # dates and calling get_expense_summary itself.
    period_start, period_end, period_label = _resolve_chat_period(year, month, start_date, end_date)
    default_summary_text = ""
    try:
        default_summary = analysis_service.analyze(
            user_id=user_id, start_date=period_start, end_date=period_end, use_cache=False
        )
        default_summary_text = (
            f"\n\nExpense summary for {period_label} ({period_start} to {period_end}), "
            f"already fetched — use this directly for any aggregate question unless the user "
            f"asks about a different period, in which case call get_expense_summary again with "
            f"the new dates:\n{default_summary}\n"
        )
    except Exception:
        logger.exception("Failed to pre-fetch default expense summary for chat")

    today_str = date.today().isoformat()
    system_prompt = (
        "You are a financial analyst assistant. You help users understand their expenses. "
        f"Today's date is {today_str}. Unless the user specifies a different timeframe, the "
        f"conversation is scoped to {period_label} ({period_start} to {period_end}) — the "
        "expense summary for this period is provided below. "
        "Use your tools to query the database for anything not already provided, and answer the "
        "user's questions clearly and concisely. "
        "Format your answer using markdown. "
    ) + default_summary_text + rag_context_text + history_text

    agent = create_react_agent(llm, tools, prompt=system_prompt)

    lc_messages = [HumanMessage(content=query_text)]
            
    try:
        final_message = None
        # Stream intermediate steps to see exactly what Gemini returns
        logger.info(f"Starting agent execution with model {model} and provider {provider}...")
        for event in agent.stream({"messages": lc_messages}):
            for node_name, node_output in event.items():
                logger.info(f"Agent step [{node_name}]: {node_output}")
                if "messages" in node_output:
                    final_message = node_output["messages"][-1]
                    
        if final_message is None:
            raise ValueError("Agent returned no messages")
            
        # Check for Gemini tool calling failures
        finish_reason = final_message.response_metadata.get('finish_reason') if getattr(final_message, 'response_metadata', None) else None
        if finish_reason == 'MALFORMED_FUNCTION_CALL':
            return "I encountered a technical issue while analyzing your data (Malformed Function Call). Please try rephrasing your question or selecting the 'gemini-2.5-pro' model, which handles complex queries better."
            
        content = final_message.content
        if not content and not getattr(final_message, 'tool_calls', []):
             return "I couldn't generate a response. Please try again or switch to a different model."

        if isinstance(content, list):
            text_parts = [chunk.get("text", "") if isinstance(chunk, dict) else str(chunk) for chunk in content]
            return "".join(text_parts)
        return str(content)
    except Exception as e:
        logger.exception("Agent execution failed", extra={"error": str(e)})
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")


# --------------------------------------------------------------------------- #
# Model listing helpers
# --------------------------------------------------------------------------- #

def list_openai_models() -> list[str]:
    """
    Return a list of model IDs from OpenAI's Models API, filtered to
    gpt-4o, gpt-4o-mini, gpt-5, gpt-5.2, and gpt-5-mini (if they exist).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
    try:
        resp = requests.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        remote_ids = {m.get("id") for m in data.get("data", []) if m.get("id")}

        # Only include these models if they are returned by the API
        target_models = ["gpt-5-mini", "gpt-5.2", "gpt-5", "gpt-4o-mini", "gpt-4o"]

        filtered_ids = [mid for mid in target_models if mid in remote_ids]
        return filtered_ids
    except requests.RequestException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        text = getattr(getattr(exc, "response", None), "text", None)
        logger.exception(
            "OpenAI model listing failed",
            extra={"provider": "openai", "status": status, "response": text},
        )
        raise HTTPException(status_code=502, detail=f"Error listing OpenAI models: {exc}")


def list_ollama_models() -> list[str]:
    """Return a list of local Ollama model names (from /api/tags)."""
    ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    url = f"{ollama_base_url.rstrip('/')}/api/tags"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return [m.get("name") for m in data.get("models", []) if m.get("name")]
    except requests.RequestException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        text = getattr(getattr(exc, "response", None), "text", None)
        logger.exception(
            "Ollama model listing failed",
            extra={"provider": "ollama", "url": url, "status": status, "response": text},
        )
        raise HTTPException(status_code=502, detail=f"Error listing Ollama models: {exc}")

def list_gemini_models() -> list[str]:
    """Return a list of available Gemini models via the API."""
    api_key = os.getenv("GEMINI_API_KEY")
    default_models = ["gemini-2.5-flash", "gemini-2.5-pro"]
    
    if not api_key:
        return default_models
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        models = []
        for m in data.get("models", []):
            name = m.get("name", "")
            if name.startswith("models/"):
                name = name[7:]
            if name in ["gemini-2.5-flash", "gemini-2.5-pro"]:
                models.append(name)
        return models if models else default_models
    except Exception as exc:
        logger.exception("Gemini model listing failed", extra={"error": str(exc)})
        return default_models
