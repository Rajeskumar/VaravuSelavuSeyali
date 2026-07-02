import os
import requests
import logging
from fastapi import HTTPException
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage, AIMessage

logger = logging.getLogger("varavu_selavu.chat_service")


# --------------------------------------------------------------------------- #
# Public API: Agentic Chat Model
# --------------------------------------------------------------------------- #

def call_chat_model(
    messages: list[dict],
    user_id: str,
    analysis_service,
    analytics_service,
    insight_service,
    model: str | None = None
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
    provider = "openai" if env.lower() in {"prod", "production"} else "ollama"
    
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

    system_prompt = (
        "You are a financial analyst assistant. You help users understand their expenses. "
        "If the user does not specify a timeline for an aggregate query, assume they want data for the last 3 months "
        "(calculate this relative to today, using your tools). "
        "Use your tools to query the database and answer the user's questions clearly and concisely. "
        "Format your answer using markdown. "
    ) + history_text
    
    agent = create_react_agent(llm, tools, prompt=system_prompt)
    
    # Only pass the final message to the agent as the current input
    if not messages:
        return "Please ask a question."
        
    last_message = messages[-1]
    lc_messages = [HumanMessage(content=last_message.get("content", ""))]
            
    try:
        result = agent.invoke({"messages": lc_messages})
        final_message = result["messages"][-1]
        return final_message.content
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
