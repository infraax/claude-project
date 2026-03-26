"""
mcp/clarity_layer.py
Clarity Layer: local LLM pre-processor for user input.
Cleans, completes, and deambiguates input before it reaches the Claude API.
Falls back to passthrough if Ollama is unavailable — never blocks.
"""
import json
import os
import time
import urllib.error
import urllib.request
from typing import Optional

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
CLARITY_MODEL = os.getenv("CLARITY_MODEL", "qwen2.5:7b")

CLARITY_SYSTEM_PROMPT = """You are a precision input processor. Your only job:
1. Fix typos and grammatical errors silently
2. Expand abbreviations to full terms
3. Resolve ambiguous pronouns using prior context
4. Complete incomplete sentences into full instructions
5. If input is already clear and complete, return it unchanged

RULES:
- Output ONLY the cleaned input text. No commentary. No explanation.
- Never add information not implied by the input
- Never change the meaning or intent
- If genuinely ambiguous with no resolution possible, prepend: [AMBIGUOUS: <question>]
- Max output length: same as input length ± 20%"""


def _ollama_available() -> bool:
    try:
        req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def _call_ollama(text: str, context: Optional[str] = None) -> str:
    messages = [{"role": "system", "content": CLARITY_SYSTEM_PROMPT}]
    if context:
        messages.append({"role": "user", "content": f"Context: {context}"})
        messages.append({"role": "assistant", "content": "Understood."})
    messages.append({"role": "user", "content": text})

    payload = json.dumps({
        "model": CLARITY_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 2048},
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.loads(r.read())
        return result["message"]["content"].strip()


def clarify(text: str, context: Optional[str] = None, force: bool = False) -> dict:
    """
    Run input through the Clarity Layer.
    Returns:
        {output, passthrough, latency_ms, input_chars, output_chars}
    """
    start = time.monotonic()
    input_chars = len(text)

    # Skip for short, clearly structured inputs
    if not force and len(text) < 50:
        return {
            "output": text, "passthrough": True,
            "latency_ms": 0, "input_chars": input_chars, "output_chars": len(text),
        }

    # Skip if Ollama unavailable (unless forced)
    if not force and not _ollama_available():
        return {
            "output": text, "passthrough": True,
            "latency_ms": 0, "input_chars": input_chars, "output_chars": len(text),
        }

    try:
        cleaned = _call_ollama(text, context)
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            "output": cleaned, "passthrough": False,
            "latency_ms": latency_ms,
            "input_chars": input_chars, "output_chars": len(cleaned),
        }
    except Exception as e:
        return {
            "output": text, "passthrough": True,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "input_chars": input_chars, "output_chars": len(text),
            "error": str(e),
        }
