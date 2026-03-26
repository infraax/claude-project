#!/usr/bin/env python3
"""
mcp/compress_cli.py
CLI bridge called by dispatch-runner.ts via spawnSync.
Reads JSON from stdin, runs clarity or llmlingua, writes JSON to stdout.
Always exits 0 — caller treats non-zero or invalid JSON as passthrough.
"""
import json
import sys
import os

# Add mcp/ to path so clarity_layer / prompt_cache can be imported directly
sys.path.insert(0, os.path.dirname(__file__))


def run_clarity(text: str) -> dict:
    try:
        from clarity_layer import clarify  # type: ignore
        result = clarify(text)
        return {"output": result["output"], "latency_ms": result.get("latency_ms", 0)}
    except Exception as e:
        return {"output": text, "error": str(e), "passthrough": True}


def run_llmlingua(text: str, task_type: str = "code_gen", ratio: float = 0.5) -> dict:
    try:
        # LLMLingua is loaded lazily in the venv; fail gracefully if unavailable
        from llmlingua import PromptCompressor  # type: ignore
        compressor = PromptCompressor(
            model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
            use_llmlingua2=True,
            device_map="cpu",
        )
        result = compressor.compress_prompt(text, rate=ratio, force_tokens=["\n", ".", "!", "?", ","])
        compressed = result.get("compressed_prompt", text)
        return {"output": compressed if compressed else text, "latency_ms": 0}
    except Exception as e:
        return {"output": text, "error": str(e), "passthrough": True}


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        # Bad JSON input — passthrough impossible, write empty and exit 1
        sys.exit(1)

    mode = data.get("mode", "clarity")
    text = data.get("text", "")

    if not text:
        print(json.dumps({"output": text}))
        return

    if mode == "clarity":
        result = run_clarity(text)
    elif mode == "llmlingua":
        result = run_llmlingua(
            text,
            task_type=data.get("task_type", "code_gen"),
            ratio=float(data.get("ratio", 0.5)),
        )
    else:
        result = {"output": text, "passthrough": True}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
