import os
import requests
from fastapi import HTTPException
import logging

logger = logging.getLogger("varavu_selavu.chat_service")

# --------------------------------------------------------------------------- #
# Helper: call local Ollama chat API
# --------------------------------------------------------------------------- #

def call_ollama(query: str, analysis: dict, model: str | None = None, rag_context: dict | None = None) -> str:
    """
    Send the user query together with the current analysis data to the
    local Ollama instance and return the generated response.
    """
    ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_url = f"{ollama_base_url.rstrip('/')}/api/chat"  # override via OLLAMA_BASE_URL
    # Default to a commonly available model name if none provided
    model_name = model or os.getenv("OLLAMA_MODEL", "gpt-oss:20b")
    system_content = _build_system_prompt(analysis, rag_context)
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_content},
            {
                "role": "user",
                "content": f"{query}",
            },
        ],
        "stream": False
    }
    timeout = float(os.getenv("OLLAMA_TIMEOUT_SEC", "300"))
    try:
        resp = requests.post(ollama_url, json=payload, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        # Ollama returns {"message": {"role":"assistant","content":"..."}}
        return data.get("message", {}).get("content", "")
    except requests.RequestException as exc:
        # Log detailed error context for debugging, with traceback and HTTP details
        status = getattr(getattr(exc, "response", None), "status_code", None)
        text = getattr(getattr(exc, "response", None), "text", None)
        logger.exception(
            "Ollama chat request failed",
            extra={
                "provider": "ollama",
                "base_url": ollama_base_url,
                "model": model_name,
                "status": status,
                "response": text,
            },
        )
        raise HTTPException(
            status_code=502,
            detail=f"Error communicating with Ollama: {exc}",
        )


# --------------------------------------------------------------------------- #
# Helper: call OpenAI chat completion API
# --------------------------------------------------------------------------- #

def call_openai(query: str, analysis: dict, model: str | None = None, rag_context: dict | None = None) -> str:
    """
    Send the user query together with the current analysis data to the
    OpenAI Chat Completions API and return the generated response.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    model_name = model or os.getenv("OPENAI_MODEL", "gpt-5-mini")
    system_content = _build_system_prompt(analysis, rag_context)
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": f"{query}"},
        ],
    }
    timeout = float(os.getenv("OPENAI_TIMEOUT_SEC", "300"))
    url = "https://api.openai.com/v1/chat/completions"
    try:
        resp = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except requests.RequestException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        text = getattr(getattr(exc, "response", None), "text", None)
        logger.exception(
            "OpenAI chat request failed",
            extra={
                "provider": "openai",
                "model": model_name,
                "status": status,
                "response": text,
            },
        )
        raise HTTPException(
            status_code=502,
            detail=f"Error communicating with OpenAI: {exc}",
        )


# --------------------------------------------------------------------------- #
# Public API: choose provider based on environment
# --------------------------------------------------------------------------- #

def call_chat_model(query: str, analysis: dict, model: str | None = None, rag_context: dict | None = None) -> str:
    """
    Use OpenAI in production and Ollama locally.
    The environment is determined via the ENV or ENVIRONMENT variables.
    """
    env = os.getenv("ENVIRONMENT") or os.getenv("ENV") or "local"
    provider = "openai" if env.lower() in {"prod", "production"} else "ollama"
    logger.info(
        "Dispatching chat request",
        extra={"provider": provider, "env": env, "model": model},
    )
    if provider == "openai":
        return call_openai(query, analysis, model=model, rag_context=rag_context)
    return call_ollama(query, analysis, model=model, rag_context=rag_context)


# --------------------------------------------------------------------------- #
# System prompt builder
# --------------------------------------------------------------------------- #

def _build_system_prompt(analysis: dict, rag_context: dict | None = None) -> str:
    """Build the system prompt including general analysis and optional RAG context."""
    parts = [
        "You are a financial analyst assistant. You help users understand their expenses, "
        "spending patterns, item prices, and merchant spending.",
        f"\n\nGeneral analysis data:\n{analysis}",
    ]
    if rag_context:
        ctx_type = rag_context.get("type", "unknown")
        ctx_data = rag_context.get("data", {})
        if ctx_type == "item_insight":
            parts.append(
                f"\n\nDetailed item insight (including price history and store comparison):\n{ctx_data}"
            )
        elif ctx_type == "merchant_insight":
            parts.append(
                f"\n\nDetailed merchant insight (including monthly aggregates and items bought):\n{ctx_data}"
            )
    return "".join(parts)


# --------------------------------------------------------------------------- #
# Model listing helpers
# --------------------------------------------------------------------------- #

def list_openai_models() -> list[str]:
    """
    Return a list of model IDs from OpenAI's Models API, filtered to
    gpt-5, gpt-5.2, and gpt-5-mini (if they exist).
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
        target_models = ["gpt-5-mini", "gpt-5.2", "gpt-5"]

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
        data = resp.json()  # {"models": [{"name":"llama3:instruct",...}, ...]}
        return [m.get("name") for m in data.get("models", []) if m.get("name")]
    except requests.RequestException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        text = getattr(getattr(exc, "response", None), "text", None)
        logger.exception(
            "Ollama model listing failed",
            extra={"provider": "ollama", "url": url, "status": status, "response": text},
        )
        raise HTTPException(status_code=502, detail=f"Error listing Ollama models: {exc}")
