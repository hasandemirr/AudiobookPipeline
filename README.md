# AudiobookPipeline

PDF kitapları, kullanıcının seçtiği veya yüklediği ses profiliyle, sayfa
takipli altyazı desteğiyle seslendiren; teknik bilgi gerektirmeyen, tek
kurulumla çalışan masaüstü uygulaması.

---

## Project Overview

AudiobookPipeline, bir PDF kitabı baştan sona sese dönüştüren tek yönlü bir
boru hattıdır. Akış şu adımlardan oluşur:

```
PDF → Extract → Review/Cleanup → Approve → chunk → TTS servisi (render) → merge → output/{slug}.(mp3|wav) + .srt
```

Son kullanıcı şunları yapar:
1. PDF yükler, sistem metni çıkarır (extract).
2. Çıkarılan metni inceleyip temizler (header/footer/sayfa numarası kaldırma).
3. Bölümleri onaylar (approve).
4. Ses profili seçer veya yükler.
5. Seslendirmeyi başlatır; çıktı tek WAV + SRT altyazı olarak üretilir.

Tüm uzun işlemler (extract, render) kesilip "Devam Et" ile sürdürülebilir.

---

## Tech Stack

| Katman | Teknoloji | Versiyon | Not |
|--------|-----------|----------|-----|
| Backend API | .NET | 9 (net9.0) | Çakışma çıkarsa 10'a upgrade edilir |
| Frontend | React + Vite | React 19, Vite 8 | TypeScript |
| TTS | Chatterbox Multilingual TTS | — | FastAPI servisi olarak çalışır (hedef mimari) |
| ML Runtime | PyTorch + torchaudio | CUDA 12.1 build | GPU zorunlu değil, CPU fallback |
| Python | CPython | **3.11 (sabit)** | 3.12 numpy build hatası verir, 3.10 minimum |
| LLM (opsiyonel) | Ollama | — | Telaffuz/metin düzeltme (gelecek faz) |
| Realtime | SignalR | — | Progress ve servis durumu bildirimi |

**Portlar:**
- `.NET API` → 5000
- React UI (dev) → 5173
- FastAPI TTS → 5001 (hedef mimari)
- Ollama → 11434

**Model sample rate:** 24000 Hz

---

## Python Kurulum Sırası (Kritik)

Chatterbox bağımlılıkları belirli bir sırada kurulmalıdır. Yanlış sıra
numpy/pkuseg build hatalarına yol açar:

```
1. python 3.11 -m venv
2. pip install --upgrade pip setuptools wheel
3. pip install numpy            # chatterbox'tan ÖNCE (pkuseg bağımlılığı)
4. pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
5. pip install chatterbox-tts   # veya source'tan editable
```

> Python 3.11 resmi olarak test edilen sürümdür. Python 3.12 distutils
> kaldırıldığı için numpy 1.25.x build'ini başaramaz; Python 3.10 minimum
> kabul edilir ama 3.11 tercih edilir.

---

## Architecture

### Hedef Mimari

```
React UI (5173 dev / .NET static prod)
    │ HTTP + SignalR
    ▼
.NET Orchestrator API (5000)          ← TEK GİRİŞ NOKTASI
    │
    ├── BackgroundTaskQueue  (Channel<IJob>)
    ├── ServiceRegistry      (ProcessManager — start/stop/health)
    ├── ManifestService      (SemaphoreSlim per-slug lock)
    └── PathService          (merkezi path, ToRelative/ToAbsolute)
    │
    ├──► PDF Extractor (in-process)
    ├──► FastAPI TTS Service (5001)   ← model RAM'de kalıcı
    │         └── engines/ [chatterbox | fish_speech | coqui]
    └──► Ollama (11434)
```

**Tek Giriş Noktası:** React UI yalnızca `.NET API`'yi görür. TTS, Ollama,
PDF servisleri UI'a doğrudan açık değildir. Servis adresleri değişse UI
etkilenmez.

### .NET Servisleri

| Servis | Sorumluluk |
|--------|-----------|
| PathService | Merkezi path yönetimi, ToRelative/ToAbsolute |
| ManifestService | manifest.json okuma/yazma, per-slug lock, Lock/Unlock |
| PdfExtractService | Sayfa extract, JoinBrokenLines, FormatPageWithMarker |
| TocParserService | PDF bookmark okuma |
| HeaderFooterDetector | DetectPatterns (pozisyon bazlı, confidence skorlu) |
| OcrFixService | Kural tabanlı OCR düzeltme |
| BackgroundTaskQueue | Arka plan iş kuyruğu (extract, render) |

### Workspace Yapısı

```
workspace/{slug}/
  manifest.json          ← tek doğruluk kaynağı
  sections/*.txt         ← ham extract (raw)
  reviewed/*.txt         ← kullanıcı düzenlemesi
  chunks/*.txt           ← chunk'lanmış metin
  audio/*.wav            ← chunk ses dosyaları

output/{slug}/
  {slug}.wav             ← birleşik ses
  {slug}.srt             ← altyazı

voices/
  registry.json          ← ses profilleri
  raw/                   ← yüklenen ham ses
  processed/             ← normalize edilmiş ses
```

> **Not:** Mevcut export çıktısı flat — `output/{slug}_export.txt`
> (PathService.ExportPath). Render çıktısı (mp3/wav + .srt) ve per-slug
> `output/{slug}/` klasör yapısı render orkestrasyonu ile gelir (Faz 3.4/3.5/4).
> Eski standalone render hattı scripts/legacy/ altında arşivlendi.

