import threading
from google import genai


def _is_rate_limit(exc: Exception) -> bool:
    try:
        from google.api_core.exceptions import ResourceExhausted
        if isinstance(exc, ResourceExhausted):
            return True
    except ImportError:
        pass
    msg = str(exc).upper()
    return "429" in msg or "RESOURCE_EXHAUSTED" in msg or "QUOTA_EXCEEDED" in msg


class GeminiKeyRotator:
    def __init__(self, api_keys: list):
        self._keys = api_keys
        self._index = 0
        self._lock = threading.Lock()

    def current_client(self):
        return genai.Client(api_key=self._keys[self._index])

    def rotate(self):
        with self._lock:
            self._index = (self._index + 1) % len(self._keys)

    def call_with_rotation(self, fn, max_attempts=None):
        """
        Call fn(client) rotating to the next key on every 429.
        Raises the last exception if all keys are exhausted.
        Non-429 exceptions propagate immediately.
        """
        if max_attempts is None:
            max_attempts = len(self._keys)
        last_exc = None
        for _ in range(max_attempts):
            try:
                return fn(self.current_client())
            except Exception as e:
                if _is_rate_limit(e):
                    print(f"[KeyRotator] 429 on key index {self._index}, rotating...")
                    self.rotate()
                    last_exc = e
                else:
                    raise
        raise last_exc


# Module-level singleton — shared by llm_engine.py and pdf_extractor.py
from chatbot import config as _config

gemini_rotator = (
    GeminiKeyRotator(_config.GOOGLE_API_KEYS)
    if _config.GOOGLE_API_KEYS else None
)
