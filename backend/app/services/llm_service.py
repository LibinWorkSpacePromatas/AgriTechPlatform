from __future__ import annotations

import logging
import json
import httpx
from typing import Any, Dict, List

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class LLMService:
    def __init__(self) -> None:
        self.api_key = settings.openrouter_api_key
        self.model = settings.openrouter_model
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"

    async def generate_response(self, prompt: str, system_prompt: str = "") -> str:
        """
        Generates a response from OpenRouter LLM.
        """
        if not self.api_key:
            logger.warning("OpenRouter API key not configured. Returning fallback message.")
            return "I'm sorry, but my AI insights engine is currently not configured with an API key."

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "http://localhost:4200", # Required by OpenRouter
            "X-Title": "AgriTech Platform", # Optional by OpenRouter
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
                    logger.error(f"Unexpected OpenRouter response format: {data}")
                    return "Error generating AI response: Unexpected format."

        except httpx.HTTPStatusError as e:
            logger.error(f"OpenRouter HTTP error: {e.response.status_code} - {e.response.text}")
            return f"Error generating AI response: HTTP {e.response.status_code}."
        except Exception as e:
            logger.error(f"Error calling OpenRouter: {str(e)}")
            return "Error connecting to AI engine."

llm_service = LLMService()
