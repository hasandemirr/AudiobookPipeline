import sys, json, torch, torchaudio as ta, traceback
from pathlib import Path
from datetime import datetime

sys.path.insert(0, r"C:\AI\chatterbox\src")
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

def load_manifest(book_slug: str) -> dict:
    path = Path("workspace") / book_slug / "manifest.json"
    assert path.exists(), f"Manifest bulunamadı: {path}"
    return json.loads(path.read_text(encoding="utf-8"))

def save_manifest(book_slug: str, manifest: dict):
    path = Path("workspace") / book_slug / "manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

def render(book_slug: str, reference_voice: str = None, language_id: str = "tr",
           exaggeration: float = 0.5, cfg_weight: float = 0.5, temperature: float = 0.8):

    manifest = load_manifest(book_slug)
    pending = [c for c in manifest["chunks"] if c["status"] in ("pending", "failed")]
    
    if not pending:
        print("Render edilecek chunk yok. Manifest zaten tamamlanmış.")
        return

    print(f"Model yükleniyor... Device: {DEVICE}")
    model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)

    audio_dir = Path("workspace") / book_slug / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    chunk_dir = Path("workspace") / book_slug / "chunks"

    kwargs = {"language_id": language_id, "exaggeration": exaggeration,
              "cfg_weight": cfg_weight, "temperature": temperature}
    if reference_voice and Path(reference_voice).exists():
        kwargs["audio_prompt_path"] = reference_voice
        print(f"Reference voice: {reference_voice}")

    total = len(pending)
    for i, chunk_meta in enumerate(pending):
        chunk_id = chunk_meta["id"]
        txt_path = chunk_dir / f"{chunk_id}.txt"
        wav_path = audio_dir / f"{chunk_id}.wav"

        print(f"[{i+1}/{total}] {chunk_id} işleniyor...")

        try:
            text = txt_path.read_text(encoding="utf-8")
            assert len(text) <= 300, f"Chunk 300 char sınırını aşıyor: {len(text)}"
            
            wav = model.generate(text, **kwargs)
            ta.save(str(wav_path), wav, model.sr)
            
            duration = wav.shape[-1] / model.sr
            
            # Manifest güncelle
            for c in manifest["chunks"]:
                if c["id"] == chunk_id:
                    c["status"] = "done"
                    c["audio_duration_sec"] = round(duration, 2)
                    break
            save_manifest(book_slug, manifest)
            print(f"  OK — {duration:.1f}s, {wav_path.stat().st_size/1024:.1f}KB")

        except Exception as e:
            print(f"  HATA: {e}")
            traceback.print_exc()
            for c in manifest["chunks"]:
                if c["id"] == chunk_id:
                    c["status"] = "failed"
                    c["retries"] = c.get("retries", 0) + 1
                    break
            save_manifest(book_slug, manifest)

    done = sum(1 for c in manifest["chunks"] if c["status"] == "done")
    failed = sum(1 for c in manifest["chunks"] if c["status"] == "failed")
    print(f"\nTamamlandı: {done}/{len(manifest['chunks'])} chunk. Hatalı: {failed}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python render_chunks.py <book_slug> [reference_voice_path]")
        sys.exit(1)
    ref = sys.argv[2] if len(sys.argv) > 2 else None
    render(sys.argv[1], reference_voice=ref)
