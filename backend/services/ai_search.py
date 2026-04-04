from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict

import requests


class AiSearchError(Exception):
    pass


@dataclass
class AiSearchResult:
    answer: str
    query: str
    suggested_url: str

    def as_dict(self) -> Dict[str, str]:
        return {
            "answer": self.answer,
            "query": self.query,
            "suggested_url": self.suggested_url,
        }


_PROMPT_TEMPLATE = (
    "You are FinchWire AI assistant.\n"
    "Task: provide a short useful answer, a concise search query, and an optional suggested URL.\n"
    "Return ONLY JSON with this exact shape:\n"
    '{"answer":"...","query":"...","suggested_url":"..."}\n'
    "Rules:\n"
    "- answer: <= 120 words.\n"
    "- query: 4-12 words for search.\n"
    "- suggested_url: include only if you are confident and it is a valid http/https URL, else empty string.\n"
)

_URL_RE = re.compile(r"(https?://[^\s\"'<>]+)", re.IGNORECASE)


def _first_url(value: str) -> str:
    if not value:
        return ""
    match = _URL_RE.search(value)
    return match.group(1).strip() if match else ""


def _extract_json_block(text: str) -> Dict[str, Any]:
    text = str(text or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _normalize_result(prompt: str, raw_text: str) -> AiSearchResult:
    parsed = _extract_json_block(raw_text)
    answer = str(parsed.get("answer") or "").strip()
    query = str(parsed.get("query") or "").strip()
    suggested_url = str(parsed.get("suggested_url") or "").strip()

    if not answer:
        fallback = str(raw_text or "").strip()
        answer = fallback if fallback else "I could not generate a response."
    if not query:
        query = str(prompt or "").strip()
    if not suggested_url:
        suggested_url = _first_url(raw_text) or _first_url(prompt)

    if not query:
        query = "latest relevant coverage"

    return AiSearchResult(
        answer=answer[:1200],
        query=query[:256],
        suggested_url=suggested_url[:2048],
    )


def _request_json(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: int = 25) -> Dict[str, Any]:
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    except requests.RequestException as exc:
        raise AiSearchError(f"Provider request failed: {exc}") from exc

    if response.status_code >= 400:
        snippet = response.text[:300]
        raise AiSearchError(f"Provider HTTP {response.status_code}: {snippet}")

    try:
        data = response.json()
    except ValueError as exc:
        raise AiSearchError("Provider returned non-JSON response") from exc

    if not isinstance(data, dict):
        raise AiSearchError("Provider returned invalid JSON payload")
    return data


def _run_openai_compatible(
    prompt: str,
    api_key: str,
    *,
    endpoint: str,
    model_env: str,
    default_model: str,
) -> AiSearchResult:
    model = os.environ.get(model_env, default_model).strip() or default_model
    payload = {
        "model": model,
        "temperature": 0.25,
        "messages": [
            {"role": "system", "content": _PROMPT_TEMPLATE},
            {"role": "user", "content": str(prompt or "").strip()},
        ],
    }
    data = _request_json(
        endpoint,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        payload=payload,
    )

    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message", {})
        content = str(message.get("content") or "")
        return _normalize_result(prompt, content)
    raise AiSearchError("Provider response missing choices")


def _run_gemini(prompt: str, api_key: str) -> AiSearchResult:
    configured_model = os.environ.get("FINCHWIRE_GEMINI_MODEL", "").strip()
    models_to_try = [configured_model] if configured_model else ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-2.0-flash-exp"]
    
    last_exc = None
    for model in models_to_try:
        if not model: continue
        endpoint = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": _PROMPT_TEMPLATE}]},
                {"role": "model", "parts": [{"text": "Understood. I will act as the FinchWire AI assistant."}]},
                {"role": "user", "parts": [{"text": str(prompt or "").strip()}]}
            ],
            "generationConfig": {"temperature": 0.25},
        }
        try:
            data = _request_json(endpoint, headers={"Content-Type": "application/json"}, payload=payload)
            candidates = data.get("candidates")
            if isinstance(candidates, list) and candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                text_chunks = [str(part.get("text") or "") for part in parts if isinstance(part, dict)]
                return _normalize_result(prompt, "\n".join(text_chunks).strip())
            raise AiSearchError(f"Gemini response for '{model}' missing candidates")
        except AiSearchError as exc:
            last_exc = exc
            if "HTTP 404" in str(exc) or "not found" in str(exc).lower():
                continue # Try next model
            raise exc
            
    raise last_exc or AiSearchError("No Gemini models responded successfully")


def _run_anthropic(prompt: str, api_key: str) -> AiSearchResult:
    model = os.environ.get("FINCHWIRE_ANTHROPIC_MODEL", "claude-3-5-haiku-latest").strip() or "claude-3-5-haiku-latest"
    payload = {
        "model": model,
        "max_tokens": 450,
        "temperature": 0.25,
        "system": _PROMPT_TEMPLATE,
        "messages": [
            {"role": "user", "content": str(prompt or "").strip()},
        ],
    }
    data = _request_json(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        payload=payload,
    )
    content = data.get("content")
    if isinstance(content, list):
        text_chunks = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text_chunks.append(str(block.get("text") or ""))
        if text_chunks:
            return _normalize_result(prompt, "\n".join(text_chunks).strip())
    raise AiSearchError("Anthropic response missing text content")


def run_ai_search(prompt: str, provider: str, api_key: str) -> AiSearchResult:
    normalized_prompt = str(prompt or "").strip()
    normalized_provider = str(provider or "").strip().lower()
    normalized_key = str(api_key or "").strip()

    if not normalized_prompt:
        raise AiSearchError("Prompt is required")
    if not normalized_provider or normalized_provider == "none":
        raise AiSearchError("AI provider is not configured")
    if not normalized_key:
        raise AiSearchError("AI API key is not configured")

    if normalized_provider in {"openai", "groq", "grok"}:
        if normalized_provider == "openai":
            endpoint = "https://api.openai.com/v1/chat/completions"
            model_env = "FINCHWIRE_OPENAI_MODEL"
            default_model = "gpt-4.1-mini"
        elif normalized_provider == "groq":
            endpoint = "https://api.groq.com/openai/v1/chat/completions"
            model_env = "FINCHWIRE_GROQ_MODEL"
            default_model = "llama-3.1-8b-instant"
        else:
            endpoint = "https://api.x.ai/v1/chat/completions"
            model_env = "FINCHWIRE_GROK_MODEL"
            default_model = "grok-2-latest"

        return _run_openai_compatible(
            normalized_prompt,
            normalized_key,
            endpoint=endpoint,
            model_env=model_env,
            default_model=default_model,
        )

    if normalized_provider == "gemini":
        return _run_gemini(normalized_prompt, normalized_key)

    if normalized_provider == "anthropic":
        return _run_anthropic(normalized_prompt, normalized_key)

    raise AiSearchError(f"Unsupported AI provider: {normalized_provider}")
