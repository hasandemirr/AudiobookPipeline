import re, json, sys
from pathlib import Path
from datetime import datetime

def split_sentences(text: str) -> list[str]:
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]

def build_chunks(sentences: list[str], max_chars: int = 280) -> list[str]:
    chunks, current = [], ""
    for sentence in sentences:
        if len(sentence) > max_chars:
            # Cümle tek başına sınırı aşıyorsa kelime kelime böl
            words = sentence.split()
            for word in words:
                if len(current) + len(word) + 1 > max_chars:
                    if current:
                        chunks.append(current.strip())
                    current = word
                else:
                    current = (current + " " + word).strip()
        elif len(current) + len(sentence) + 1 > max_chars:
            if current:
                chunks.append(current.strip())
            current = sentence
        else:
            current = (current + " " + sentence).strip()
    if current:
        chunks.append(current.strip())
    return chunks

def chunk_file(txt_path: str, book_slug: str = None):
    txt_path = Path(txt_path)
    assert txt_path.exists(), f"Dosya bulunamadı: {txt_path}"
    
    slug = book_slug or txt_path.stem.lower().replace(" ", "_")
    out_dir = Path("workspace") / slug / "chunks"
    out_dir.mkdir(parents=True, exist_ok=True)

    text = txt_path.read_text(encoding="utf-8")
    sentences = split_sentences(text)
    chunks = build_chunks(sentences)

    manifest = {"book": slug, "created_at": datetime.now().isoformat(), "chunks": []}

    for i, chunk in enumerate(chunks):
        chunk_id = f"chunk_{i+1:04d}"
        chunk_file_path = out_dir / f"{chunk_id}.txt"
        chunk_file_path.write_text(chunk, encoding="utf-8")
        manifest["chunks"].append({
            "id": chunk_id,
            "char_count": len(chunk),
            "status": "pending",
            "audio_duration_sec": None,
            "retries": 0
        })
        assert len(chunk) <= 300, f"{chunk_id} 300 karakter sınırını aşıyor: {len(chunk)}"

    manifest_path = Path("workspace") / slug / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Toplam chunk: {len(chunks)}")
    print(f"Manifest: {manifest_path}")
    return manifest_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python chunk_text.py <txt_dosyası> [book_slug]")
        sys.exit(1)
    slug = sys.argv[2] if len(sys.argv) > 2 else None
    chunk_file(sys.argv[1], slug)
