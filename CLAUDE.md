# AudiobookPipeline — Agent Context (CLAUDE.md)

> Bu dosya AI ajanları için yalın operasyon kılavuzudur: stack, komutlar,
> değişmezler ve tuzaklar.
> Mimari gerekçe ve detay → README.md. Sprint planı ve backlog → ROADMAP.md.
> Bu dosyada yol haritası/backlog TUTULMAZ (drift'i önlemek için).

## Stack
- Backend API: .NET 9 (net9.0) — src/Api/AudiobookPipeline.Api
- Çekirdek kütüphane: src/TextProcessor/AudiobookPipeline.TextProcessor (PdfPig) — API buna bağımlı
- Frontend: React 19 + Vite + TypeScript — src/ui
- TTS: Chatterbox Multilingual TTS (hedef: FastAPI servisi, Faz 1)
- ML runtime: PyTorch + torchaudio (CUDA 12.1 build, CPU fallback)
- Python: 3.11 SABIT (3.12 numpy build hatası, 3.10 minimum)
- Realtime: SignalR · LLM (gelecek faz): Ollama
- Portlar: API 5000 · UI dev 5173 · FastAPI TTS 5001 (hedef) · Ollama 11434
- Model sample rate: 24000 Hz · GPU: RTX 2070 Super 8GB · OS: Windows 11

## Çalıştırma (repo kökünden)
- npm run dev      — API + UI eş zamanlı (concurrently)
- npm run api      — yalnızca API (dotnet run --project src/Api/AudiobookPipeline.Api/AudiobookPipeline.Api.csproj)
- npm run ui       — yalnızca UI (cd src/ui && npm run dev)
- npm run kill-api — 5000 portunu temizle

NOT: src/TextProcessor altındaki standalone CLI (dotnet run -- <pdf> <slug>)
LEGACY'dir (teknik borç B4). Extract artık API üzerinden yapılır; yeni iş
için bu CLI kullanılmaz.

## Repo Kökü & Path
- .NET: PathService — FindRepoRoot() .gitignore arayarak kökü bulur; ToRelative/ToAbsolute.
- Python: find_repo_root() — aynı .gitignore mantığı, tüm scripts/ içinde.
- Hard-code path YASAK. Makineye özgü yollar .env'den okunur.

## Mimari (özet — detay README'de)
React UI yalnızca .NET API'yi görür (TEK GİRİŞ NOKTASI). API bileşenleri:
- BackgroundTaskQueue — Channel<IJob>, fire-and-forget yok
- ManifestService — per-slug SemaphoreSlim lock, UpdateAsync
- PathService — merkezi path
- SignalR hub: /hubs/progress (ExtractProgress)
- In-process PDF extract: TextProcessor.Core servisleri (TocParser/PdfExtract/HeaderFooterDetector/OcrFix)
İleride: FastAPI TTS (5001) ve Ollama (11434) — proxy arkasında.

## Değişmezler (hard constraints)
1. manifest.json tek doğruluk kaynağı; script dışı manuel düzenleme yok.
2. Chunk MAX 280 karakter (Chatterbox hard limit 300).
3. Path'ler relative kaydedilir (repo kökünden).
4. API response'larında Türkçe string YASAK; kod yorumları YALNIZCA İngilizce.
5. Hata: status="failed", retries+1, dur ve raporla.
6. VRAM boşaltma: del model + gc.collect() + torch.cuda.empty_cache().
7. Test geçmeden sonraki sprint başlamaz.

## Python TTS Scriptleri (legacy pipeline — Faz 1'de FastAPI'ye taşınır)
- scripts/chunk_text.py    — txt -> chunks + manifest
- scripts/render_chunks.py — manifest -> WAV (resume destekli)
- scripts/merge_audio.py   — WAV birleştirme, 300ms sessizlik
- scripts/sanity_test.py   — tek chunk Chatterbox testi

Chatterbox API:
  model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)
  wav = model.generate(text, language_id="tr", audio_prompt_path=...,
                       exaggeration=0.5, cfg_weight=0.5, temperature=0.8)
  torchaudio.save(path, wav, model.sr)   # model.sr == 24000

## Çevre Değişkenleri
.env (git'e gitmez, her makinede ayrı):
- CHATTERBOX_SRC — Chatterbox src klasörü
- PYTHON_VENV    — venv Python exe yolu

## Doküman Bakımı
Yeni script/servis/endpoint eklenince bu dosya güncellenir.
Manifest şeması, API endpoint listesi ve mimari detay README.md'dedir;
burada KOPYALANMAZ, README güncellenir.
