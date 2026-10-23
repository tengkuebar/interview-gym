import json
from collections.abc import AsyncIterator

import httpx

from .config import OLLAMA_URL


async def chat_structured(model: str, messages: list[dict], schema: dict, temperature: float = 0.2) -> str:
    """One non-streaming call that forces the reply to match a JSON schema."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "think": False,
        "format": schema,
        "options": {"temperature": temperature},
    }
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()["message"]["content"]


async def chat_text(model: str, messages: list[dict], temperature: float = 0.6) -> str:
    """One non-streaming plain-text call."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "think": False,
        "options": {"temperature": temperature},
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()["message"]["content"].strip()


async def stream_chat(model: str, messages: list[dict], think: bool = False) -> AsyncIterator[str]:
    """Stream assistant text from Ollama's native chat API."""
    payload = {"model": model, "messages": messages, "stream": True, "think": think}
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                content = chunk.get("message", {}).get("content", "")
                if content:
                    yield content
                if chunk.get("done"):
                    break
