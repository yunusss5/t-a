"""
The AI layer, in three pieces that do not know about each other's concerns:

    providers.py  how to talk to a model host (Ollama, OpenAI-compatible)
    prompts.py    how user text is fenced, sanitised and framed
    service.py    the tasks the app offers, and what a usable answer looks like

Only service.py is imported by the API. Swapping models means editing config;
adding a host means adding a class to providers.py. Nothing above this package
constructs a prompt or parses a model reply.
"""

from .providers import AiFailed, AiUnavailable
from .service import AiInputRejected

__all__ = ["AiFailed", "AiUnavailable", "AiInputRejected"]
