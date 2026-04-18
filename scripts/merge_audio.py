import sys, json, torch, torchaudio as ta
from pathlib import Path

def merge(book_slug: str, silence_ms: int = 300):
    manifest_path = Path("workspace") / book_slug / "manifest.json"
    assert manifest_path.exists(), f"Manifest bulunamadı: {manifest_path}"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    audio_dir = Path("workspace") / book_slug / "audio"
    output_dir = Path("output")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{book_slug}.wav"

    done_chunks = [c for c in manifest["chunks"] if c["status"] == "done"]
    assert len(done_chunks) > 0, "Birleştirilecek tamamlanmış chunk yok."

    print(f"Birleştirilecek chunk sayısı: {len(done_chunks)}")

    segments = []
    sample_rate = None

    for chunk_meta in done_chunks:
        wav_path = audio_dir / f"{chunk_meta['id']}.wav"
        assert wav_path.exists(), f"WAV bulunamadı: {wav_path}"
        
        waveform, sr = ta.load(str(wav_path))
        
        if sample_rate is None:
            sample_rate = sr
        elif sr != sample_rate:
            waveform = ta.functional.resample(waveform, sr, sample_rate)

        segments.append(waveform)
        
        # Chunk arası sessizlik
        silence_samples = int(sample_rate * silence_ms / 1000)
        silence = torch.zeros(waveform.shape[0], silence_samples)
        segments.append(silence)

    # Son sessizliği kaldır
    if segments:
        segments = segments[:-1]

    merged = torch.cat(segments, dim=1)
    ta.save(str(output_path), merged, sample_rate)

    total_duration = merged.shape[-1] / sample_rate
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    
    print(f"Çıktı: {output_path}")
    print(f"Toplam süre: {total_duration:.1f}s ({total_duration/60:.1f} dakika)")
    print(f"Dosya boyutu: {file_size_mb:.2f} MB")
    
    # Beklenen süre kontrolü
    expected_duration = sum(c["audio_duration_sec"] for c in done_chunks 
                           if c["audio_duration_sec"])
    tolerance = len(done_chunks) * (silence_ms / 1000) + 2.0
    assert abs(total_duration - expected_duration - (len(done_chunks)-1) * silence_ms/1000) < tolerance, \
        f"Süre uyumsuzluğu. Beklenen: ~{expected_duration:.1f}s, Gerçek: {total_duration:.1f}s"
    
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python merge_audio.py <book_slug> [silence_ms]")
        sys.exit(1)
    silence = int(sys.argv[2]) if len(sys.argv) > 2 else 300
    merge(sys.argv[1], silence_ms=silence)
