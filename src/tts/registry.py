from .engines.base import BaseTTSEngine
from .engines.chatterbox import ChatterboxEngine

# Explicit engine registry. Add a new engine = add one line here.
ENGINES: dict[str, type[BaseTTSEngine]] = {
    "chatterbox": ChatterboxEngine,
}


def get_engine(engine_id: str) -> BaseTTSEngine:
    """Return a NEW engine instance. Caller owns lifecycle (load/unload)."""
    if engine_id not in ENGINES:
        raise ValueError(f"Unknown engine: {engine_id}")
    return ENGINES[engine_id]()
