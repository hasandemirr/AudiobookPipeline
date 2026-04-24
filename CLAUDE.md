# AudiobookPipeline — Project Context

## Stack
- Python 3.x — C:\AI\chatterbox\venv\Scripts\python.exe
- Chatterbox Multilingual TTS — path .env'den okunur (CHATTERBOX_SRC)
- PyTorch + torchaudio, CUDA aktif (RTX 2070 Super 8GB)
- .NET 9 — AudiobookPipeline.TextProcessor (C# / PdfPig)
- OS: Windows 11

## Repo Kökü Tespiti
Her iki taraf da .gitignore'u arayarak repo kökünü bulur.
Python: find_repo_root() — scripts/ içindeki tüm scriptlerde mevcut
.NET: FindRepoRoot(AppContext.BaseDirectory) — Program.cs'de mevcut

## Kurulum
Her makinede ilk kurulum:
  .\setup.ps1

Sadece TTS makinesinde ek olarak:
  .\setup_python.ps1

## Mimari — İki Katman
### Katman 1: .NET TextProcessor
PDF → extract → OCR fix → sections/ → manifest.json
Proje: src\TextProcessor\AudiobookPipeline.TextProcessor\

Servisler:
- TocParserService     — PDF bookmark okuma
- PdfExtractService    — sayfa bazlı metin extract
- HeaderFooterDetector — tekrar eden satır tespiti
- OcrFixService        — kural tabanlı OCR düzeltme
- ManifestService      — manifest.json okuma/yazma

OCR kuralları: Core\Rules\ocr_rules.json (kod dışı, genişletilebilir)

Çalıştırma:
cd src\TextProcessor\AudiobookPipeline.TextProcessor
dotnet run -- <pdf_path> <book_slug>

### Katman 2: Python TTS
chunks/ → render → audio/ → merge → output/{slug}.wav

Scriptler:
- scripts\chunk_text.py    — txt → chunks + manifest
- scripts\render_chunks.py — manifest → WAV (resume destekli)
- scripts\merge_audio.py   — WAV birleştirme, 300ms sessizlik
- scripts\sanity_test.py   — tek chunk Chatterbox testi

Chatterbox API:
model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)
wav = model.generate(text, language_id="tr",
      audio_prompt_path=..., exaggeration=0.5,
      cfg_weight=0.5, temperature=0.8)
torchaudio.save(path, wav, model.sr)  # model.sr = 24000

## Manifest Şeması
workspace/{slug}/manifest.json
Sections: id, title, page_start, page_end,
          status (extracted|reviewed|approved),
          narrate, txt_path, reviewed_path
Chunks:   id, char_count, status (pending|done|failed),
          audio_duration_sec, retries

## Workspace Yapısı
workspace/{slug}/
  sections/   — .NET extract çıktısı
  reviewed/   — manuel onaylı metin (sonraki faz)
  chunks/     — Python chunk çıktısı
  audio/      — WAV dosyaları
  manifest.json

## Çevre Değişkenleri
.env (git'e gitmez, her bilgisayarda ayrı oluştur):
CHATTERBOX_SRC=C:\AI\chatterbox\src

## Kurallar
1. Test zorunlu. Test geçmeden sonraki sprint başlamaz.
2. manifest.json tek doğruluk kaynağı.
3. Yeni script/servis eklenince CLAUDE.md güncellenir.
4. Windows path: raw string veya \\ kullan.
5. .NET: repo kökü FindRepoRoot() ile bulunur, hard-code yasak.
6. Python: repo kökü find_repo_root() ile bulunur, hard-code yasak.
7. Hata: status="failed", retries+1, dur ve raporla.

## Backlog
- [x] Sprint 1-5:  Python TTS pipeline
- [x] Sprint 8-15: .NET TextProcessor
- [x] Sprint 16-18: Path stabilizasyonu
- [x] Sprint 19-20: Setup scriptleri
- [ ] Sprint 22: reviewed/ akisi + approved → chunk handoff
- [ ] Sprint 23: run_pipeline.py — tek komut orchestrator
- [ ] Sprint 24: preprocess_ollama.py — Ollama OCR entegrasyonu
- [ ] İleride: UI (extract + review + onay ekranı)
- [ ] İleride: FastAPI wrapper
