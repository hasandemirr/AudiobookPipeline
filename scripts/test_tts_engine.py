"""Standalone smoke test for the TTS engine layer (Sprint 1.1).
Loads the chatterbox engine, synthesizes one Turkish chunk, saves a wav,
unloads, and reports VRAM release.
Run from repo root:  .\\venv\\Scripts\\python.exe scripts\\test_tts_engine.py
"""
import sys
from pathlib import Path


def find_repo_root() -> Path:
    p = Path(__file__).resolve()
    while p != p.parent:
        if (p / ".gitignore").exists():
            return p
        p = p.parent
    raise RuntimeError("Repo root not found.")


REPO_ROOT = find_repo_root()
sys.path.insert(0, str(REPO_ROOT))  # make `src` package importable

import torch
import torchaudio as ta

from src.tts.registry import get_engine

TEXT = "Sistem testi başarılı. Türkçe ses üretimi gerçekleştiriliyor."
assert len(TEXT) <= 280, f"Text too long: {len(TEXT)}"

OUT = REPO_ROOT / "workspace" / "_tts_smoke" / "test_output.wav"
OUT.parent.mkdir(parents=True, exist_ok=True)


def vram() -> int:
    return torch.cuda.memory_allocated() if torch.cuda.is_available() else 0


def main() -> None:
    engine = get_engine("chatterbox")
    print("health (before load):", engine.health())

    base = vram()
    engine.load()
    after_load = vram()
    print("health (after load): ", engine.health())
    print(f"VRAM base={base} after_load={after_load}")
    assert engine.is_loaded

    wav, sr = engine.synthesize(TEXT, language_id="tr")
    ta.save(str(OUT), wav, sr)
    dur = wav.shape[-1] / sr
    print(f"Synthesized {dur:.2f}s @ {sr} Hz -> {OUT}")
    assert OUT.exists() and dur > 0

    engine.unload()
    after_unload = vram()
    print("health (after unload):", engine.health())
    print(f"VRAM after_unload={after_unload}")
    assert not engine.is_loaded

    if torch.cuda.is_available():
        if after_unload < after_load:
            print(f"VRAM released: {after_load} -> {after_unload}")
        else:
            print(f"WARN: VRAM did not drop ({after_load} -> {after_unload})")
    else:
        print("CPU mode: VRAM check skipped.")

    print("TEST PASSED")


if __name__ == "__main__":
    main()
