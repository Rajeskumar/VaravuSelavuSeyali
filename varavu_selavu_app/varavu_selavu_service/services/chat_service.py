import os
import requests
from fastapi import HTTPException
import logging

logger = logging.getLogger("varavu_selavu.chat_service")

# --------------------------------------------------------------------------- #
# Helper: call local Ollama chat API
# --------------------------------------------------------------------------- #

def call_ollama(query: str, analysis: dict, model: str | None = None) -> str:
    """
    Send the user query together with the current analysis data to the
    local Ollama instance and return the generated response.
    """
    ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_url = f"{ollama_base_url.rstrip('/')}/api/chat"  # override via OLLAMA_BASE_URL
    # Default to a commonly available model name if none provided
    model_name = model or os.getenv("OLLAMA_MODEL", "gpt-oss:20b")
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": f"You are a financial analyst. \n\nAnalysis data:\n {analysis}"},
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

def call_openai(query: str, analysis: dict, model: str | None = None) -> str:
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
    model_name = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": f"You are a financial analyst. \n\nAnalysis data:\n {analysis}"},
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

def call_chat_model(query: str, analysis: dict, model: str | None = None) -> str:
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
        return call_openai(query, analysis, model=model)
    return call_ollama(query, analysis, model=model)


# --------------------------------------------------------------------------- #
# Model listing helpers
# --------------------------------------------------------------------------- #

def list_openai_models() -> list[str]:
    """
    Return a list of model IDs from OpenAI's Models API, filtered to variants
    of gpt-4, gpt-5, and 'o' reasoning models.
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
        ids = [m.get("id") for m in data.get("data", []) if m.get("id")]
        # Filter to variants of gpt-4, gpt-5, and 'o' reasoning models
        filtered_ids = [
            id
            for id in ids
            if id.startswith("gpt-4") or id.startswith("gpt-5") or id.startswith("o")
        ]
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