### Manifest Şeması

`manifest.json` her kitabın tek doğruluk kaynağıdır:

```
book, created_at, updated_at, is_locked, locked_by
toc:        [{ level, title, page_start, page_end, narrate }]
sections:   [{ id, title, page_start, page_end, status,
               narrate, txt_path, reviewed_path,
               saved_cleanup_patterns }]
chunks:     [{ id, type, text, page, char_count, status,
               audio_duration_sec, retries,
               subtitle_start_ms, subtitle_end_ms }]
render_state: { status, total_chunks, done_chunks,
                failed_chunks, started_at, paused_at }
repeated_lines:    [string]
detected_patterns: [{ text, position, page_count, total_pages,
                      confidence, is_page_number,
                      is_checked_by_default }]
```

Section status akışı: `extracted → reviewed → approved`
Chunk status akışı: `pending → rendering → done | failed`
Path formatı: relative — repo kökünden itibaren.

> **Not (hedef şema):** Şu an `ChunkEntry` modelinde uygulanan alanlar:
> `id`, `char_count`, `status`, `audio_duration_sec`, `retries`.
> Chunk'taki `type`, `text`, `page`, `subtitle_start_ms`, `subtitle_end_ms`
> ve `render_state` bloğu Faz 4'te (chunk pipeline + SRT) eklenir.

### Sayfa Marker Formatı

```
=== SAYFA {N} ===
```

Bu marker dahili formattır. Export sırasında strip edilir. Chunk
pipeline'ında sayfa geçişleri `type: "page_marker"` chunk'ı olarak
korunur ve SRT'de `[Sayfa N]` olarak görünür.

---

## API Endpoints

```
GET    /api/health
GET    /api/books
GET    /api/books/{slug}
GET    /api/books/{slug}/status
POST   /api/books/extract                          (form: slug, pdf, force?)
DELETE /api/books/{slug}
DELETE /api/books/{slug}/output
GET    /api/books/{slug}/sections/{id}
PUT    /api/books/{slug}/sections/{id}
POST   /api/books/{slug}/sections/{id}/approve
PATCH  /api/books/{slug}/sections/{id}/narrate
DELETE /api/books/{slug}/sections/{id}/reviewed    (reset to raw)
GET    /api/books/{slug}/export
GET    /api/books/{slug}/export/status
```

**SignalR Hub:** `/hubs/progress`
- `ExtractProgress` → `{ slug, message, percent, done?, error? }`

(Servis orchestration, TTS render, voice ve Ollama endpoint'leri gelecek
fazlarda eklenecek.)

---

## Workflow Rules

### Sprint Döngüsü

1. Her büyük sprint sonrası **git push** yapılır.
2. Yeni sprinte geçmeden önce şunlar tartışılır:
   - Mevcut sprintte yapılanlar
   - Geleceğe bırakılan teknik borçlar
   - Değişen kararlar
   - Yol haritası durumu
   - Bir sonraki sprintte yapılacaklar
3. Sprint tamamlandığında `ROADMAP.md` güncellenir (`⬜ → ✅`).
4. `requirements.txt` ve bu README, proje ilerledikçe güncel tutulur.

### Test Standardı

Her sprint sonunda beklenen çıktı:
- İlgili dosya/klasör varlığı doğrulandı
- Manuel test adımları geçti
- `TEST PASSED` terminale yazıldı

Testler manuel yürütülür. Otomatik test üretimi token-yoğun olduğundan
prompt'lar manuel test adımlarını tarif eder.

---

## Hard Constraints

Bu kısıtlar pazarlık konusu değildir:

1. **Chatterbox hard limit:** 300 karakter/chunk. Chunk boyutu MAX 280 karakter.
2. **manifest.json tek doğruluk kaynağıdır.** Script dışı manuel düzenleme yapılmaz.
3. **Path hard-code ASLA yapılmaz.** Tüm path'ler `.env` + relative üzerinden
   çözülür. Nihai ürün herhangi bir bilgisayarda uygunluğa göre çalışmalıdır.
4. **Model her render session'da bir kez yüklenir**, chunk başına yeniden
   yüklenmez. (FastAPI mimarisinde model RAM'de kalıcı kalır.)
5. **Hata durumunda:** `status="failed"`, `retries+1`, dur ve raporla.
6. **Path'ler relative kaydedilir** (ToRelative/ToAbsolute ile).
7. **Yorum satırları sadece İngilizce.**
8. **Türkçe string API response'larında yasak.**
9. **Hard-code path yasak — PathService kullan.**
10. **VRAM boşaltma:** Engine unload'da `del model`, `gc.collect()`,
    `torch.cuda.empty_cache()` zorunlu.

---

## Komutlar

```
npm run dev          # API + UI eş zamanlı başlat
npm run api          # sadece .NET API
npm run ui           # sadece React UI
npm run kill-api     # port 5000'i öldür
```

.NET PATH sorununda:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')
```

İlk kurulum (geçici — `setup.bat` Sprint 0.5'te gelecek):
```
npm install
npm install --prefix src/ui
```

---

## Roadmap

Sprint takibi, teknik borçlar ve faz planı için `ROADMAP.md` dosyasına
bakın. Roadmap proje boyunca yaşayan bir referanstır ve yol üzerinde
değişiklikler (sprint ekleme/çıkarma, öncelik değişimi) yapılabilir.
