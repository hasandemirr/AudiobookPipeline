"""FastAPI TTS service (Sprint 1.2a).

Lazy, single-engine. The model is NOT loaded on startup; it is loaded only via
POST /engines/load and freed via POST /engines/unload. Run standalone:
    .\\venv\\Scripts\\python.exe -m uvicorn src.tts.app:app --port 5001
"""
import io
from contextlib import asynccontextmanager
from pathlib import Path

import torchaudio as ta
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .engines.base import BaseTTSEngine
from .registry import ENGINES, get_engine

MAX_CHARS = 300  # Chatterbox hard limit

# pynvml is optional (no GPU -> vram reported as null)
try:
    import pynvml
    pynvml.nvmlInit()
    _NVML = True
except Exception:
    _NVML = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.engine = None  # type: BaseTTSEngine | None
    app.state.engine_id = None
    yield
    eng = getattr(app.state, "engine", None)
    if eng is not None:
        eng.unload()
    if _NVML:
        try: pynvml.nvmlShutdown()
        except Exception: pass


app = FastAPI(title="AudiobookPipeline TTS", lifespan=lifespan)


class LoadRequest(BaseModel):
    engine_id: str = "chatterbox"


class RenderRequest(BaseModel):
    text: str
    language_id: str = "tr"
    audio_prompt_path: str | None = None
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    temperature: float = 0.8


def _vram() -> dict | None:
    if not _NVML:
        return None
    try:
        h = pynvml.nvmlDeviceGetHandleByIndex(0)
        m = pynvml.nvmlDeviceGetMemoryInfo(h)
        used_pct = round(m.used / m.total * 100, 1) if m.total else 0.0
        return {"total": m.total, "used": m.used, "free": m.free, "used_percent": used_pct}
    except Exception:
        return None


def _engine_block(app: FastAPI) -> dict | None:
    eng = app.state.engine
    if eng is None:
        return None
    return {
        "name": eng.name,
        "is_loaded": eng.is_loaded,
        "device": eng.device,
        "sample_rate": eng.sample_rate,
    }


@app.get("/health")
def health():
    return {"status": "ok", "engine": _engine_block(app), "vram": _vram()}


@app.get("/engines")
def engines():
    return {"available": list(ENGINES.keys()), "loaded": app.state.engine_id}


@app.post("/engines/load")
def load_engine(req: LoadRequest):
    try:
        new_engine = get_engine(req.engine_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Unknown engine: {req.engine_id}")
    # single-engine: unload current before loading a different one
    if app.state.engine is not None and app.state.engine_id != req.engine_id:
        app.state.engine.unload()
        app.state.engine = None
        app.state.engine_id = None
    if app.state.engine is None:
        new_engine.load()
        app.state.engine = new_engine
        app.state.engine_id = req.engine_id
    return {"status": "loaded", "engine": _engine_block(app), "vram": _vram()}


@app.post("/engines/unload")
def unload_engine():
    if app.state.engine is not None:
        app.state.engine.unload()
        app.state.engine = None
        app.state.engine_id = None
    return {"status": "unloaded", "engine": _engine_block(app), "vram": _vram()}


@app.post("/render")
def render(req: RenderRequest):
    if app.state.engine is None or not app.state.engine.is_loaded:
        raise HTTPException(status_code=409, detail="No engine loaded. Call /engines/load first.")
    if len(req.text) > MAX_CHARS:
        raise HTTPException(status_code=422, detail=f"Text exceeds {MAX_CHARS} chars: {len(req.text)}")
    if req.audio_prompt_path and not Path(req.audio_prompt_path).exists():
        raise HTTPException(status_code=422, detail=f"audio_prompt_path not found: {req.audio_prompt_path}")
    wav, sr = app.state.engine.synthesize(
        req.text,
        language_id=req.language_id,
        audio_prompt_path=req.audio_prompt_path,
        exaggeration=req.exaggeration,
        cfg_weight=req.cfg_weight,
        temperature=req.temperature,
    )
    buf = io.BytesIO()
    ta.save(buf, wav, sr, format="wav")
    return Response(content=buf.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001)
