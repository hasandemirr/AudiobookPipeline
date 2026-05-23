from abc import ABC, abstractmethod
from torch import Tensor


class BaseTTSEngine(ABC):
    """Contract every TTS engine adapter must implement."""

    name: str = "base"

    def __init__(self) -> None:
        self.is_loaded: bool = False
        self.device: str = "cpu"
        self.sample_rate: int = 24000

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory. Idempotent: no-op if already loaded."""

    @abstractmethod
    def unload(self) -> None:
        """Free the model and VRAM. Idempotent: no-op if not loaded."""

    @abstractmethod
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
        """Synthesize a single chunk. Returns (waveform, sample_rate)."""

    def health(self) -> dict:
        return {
            "engine": self.name,
            "is_loaded": self.is_loaded,
            "device": self.device,
            "sample_rate": self.sample_rate,
        }
