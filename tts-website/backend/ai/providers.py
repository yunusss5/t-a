"""
Model transports.

Two are enough to cover the field: a native Ollama client for a self-hosted
model on a laptop or a private box, and an OpenAI-compatible client, which is
the shape llama.cpp, vLLM, LM Studio, TGI, Groq, Together and OpenRouter all
speak. Neither knows anything about this app's prompts or tasks — swapping the
provider is a config change, and adding one means adding a class here.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
import json
import logging

import httpx

from config import AiSettings

logger = logging.getLogger("voiceforge.ai")

Message = dict[str, str]


class AiUnavailable(RuntimeError):
    """No provider configured, or the configured one cannot be reached."""


class AiFailed(RuntimeError):
    """The provider answered, but not with something usable."""


@dataclass
class ProviderReply:
    text: str
    model: str


class BaseProvider:
    kind = "none"

    def __init__(self, config: AiSettings):
        self.config = config

    @property
    def model(self) -> str:
        return self.config.model

    def _client(self) -> httpx.AsyncClient:
        # A fresh client per call: these are seconds-long requests at single-digit
        # QPS, so pooling buys nothing and a long-lived client would pin sockets
        # to a model host that may be a laptop that went to sleep.
        return httpx.AsyncClient(timeout=self.config.timeout_seconds)

    async def complete(self, messages: list[Message], *, temperature: float | None = None,
                       max_tokens: int | None = None) -> ProviderReply:
        raise AiUnavailable("No AI provider is configured.")

    async def stream(self, messages: list[Message], *, temperature: float | None = None,
                     max_tokens: int | None = None) -> AsyncIterator[str]:
        raise AiUnavailable("No AI provider is configured.")
        yield ""  # pragma: no cover - makes this an async generator

    async def health(self) -> dict:
        return {"reachable": False, "detail": "No AI provider is configured."}


class NullProvider(BaseProvider):
    """Stands in when AI_PROVIDER is unset, so callers never branch on None."""


class OllamaProvider(BaseProvider):
    """Native Ollama chat API — no API key, streams newline-delimited JSON."""

    kind = "ollama"

    def _payload(self, messages, temperature, max_tokens, stream):
        return {
            "model": self.config.model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": self.config.temperature if temperature is None else temperature,
                "num_predict": max_tokens or self.config.max_output_tokens,
            },
        }

    async def complete(self, messages, *, temperature=None, max_tokens=None) -> ProviderReply:
        url = f"{self.config.base_url}/api/chat"
        try:
            async with self._client() as client:
                response = await client.post(
                    url, json=self._payload(messages, temperature, max_tokens, False)
                )
        except httpx.HTTPError as error:
            raise AiUnavailable(f"Could not reach the model host: {type(error).__name__}") from error

        if response.status_code == 404:
            raise AiUnavailable(f"The model '{self.config.model}' is not pulled on that host.")
        if response.status_code >= 400:
            raise AiFailed(f"Model host returned {response.status_code}.")

        body = response.json()
        text = (body.get("message") or {}).get("content", "")
        if not text.strip():
            raise AiFailed("The model returned an empty response.")
        return ProviderReply(text=text.strip(), model=body.get("model", self.config.model))

    async def stream(self, messages, *, temperature=None, max_tokens=None) -> AsyncIterator[str]:
        url = f"{self.config.base_url}/api/chat"
        try:
            async with self._client() as client:
                async with client.stream(
                    "POST", url, json=self._payload(messages, temperature, max_tokens, True)
                ) as response:
                    if response.status_code >= 400:
                        raise AiFailed(f"Model host returned {response.status_code}.")
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        piece = (chunk.get("message") or {}).get("content", "")
                        if piece:
                            yield piece
                        if chunk.get("done"):
                            return
        except httpx.HTTPError as error:
            raise AiUnavailable(f"Could not reach the model host: {type(error).__name__}") from error

    async def health(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.config.base_url}/api/tags")
        except httpx.HTTPError as error:
            return {"reachable": False, "detail": f"Unreachable ({type(error).__name__})."}

        if response.status_code >= 400:
            return {"reachable": False, "detail": f"Host returned {response.status_code}."}

        names = [item.get("name", "") for item in response.json().get("models", [])]
        # Ollama reports "llama3.1:8b"; a config of "llama3.1" is the same model.
        has_model = any(name == self.config.model or name.startswith(f"{self.config.model}:")
                        for name in names)
        return {
            "reachable": True,
            "model_pulled": has_model,
            "detail": None if has_model else f"'{self.config.model}' is not pulled on that host.",
        }


class OpenAICompatibleProvider(BaseProvider):
    """/v1/chat/completions — the shape most local servers and hosts expose."""

    kind = "openai-compatible"

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        # Server-side only. The key is read from the environment in config.py and
        # never leaves this process in a response body.
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    def _payload(self, messages, temperature, max_tokens, stream):
        return {
            "model": self.config.model,
            "messages": messages,
            "stream": stream,
            "temperature": self.config.temperature if temperature is None else temperature,
            "max_tokens": max_tokens or self.config.max_output_tokens,
        }

    async def complete(self, messages, *, temperature=None, max_tokens=None) -> ProviderReply:
        url = f"{self.config.base_url}/v1/chat/completions"
        try:
            async with self._client() as client:
                response = await client.post(
                    url,
                    json=self._payload(messages, temperature, max_tokens, False),
                    headers=self._headers(),
                )
        except httpx.HTTPError as error:
            raise AiUnavailable(f"Could not reach the model host: {type(error).__name__}") from error

        if response.status_code in (401, 403):
            raise AiUnavailable("The model host rejected the configured credentials.")
        if response.status_code == 429:
            raise AiUnavailable("The model host is rate limiting this key. Try again shortly.")
        if response.status_code >= 400:
            raise AiFailed(f"Model host returned {response.status_code}.")

        body = response.json()
        choices = body.get("choices") or []
        text = (choices[0].get("message") or {}).get("content", "") if choices else ""
        if not text.strip():
            raise AiFailed("The model returned an empty response.")
        return ProviderReply(text=text.strip(), model=body.get("model", self.config.model))

    async def stream(self, messages, *, temperature=None, max_tokens=None) -> AsyncIterator[str]:
        url = f"{self.config.base_url}/v1/chat/completions"
        try:
            async with self._client() as client:
                async with client.stream(
                    "POST", url,
                    json=self._payload(messages, temperature, max_tokens, True),
                    headers=self._headers(),
                ) as response:
                    if response.status_code >= 400:
                        raise AiFailed(f"Model host returned {response.status_code}.")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        for choice in chunk.get("choices", []):
                            piece = (choice.get("delta") or {}).get("content")
                            if piece:
                                yield piece
        except httpx.HTTPError as error:
            raise AiUnavailable(f"Could not reach the model host: {type(error).__name__}") from error

    async def health(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.config.base_url}/v1/models", headers=self._headers()
                )
        except httpx.HTTPError as error:
            return {"reachable": False, "detail": f"Unreachable ({type(error).__name__})."}

        # 401/403 still proves something is listening; the credentials are the
        # problem, and saying so is more useful than "unreachable".
        if response.status_code in (401, 403):
            return {"reachable": True, "model_pulled": None,
                    "detail": "Reachable, but the credentials were rejected."}
        if response.status_code >= 400:
            return {"reachable": False, "detail": f"Host returned {response.status_code}."}
        return {"reachable": True, "model_pulled": None, "detail": None}


PROVIDERS = {
    "ollama": OllamaProvider,
    "openai-compatible": OpenAICompatibleProvider,
    "openai": OpenAICompatibleProvider,  # alias
    "none": NullProvider,
    "": NullProvider,
}


def build_provider(config: AiSettings) -> BaseProvider:
    """Resolve AI_PROVIDER to a transport. Unknown names degrade to no AI."""
    provider_class = PROVIDERS.get(config.provider)

    if provider_class is None:
        logger.warning("Unknown AI_PROVIDER %r — AI features stay switched off.", config.provider)
        return NullProvider(config)
    if provider_class is not NullProvider and not config.configured:
        logger.warning("AI_PROVIDER=%s needs both AI_BASE_URL and AI_MODEL.", config.provider)
        return NullProvider(config)

    return provider_class(config)
