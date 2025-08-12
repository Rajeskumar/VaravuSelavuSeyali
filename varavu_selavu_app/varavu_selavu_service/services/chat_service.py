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
    ollama_url = "http://localhost:11434/api/chat"  # default Ollama endpoint
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

