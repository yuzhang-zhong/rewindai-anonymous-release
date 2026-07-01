from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
import httpx

from utils.llm.models.data import ModelResponse

load_dotenv()


engine_constructor = {
    "gpt-4o-mini-2024-07-18": ChatOpenAI,
    "gpt-3.5-turbo-0125": ChatOpenAI,
    "gpt-4o": ChatOpenAI,
}

llama_models = {
    "meta-llama/Llama-3.1-8B-Instruct",
    "meta-llama/Llama-3.1-70B-Instruct",
}


class GeminiApiKeyEngine:
    """Small Gemini API-key engine compatible with the existing invoke wrapper."""

    def __init__(self, model_name: str, api_key: str, **kwargs):
        if not api_key:
            raise ValueError("Google API key is required.")
        self.model_name = model_name
        self.api_key = api_key
        self.kwargs = kwargs

    def invoke(self, prompt, **kwargs) -> ModelResponse:
        config_params = {**self.kwargs, **kwargs}
        generation_config = {}
        if "temperature" in config_params:
            generation_config["temperature"] = config_params["temperature"]
        if "max_output_tokens" in config_params:
            generation_config["maxOutputTokens"] = config_params["max_output_tokens"]
        if "max_tokens" in config_params:
            generation_config["maxOutputTokens"] = config_params["max_tokens"]

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": str(prompt)}],
                }
            ],
        }
        if generation_config:
            payload["generationConfig"] = generation_config

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model_name}:generateContent"
        )
        response = httpx.post(
            url,
            params={"key": self.api_key},
            json=payload,
            timeout=45,
        )
        response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise ValueError("Gemini returned no candidates.")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts)
        return ModelResponse(text)


class OpenAICompatibleApiKeyEngine:
    """Direct OpenAI-compatible chat completions engine without LangChain overhead."""

    def __init__(
        self,
        model_name: str,
        api_key: str,
        base_url: str,
        timeout: float = 20,
        **kwargs,
    ):
        if not api_key:
            raise ValueError("API key is required.")
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.kwargs = kwargs

    def invoke(self, prompt, **kwargs) -> ModelResponse:
        config_params = {**self.kwargs, **kwargs}
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": str(prompt)}],
            "temperature": config_params.get("temperature", 0.0),
        }
        token_limit = (
            config_params.get("max_tokens")
            or config_params.get("max_output_tokens")
            or config_params.get("max_tokens_to_sample")
        )
        if token_limit:
            payload["max_tokens"] = token_limit

        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise ValueError("Provider returned no choices.")
        message = choices[0].get("message") or {}
        return ModelResponse(message.get("content", ""))

def get_engine(model_name, **kwargs):
    """
    Creates and returns a language model engine based on the specified model name.

    Args:
        model_name (str): Name of the model to initialize. Supported models:
            - OpenAI models: gpt-4o-mini, gpt-3.5-turbo-0125, gpt-4o
            - Llama models: meta-llama/Llama-3.1-8B-Instruct, meta-llama/Llama-3.1-70B-Instruct
            - DeepSeek models: deepseek-ai/DeepSeek-V3 (671B parameter model)
            - Claude models: via Vertex AI
            - Gemini models: via Vertex AI
        **kwargs: Additional keyword arguments to pass to the model constructor.
            - temperature: Float between 0 and 1 (default: 0.0)
            - max_tokens/max_output_tokens: Maximum number of tokens in the response (default: 4096)
                Note: This will be mapped to the appropriate parameter name for each model:
                - OpenAI/Llama/DeepSeek: max_tokens
                - Gemini: max_output_tokens
                - Claude: max_tokens_to_sample

    Returns:
        LangChain chat model instance or custom engine configured with the specified parameters
    """
    provider = (kwargs.pop("provider", "") or "").strip().lower()
    api_key = kwargs.pop("api_key", None)

    # Set default temperature if not provided
    if "temperature" not in kwargs:
        kwargs["temperature"] = 0.0

    # Standardize max token handling
    max_tokens = kwargs.pop("max_tokens", None)
    max_output_tokens = kwargs.pop("max_output_tokens", None)
    max_tokens_to_sample = kwargs.pop("max_tokens_to_sample", None)
    
    # Use the first non-None value in order of precedence
    token_limit = max_output_tokens or max_tokens or max_tokens_to_sample or 4096
        
    if model_name == "gpt-4o-mini":
        model_name = "gpt-4o-mini-2024-07-18"

    if provider == "google":
        kwargs["max_output_tokens"] = token_limit
        return GeminiApiKeyEngine(
            model_name=model_name or "gemini-1.5-flash",
            api_key=api_key,
            **kwargs,
        )

    if provider == "deepseek" or model_name == "deepseek-chat":
        kwargs["max_tokens"] = token_limit
        return OpenAICompatibleApiKeyEngine(
            model_name=model_name or "deepseek-chat",
            api_key=api_key,
            base_url="https://api.deepseek.com",
            timeout=kwargs.pop("timeout", 20),
            **kwargs,
        )
    
    # Provider-specific packages are imported lazily so an OpenAI-only deployment
    # does not fail startup because optional Vertex/Together dependencies changed.
    if model_name in llama_models:
        from langchain_together import ChatTogether

        kwargs["max_tokens"] = token_limit
        return ChatTogether(model_name=model_name, **kwargs)

    # Handle Claude models via Vertex AI
    if "claude" in model_name.lower():
        from utils.llm.models.claude import ClaudeVertexEngine

        kwargs["max_tokens_to_sample"] = token_limit
        return ClaudeVertexEngine(model_name=model_name, **kwargs)
    
    # Handle Gemini models via Vertex AI
    if "gemini" in model_name.lower():
        from utils.llm.models.gemini import GeminiVertexEngine

        kwargs["max_output_tokens"] = token_limit
        return GeminiVertexEngine(model_name=model_name, **kwargs)
        
    # Handle DeepSeek models
    if "deepseek" in model_name.lower():
        from utils.llm.models.deepseek import DeepSeekEngine

        kwargs["max_tokens"] = token_limit
        return DeepSeekEngine(model_name=model_name, **kwargs)
    
    # For other models (OpenAI, Llama), use max_tokens
    kwargs["max_tokens"] = token_limit
    kwargs["model_name"] = model_name
    kwargs.setdefault("timeout", 25)
    kwargs.setdefault("max_retries", 1)
    if api_key:
        kwargs["openai_api_key"] = api_key
    return engine_constructor[model_name](**kwargs)

def invoke_engine(engine, prompt, **kwargs) -> ModelResponse:
    """
    Simple wrapper to invoke a language model engine and return its response.

    Args:
        engine: The language model engine to use
        prompt: The input prompt to send to the model
        **kwargs: Additional keyword arguments for the model invocation

    Returns:
        str: The model's response text
    """
    return engine.invoke(prompt, **kwargs).content
