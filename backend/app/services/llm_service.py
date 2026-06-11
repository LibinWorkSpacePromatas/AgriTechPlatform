from __future__ import annotations

import logging
import json
from typing import Any, Dict, List

from app.core.config import get_settings

try:
    import httpx
except ModuleNotFoundError:
    httpx = None

logger = logging.getLogger(__name__)
settings = get_settings()


class LLMServiceError(Exception):
    """Base error for upstream LLM failures."""


class LLMRateLimitError(LLMServiceError):
    """Raised when the upstream model provider is rate limited."""


class LLMAuthenticationError(LLMServiceError):
    """Raised when the upstream API credentials are invalid."""


class LLMUpstreamError(LLMServiceError):
    """Raised for non-auth, non-rate-limit upstream failures."""


class LLMService:
    def __init__(self) -> None:
        self.api_key = settings.openai_api_key
        self.model = settings.openai_model
        self.base_url = "https://api.openai.com/v1/chat/completions"

    async def generate_response(self, prompt: str, system_prompt: str = "") -> str:
        """
        Generates a response from OpenAI Chat Completions API.
        """
        if httpx is None:
            logger.warning("httpx is not installed. OpenAI requests are disabled.")
            return "I'm sorry, but the AI insights client dependency is not installed on this backend yet."

        if not self.api_key:
            logger.warning("OpenAI API key not configured. Returning fallback message.")
            return "I'm sorry, but my AI insights engine is currently not configured with an API key."

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1000
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(self.base_url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                
                if "choices" in data and len(data["choices"]) > 0:
                    return data["choices"][0]["message"]["content"]
                else:
                    logger.error(f"Unexpected OpenAI response format: {data}")
                    return "Error generating AI response: Unexpected format."

        except Exception as e:
            if httpx is not None and isinstance(e, httpx.HTTPStatusError):
                logger.error(f"OpenAI HTTP error: {e.response.status_code} - {e.response.text}")
                if e.response.status_code == 429:
                    raise LLMRateLimitError("OpenAI rate limit reached.") from e
                if e.response.status_code in {401, 403}:
                    raise LLMAuthenticationError("OpenAI authentication failed.") from e
                raise LLMUpstreamError(f"OpenAI HTTP error: {e.response.status_code}") from e
            logger.error(f"Error calling OpenAI: {str(e)}")
            raise LLMUpstreamError("Error connecting to AI engine.") from e

llm_service = LLMService()
