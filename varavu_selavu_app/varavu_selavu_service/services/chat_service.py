import os
import requests
from fastapi import HTTPException


# --------------------------------------------------------------------------- #
# Helper: call local Ollama chat API
# --------------------------------------------------------------------------- #

def call_ollama(query: str, analysis: dict) -> str:
    """
    Send the user query together with the current analysis data to the
    local Ollama instance and return the generated response.
    """
    ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_url = f"{ollama_base_url.rstrip('/')}/api/chat"  # override via OLLAMA_BASE_URL
    payload = {
        "model": "gpt-oss:20b",
        "messages": [
            {"role": "system", "content": f"You are a financial analyst. \n\nAnalysis data:\n {analysis}"},
            {
                "role": "user",
                "content": f"{query}",
            },
        ],
        "stream": False
    }
    try:
        resp = requests.post(ollama_url, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        # Ollama returns {"message": {"role":"assistant","content":"..."}}
        return data.get("message", {}).get("content", "")
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Error communicating with Ollama: {exc}",
        )


# --------------------------------------------------------------------------- #
# Helper: call OpenAI chat completion API
# --------------------------------------------------------------------------- #

def call_openai(query: str, analysis: dict) -> str:
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
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": f"You are a financial analyst. \n\nAnalysis data:\n {analysis}"},
            {"role": "user", "content": f"{query}"},
        ],
    }
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Error communicating with OpenAI: {exc}",
        )


# --------------------------------------------------------------------------- #
# Public API: choose provider based on environment
# --------------------------------------------------------------------------- #

def call_chat_model(query: str, analysis: dict) -> str:
    """
    Use OpenAI in production and Ollama locally.
    The environment is determined via the ENV or ENVIRONMENT variables.
    """
    env = os.getenv("ENVIRONMENT") or os.getenv("ENV") or "local"
    if env.lower() in {"prod", "production"}:
        return call_openai(query, analysis)
    return call_ollama(query, analysis)

