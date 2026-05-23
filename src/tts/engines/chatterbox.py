import gc

import torch
from torch import Tensor

from chatterbox.mtl_tts import ChatterboxMultilingualTTS

from .base import BaseTTSEngine

# Chatterbox hard limit is 300 chars per chunk.
MAX_CHARS = 300


class ChatterboxEngine(BaseTTSEngine):
    """Adapter wrapping ChatterboxMultilingualTTS."""

    name = "chatterbox"

    def __init__(self) -> None:
        super().__init__()
        self._model = None

    def load(self) -> None:
        if self.is_loaded:
            return
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._model = ChatterboxMultilingualTTS.from_pretrained(device=self.device)
        self.sample_rate = self._model.sr
        self.is_loaded = True

    def unload(self) -> None:
        if not self.is_loaded:
            return
        del self._model
        self._model = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        self.is_loaded = False

    def synthesize(
        self,
        text: str,
        *,
        language_id: str,
        audio_prompt_path: str | None = None,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        temperature: float = 0.8,
    ) -> tuple[Tensor, int]:
        if not self.is_loaded:
            raise RuntimeError("Engine not loaded. Call load() first.")
        if len(text) > MAX_CHARS:
            raise ValueError(f"Text exceeds {MAX_CHARS} chars: {len(text)}")

        # Mirror render_chunks.py: omit audio_prompt_path entirely when None.
        kwargs = {
            "language_id": language_id,
            "exaggeration": exaggeration,
            "cfg_weight": cfg_weight,
            "temperature": temperature,
        }
        if audio_prompt_path:
            kwargs["audio_prompt_path"] = audio_prompt_path

        wav = self._model.generate(text, **kwargs)
        return wav, self.sample_rate
