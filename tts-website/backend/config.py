"""
Every environment-driven setting the backend has, resolved once at import.

Kept deliberately dependency-free (no pydantic-settings) and deliberately
separate from application logic: the AI section in particular is pure provider
configuration, so a different model or host is an env change, not a code change.

Environment variables
---------------------
ALLOWED_ORIGINS      comma-separated CORS origins
TRUST_PROXY          "1" when a reverse proxy (Render, Fly, nginx) sets
                     X-Forwarded-For; "0" when the app is exposed directly
MAX_UPLOAD_BYTES     hard cap on any single uploaded file
MAX_REQUEST_BYTES    hard cap on a whole request body
MAX_TEXT_CHARS       hard cap on pasted text for the analysis tools
MAX_TTS_CHARS        hard cap on text sent to the speech engine
RATE_LIMIT_*         window and per-window request budgets
AI_PROVIDER          "none" | "ollama" | "openai-compatible"
AI_BASE_URL          e.g. http://127.0.0.1:11434 or https://api.groq.com/openai
AI_MODEL             e.g. llama3.1:8b, qwen2.5:7b-instruct, mistral-small
AI_API_KEY           only needed by hosted OpenAI-compatible endpoints
AI_TIMEOUT_SECONDS   per-request timeout for the model call
AI_MAX_INPUT_CHARS   how much user text is allowed into a prompt
AI_MAX_OUTPUT_TOKENS generation cap
"""

from dataclasses import dataclass, field
import os

MEGABYTE = 1024 * 1024


def _env(name: str, default: str = "") -> str:
    """os.getenv, but an empty or whitespace-only value counts as unset."""
    value = os.getenv(name)
    return value.strip() if value and value.strip() else default


def _int_env(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    return _env(name, "1" if default else "0").lower() in {"1", "true", "yes", "on"}


def _list_env(name: str, default: list[str]) -> list[str]:
    raw = _env(name)
    if not raw:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# Production origins plus the local dev servers. The localhost entries stay in
# the default so a developer can always run the frontend against a deployed
# backend; set ALLOWED_ORIGINS in production to drop them.
DEFAULT_ORIGINS = [
    "http://localhost:5174",
    "https://voiceforge-toolkit.vercel.app",
    "https://texttospeechin.vercel.app",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
]


@dataclass(frozen=True)
class AiSettings:
    """Provider configuration only — no prompts, no task logic."""

    provider: str = "none"
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    timeout_seconds: float = 45.0
    max_input_chars: int = 12_000
    max_output_tokens: int = 700
    temperature: float = 0.4

    @property
    def configured(self) -> bool:
        """A provider is usable only if it has somewhere to go and something to run."""
        if self.provider in ("", "none"):
            return False
        return bool(self.base_url and self.model)


@dataclass(frozen=True)
class Settings:
    allowed_origins: list[str] = field(default_factory=lambda: list(DEFAULT_ORIGINS))
    trust_proxy: bool = True

    max_upload_bytes: int = 8 * MEGABYTE
    max_request_bytes: int = 12 * MEGABYTE
    max_text_chars: int = 200_000
    # Synthesis is the one route where a long input costs minutes of upstream
    # work rather than milliseconds of ours, so it gets a tighter cap of its own:
    # ~20k characters is around 20 minutes of speech.
    max_tts_chars: int = 20_000

    rate_limit_window: int = 60
    rate_limit_default: int = 90
    rate_limit_heavy: int = 20
    rate_limit_ai: int = 8

    log_level: str = "INFO"
    ai: AiSettings = field(default_factory=AiSettings)


def load_settings() -> Settings:
    """Read the environment once. Called at import; re-callable in tests."""
    return Settings(
        allowed_origins=_list_env("ALLOWED_ORIGINS", DEFAULT_ORIGINS),
        trust_proxy=_bool_env("TRUST_PROXY", True),
        max_upload_bytes=_int_env("MAX_UPLOAD_BYTES", 8 * MEGABYTE),
        max_request_bytes=_int_env("MAX_REQUEST_BYTES", 12 * MEGABYTE),
        max_text_chars=_int_env("MAX_TEXT_CHARS", 200_000),
        max_tts_chars=_int_env("MAX_TTS_CHARS", 20_000),
        rate_limit_window=_int_env("RATE_LIMIT_WINDOW", 60),
        rate_limit_default=_int_env("RATE_LIMIT_DEFAULT", 90),
        rate_limit_heavy=_int_env("RATE_LIMIT_HEAVY", 20),
        rate_limit_ai=_int_env("RATE_LIMIT_AI", 8),
        log_level=_env("LOG_LEVEL", "INFO").upper(),
        ai=AiSettings(
            provider=_env("AI_PROVIDER", "none").lower(),
            base_url=_env("AI_BASE_URL").rstrip("/"),
            model=_env("AI_MODEL"),
            api_key=_env("AI_API_KEY"),
            timeout_seconds=_float_env("AI_TIMEOUT_SECONDS", 45.0),
            max_input_chars=_int_env("AI_MAX_INPUT_CHARS", 12_000),
            max_output_tokens=_int_env("AI_MAX_OUTPUT_TOKENS", 700),
            temperature=_float_env("AI_TEMPERATURE", 0.4),
        ),
    )


settings = load_settings()
