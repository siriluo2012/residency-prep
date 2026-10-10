"""Claude API helper: structured JSON output with schema validation, retries, and prompt caching.

Every generation task calls `structured()` with a Pydantic model; we use tool-use with the model's
JSON schema as the tool input schema, which is the most reliable way to get strictly-typed output.
"""

from __future__ import annotations

import json
import time
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError
from rich.console import Console

from .config import get_settings

console = Console(stderr=True)
T = TypeVar("T", bound=BaseModel)


class ClaudeUnavailable(RuntimeError):
    pass


def _client():
    s = get_settings()
    if not s.anthropic_api_key:
        raise ClaudeUnavailable("ANTHROPIC_API_KEY is not set")
    import anthropic

    return anthropic.Anthropic(api_key=s.anthropic_api_key, max_retries=3)


def structured(
    *,
    system: str,
    user: str,
    output: type[T],
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    cache_system: bool = True,
    attempts: int = 3,
) -> tuple[T, dict[str, Any]]:
    """Return (parsed_output, usage). Raises after `attempts` validation failures."""
    s = get_settings()
    client = _client()
    model = model or s.rp_claude_model
    tool = {
        "name": "emit",
        "description": f"Emit a {output.__name__} object.",
        "input_schema": output.model_json_schema(),
    }
    sys_block: list[dict[str, Any]] = [{"type": "text", "text": system}]
    if cache_system:
        sys_block[0]["cache_control"] = {"type": "ephemeral"}

    messages: list[dict[str, Any]] = [{"role": "user", "content": user}]
    last_err: Exception | None = None
    for i in range(attempts):
        t0 = time.time()
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=sys_block,
            tools=[tool],
            tool_choice={"type": "tool", "name": "emit"},
            messages=messages,
        )
        usage = {
            "model": model,
            "input_tokens": resp.usage.input_tokens,
            "output_tokens": resp.usage.output_tokens,
            "cache_read": getattr(resp.usage, "cache_read_input_tokens", 0),
            "latency_s": round(time.time() - t0, 2),
        }
        block = next((b for b in resp.content if b.type == "tool_use"), None)
        if block is None:
            last_err = RuntimeError("no tool_use block in response")
        else:
            try:
                return output.model_validate(block.input), usage
            except ValidationError as e:
                last_err = e
                # feed the validation error back for a repair attempt
                messages += [
                    {"role": "assistant", "content": resp.content},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": f"Validation error: {e}",
                            },
                            {"type": "text", "text": "Fix the object so it validates, then emit again."},
                        ],
                    },
                ]
        console.log(f"[yellow]structured() attempt {i + 1} failed: {last_err}")
    raise RuntimeError(f"structured() failed after {attempts} attempts: {last_err}")


def text(*, system: str, user: str, model: str | None = None, max_tokens: int = 2048, temperature: float = 0.3) -> str:
    client = _client()
    resp = client.messages.create(
        model=model or get_settings().rp_claude_fast_model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in resp.content if b.type == "text")


def estimate_cost_usd(usage: dict[str, Any]) -> float:
    """Rough cost estimate; update rates when pricing changes."""
    rates = {
        "sonnet": (3.0, 15.0),
        "haiku": (1.0, 5.0),
        "opus": (15.0, 75.0),
    }
    model = usage.get("model", "")
    inp, out = next((r for k, r in rates.items() if k in model), (3.0, 15.0))
    return (usage.get("input_tokens", 0) * inp + usage.get("output_tokens", 0) * out) / 1e6


def dump(obj: Any) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False)
