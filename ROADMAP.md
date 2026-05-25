# AudiobookPipeline — Roadmap & Sprint Takibi

> **Takip kuralı:** Her sprint tamamlandığında status güncellenir.
> Sprint başlamadan önce önceki sprint'in testi geçmiş olmalıdır.
> Mimari kararlar README.md'de; bu dosya "ne zaman ve nasıl"ı tutar.

---

## Durum Göstergeleri

| Sembol | Anlam |
|--------|-------|
| `⬜` | Bekliyor |
| `🔵` | Devam ediyor |
| `✅` | Tamamlandı (test geçti) |
| `❌` | Bloke / Başarısız |

---

## Tamamlanan İş — Faz 0 Öncesi (Bug Fix & Review Sprint)

Resmi faz numaralandırması öncesinde, Review/Cleanup akışındaki kritik
bug'ları gidermek için yapıldı.

| # | İş | Durum |
|---|-----|-------|
| F-1 | PDF extraction: digit separation (`ExtractPageText`) | ✅ |
| F-2 | Pipeline sırası: `RemovePageNumbers` → `JoinBrokenLines` | ✅ |
| F-3 | `StripEmbeddedPageNumbers` — satır içi sayfa numarası temizleme | ✅ |
| F-4 | `JoinBrokenLines` — `IsShortUpperCase` guard | ✅ |
| F-5 | Export: `StripPageMarkers` — `=== SAYFA N ===` strip | ✅ |
| F-6 | `mergeCrossPageHyphens` — deleted/suspicious skip | ✅ |
| F-7 | `applyCleanup` — nonEmpty filtresi (position matching fix) | ✅ |
| F-8 | Live preview (`previewIds` / `previewCleanup`) | ✅ |
| F-9 | Approve sonrası panel refresh — `resetQueries` | ✅ |
| F-10 | Section reset endpoint — `DELETE /sections/{id}/reviewed` | ✅ |
| F-11 | Delete page (`deletePage`) | ✅ |

---

## Build Hijyeni (Faz 1 sırasında, ad-hoc)

| # | İş | Durum |
|---|-----|-------|
| H-1 | TS5101 — `tsconfig.json` `baseUrl` kaldırıldı (`paths` göreli) | ✅ |
| H-2 | TS18048 — `ReviewPage.tsx` `sectionData` açık narrowing | ✅ |
| H-3 | CS8625 — `Section.ReviewedPath` `string?` | ✅ |

Sonuç: `.NET` build 0/0, UI `tsc` + `vite build` temiz, Python import temiz.

---

## FAZ 0 — Teknik Borç ve Kurulum Altyapısı

| Sprint | İş | Durum |
|--------|-----|-------|
| **0.1** | BackgroundService Queue (`Channel<IJob>` + `QueuedHostedService` + `ExtractJob`) | ✅ |
| **0.2** | ManifestService Distributed Lock (`SemaphoreSlim` per-slug, `UpdateAsync`) | ✅ |
| **0.3** | Dependency Injection Cleanup (`ExtractConfig`, `AddScoped`, scope) | ✅ |
| **0.4** | Zombie Process Cleanup (gerçek servis process yönetimi) | ⬜ (ertelendi → Faz 4.1) |
| **0.5** | setup.bat + start.bat (Python installer + cu121 reconcile + .env + build + npm) | ✅ |

### Sprint 0.4 — Zombie Process Cleanup `⬜`
- **Kısmen yapıldı (dev-orchestration):** `npm run dev --kill-others` + `start.ps1` çıkışta `taskkill /T /F` + 5000/5173 orphan süpürme. Ctrl+C sonrası orphan kalmıyor.
- **Kalan kapsam:** Gerçek servis process yönetimi (FastAPI/Ollama) — PID dosyası, SIGTERM→SIGKILL, başlangıçta orphan tespiti. Faz 4.1 ProcessManager ile ele alınır.

### Sprint 0.5 — setup.bat + start.bat `✅`
- `.env.example` + `setup.ps1`: .env türetme, klasör yapısı, API build, npm install.
- `setup_python.ps1`: py-3.11 tespit → venv → chatterbox klon → numpy → torch cu121 (pinli 2.5.1) → `pip install -e chatterbox` → `requirements.txt` → cu121 reconcile guard → .env. **Temiz venv'de doğrulandı.**
- `.gitignore`: `venv/`, `chatterbox/`. start.ps1 health-poll + `npm run dev`.
- B2 kapatıldı (tek makinede tekrarlanamadı). services.json → Faz 4'e ertelendi.

---

## FAZ 1 — TTS Servis Mimarisi

> Model RAM'de kalıcı + engine abstraction (yeni model = yeni adapter).

| Sprint | İş | Durum |
|--------|-----|-------|
| **1.1** | BaseTTSEngine (ABC) + ChatterboxEngine + registry (`src/tts/`, smoke test) | ✅ |
| **1.2** | FastAPI TTS Servisi (port 5001) — çekirdek tamam, ses işleme ertelendi | ✅* |
| **1.3** | .NET → TTS Proxy (`TtsEndpoints` /api/tts/*, pass-through; Swagger /swagger açık) | ✅ |
| **1.4** | Legacy scripts retire (render_chunks/chunk_text/merge_audio → legacy/; eski testler silindi) | ✅ |

`✅*` = çekirdek (1.2a) tamam; 1.2b (ses işleme) bilinçli ertelendi.

### Sprint 1.2 — FastAPI TTS Servisi
- **1.2a-i** `✅` — `requirements.txt` (torch'suz) + setup'a `-r` + cu121 reconcile guard. B5 kapandı.
- **1.2a-ii** `✅` — `src/tts/app.py`: lazy singleton engine, `/health` (VRAM), `/engines`, `/engines/load`, `/engines/unload`, `/render` (ham wav). Hata kodları: render 409, text>300 / geçersiz audio_prompt_path 422.
- **1.2b — Ses işleme** `⬜` (ertelendi) — `/voices/process`, `/voices/test` (ffmpeg normalize + noisereduce + 16kHz mono). Referans-ses hattı backend'i; 5.3 Voice UI ile değer kazanır. `/render` audio_prompt_path tüketim ucu zaten hazır.

**Kilitli kararlar:** Servis otomatik kalkmaz (start.bat sadece API+UI). Model lazy (sadece /engines/load). Tek-engine (yeni load öncesi eski unload). `/render` ham wav bytes; dosya sahibi .NET. `unload` = del+gc+empty_cache.

**Notlar:** requirements.txt torch İÇERMEZ (cu121 index ile). B5 deseni kalıcı: her pip install torch'u 2.6.0 CPU'ya düşürebilir → cu121 reconcile guard zorunlu (2.5.1+cu121 runtime'da çalışır, pin kozmetik).

---

## FAZ 2 — PageContent[] Yapısal Refactor + Review Tamamlama

> **Neden:** `=== SAYFA N ===` string marker garanti edilebilir kaynak değil
> (silinebilir, OCR bozar, lokalizasyon kırar). Render sayfa takibi için sağlam
> yapısal sayfa modeli gerekir. Marker → yapısal `PageContent[]`; review adapte.

| Sprint | İş | Durum |
|--------|-----|-------|
| **2.0** | `PageContent` modeli (page_number, text) | ✅ |
| **2.0b** | `ChunkEntry` şema genişleme (Text, AudioPath, SubtitleStartMs/EndMs, IsLong) | ✅ |
| **2a** | GET section migration-aware + async (.json oku, .txt lazy migrate, pointer güncelle) | ✅ |
| **2b** | ExtractJob → `sections/{id}.json` (PageContent[]); per-page OCR fix | ✅ |
| **2c** | PUT section yapısal `pages[]` (snake_case) → `reviewed/{id}.json` | ✅ |
| **2d** | Frontend load yapısal `pagesToBlocks(pages)`; ölü `pagesToContent` silindi | ✅ |
| **2e** | Raw text + Reset + Cleanup global (regresyon düzeltme + global scope) | 🔵 |

### 2.0–2d — PageContent[] Geçişi `✅`
**Depolama:** Per-section JSON. Ham → `sections/{id}.json`, reviewed → `reviewed/{id}.json` (`List<PageContent>`). Pointer'lar `.json` gösterir (`TxtPath` adı korundu). Manifest hafif.
**Migration:** Lazy — GET'te `.json` yoksa eski `.txt` `ParsePagesContent` ile bir kez `.json`'a çevrilir, pointer güncellenir.
**Serileştirme:** ManifestService Options (SnakeCaseLower). `LoadPages`/`SavePages` paylaşır. Tüm HTTP yanıtları snake_case.
**OCR fix sayfa-bağımsız** (bağlam kullanmaz) → sayfa sayfa uygulanır.

**Oturum dersleri:** (1) Yarım geçiş: PUT eski format yazınca GET .json'u marker sanıp 500 verdi → 2c çözdü. (2) Kestrel senkron I/O yasağı → PUT `async`+`ReadToEndAsync`. (3) tsc geçmeden frontend "uygulanmış" sayılmaz (unused import → vite build çalışmadı). **Her frontend prompt'unda `npm run build` şart.**

### 2e — Raw text + Reset + Cleanup global `🔵`
**Neden (regresyon):** GET tek `content` (reviewed-öncelikli) dönüyor; frontend raw+edited'i ondan türetiyor → raw orijinali değil reviewed'ı gösteriyor + cleanup global scope'unu yitirdi.
**Hedef model:** Raw (orijinal, `sections/{id}.json`) = kalıcı, raw panel + Reset kullanır. Edited (`reviewed/{id}.json`) = düzenlenmiş. GET iki içerik: `raw_pages` + `pages`. Reset reviewed'ı silip edited'i raw'a döndürür. Cleanup tüm kitaba (section-list checkbox + global apply). Ölü `content`/`parsePages` bu turda temizlenir.
**Not:** Üçü aynı veri modelini paylaştığı için tek tasarım turu. Kararlar (cleanup nerede saklanır, raw GET'te ayrı alan, checkbox UI) tur başında netleşir.

---

## FAZ 3 — Render Orkestrasyonu (asıl ürün değeri)

> Bir kitabı uçtan uca seslendir. Eski 3.4+4.1+4.2 birleşimi, öne çekildi.
> PageContent[] (Faz 2) zemin. Önce varsayılan ses, sonra referans-ses.

| Sprint | İş | Durum |
|--------|-----|-------|
| **3.0** | ffmpeg ön-koşul — setup'a kontrol (mp3/format encode) | ⬜ |
| **3.1** | `ChunkEntry` şema tamamla: `PageStart`/`PageEnd` + `ChunkStatus` enum {Pending,Rendering,Done,Failed,Stale} | ⬜ |
| **3.2** | ChunkBuilderService (.NET) + `POST /api/books/{slug}/chunk` (PageContent[]→page-aware chunk) | ⬜ |
| **3.3** | Chunk CRUD — GET / PUT (done→stale) / DELETE (rendering→lock, done→soft-delete) | ⬜ |
| **3.4** | RenderJob (BackgroundTaskQueue) — sıralı render, SignalR progress, resume, hata→dur | ⬜ |
| **3.5** | `/render` PCM_S16 wav + süre header; .NET `audio/{id}.wav` yazar + manifest günceller | ⬜ |
| **3.6** | Merge + mp3/format çıktı (ffmpeg, UI'dan format) + SRT (chunk süresi = altyazı süresi) | ⬜ |
| **3.7** | Render UI (chunk listesi page badge + cross-page uyarı, dinle/sil/yeniden-üret, progress, duraklat/durdur/devam) | ⬜ |

**Kilitli kararlar:**
- Chunk'layıcı .NET (C#). Cümle korunarak ≤280 char; aşarsa virgül→`"`→boşluk böl, `IsLong=true`. Same-page-preferred (gerekirse `PageStart`/`PageEnd` ile sayfa aşılır).
- Chunk metni manifest'te (`ChunkEntry.Text`).
- Sıralı render zorunlu (tek GPU). SignalR ilerleme. Başarılı→sonraki, hata→dur+bildir. Resume (`ChunkStatus`).
- State machine: Pending→Rendering→Done; Done→Stale (edit); Stale→Rendering; Failed→Pending. Edit done→Stale (otomatik render yok, UI uyarır).
- Ara chunk wav (16-bit PCM, çalınabilir) → merge → mp3 (UI'dan format). ffmpeg ön-koşul.
- SRT: chunk'ın tüm metni render süresi kadar (render yan ürünü, ayrı hizalama yok).
- `audio_prompt_path` opsiyonel (varsayılan ses). Klonlama = zero-shot, eğitim YOK; 1.2b + 5.3 ile eklenir (tüketim ucu hazır).

---

## FAZ 4 — Service Orchestration (eski Faz 2)

| Sprint | İş | Durum |
|--------|-----|-------|
| **4.1** | ServiceRegistry + ProcessManager (services.json, start/stop, PID, RAM/VRAM; 0.4 burada) | ⬜ |
| **4.2** | System Monitor Endpoints (`/api/system/health`) | ⬜ |
| **4.3** | SignalR genişletme (ServiceStateChanged, RamUsageUpdated, RenderProgress) | ⬜ |
| **4.4** | Service Control Endpoints (`/api/services/{id}/start|stop`, RAM pre-check) | ⬜ |

---

## FAZ 5 — UI Genişletmesi (kalan)

| Sprint | İş | Durum |
|--------|-----|-------|
| **5.1** | Cleanup Panel Accordion (sol sidebar, HIGH/MEDIUM/LOW) — 2e üstüne | ⬜ |
| **5.2** | Services Dashboard (Settings, RAM bar, start/stop, GPU temp) | ⬜ |
| **5.3** | Voice Management UI (yükleme sihirbazı, 3 varyant test, profil) — 1.2b ile referans-ses | ⬜ |
| **5.4** | Output + Storage Manager (sayfa bazlı silme, purge, storage özeti) | ⬜ |

---

## FAZ 6 — Ollama Entegrasyonu

| Sprint | İş | Durum |
|--------|-----|-------|
| **6.1** | Ollama Proxy (`/api/ollama/*`, keep_alive) | ⬜ |
| **6.2** | preprocess_ollama.py (rakam→yazı, kısaltma, fonetik) | ⬜ |
| **6.3** | Ollama UI (model pull/delete, kitap bazında seçim) | ⬜ |

---

## Açık Bug'lar ve Teknik Borç

| # | Sorun | Öncelik | Hedef |
|---|-------|---------|-------|
| **B1** | autoSaveTimer unmount — ✅ KAPANDI | — | Kapandı |
| **B2** | SignalR proxy ikinci makine — ✅ KAPANDI | — | Kapandı |
| **B3** | pagesToContent merge bake — ✅ KAPANDI (2d'de tamamen silindi) | — | Kapandı |
| **B4** | TextProcessor `Program.cs` + `OutputType=Exe` → Library'ye çevir + CLI retire. Build-etkileyen | Düşük | Faz 3 sonrası |
| **B5** | pip install cu121 torch'u ezebilir — ✅ KAPANDI (reconcile guard). Desen KORUNMALI | — | Kapandı |
| **B6** | Tek tıkta 2 istek (GET/PUT) — React strict-mode olası; ikincil | Düşük | İncelenecek |
| **B7** | Pyrefly missing-import kozmetik (venv yerine sistem Python) — VS Code interpreter manuel | Kozmetik | — |

---

## Faz Bağımlılık Grafiği

```
Faz 0 (0.4 → Faz 4.1)
  └─► Faz 1 (TTS + FastAPI)          [1.1 ✅ 1.2a ✅ 1.3 ✅ 1.4 ✅; 1.2b ertelendi]
        └─► Faz 2 (PageContent[])     [2.0–2d ✅; 2e 🔵]
              └─► Faz 3 (Render Orkestrasyonu)  ← asıl ürün değeri
                    └─► Faz 4 (service orchestration)
                          └─► Faz 5 (kalan UI)
                                └─► Faz 6 (Ollama)

Paralel: 5.1 (cleanup accordion, 2e sonrası)
Referans-ses: 1.2b (işleme) + 5.3 (Voice UI) — render hattına eklenti
```

---

## Önemli: Repomix Senkronizasyonu

Project knowledge bir repomix snapshot'ıdır, **otomatik güncellenmez**.
**Kural:** Yeni prompt öncesi güncel repomix yüklenir. **Doğrulama:** Yüklenince
son sprint izleri grep'le kontrol edilir (örn. `pagesToContentList`,
`PageContent.cs`); yoksa repomix bayattır, tekrar üretilir.

---

## Antigravity Çalışma Kuralı (oturum dersi)

Her prompt'a açık kısıt: *"Test FAIL olursa DUR ve bildir; script'i kendiliğinden
değiştirme/yeniden çalıştırma, eksik bağımlılık KURMA."*
- Kurulum/venv riskli ops → Antigravity'ye değil, kullanıcıya manuel.
- Saf build/tip testi (`dotnet build`, `npm run build --prefix src/ui`) Antigravity yapabilir; FAIL→DUR+bildir, kendiliğinden düzeltme YOK.
- `dotnet build` API çalışırken dosya-kilidi (MSB3027) → build öncesi API durdurulmalı.

---

## Sprint Tamamlanma Kriteri

1. Dosya/klasör varlığı doğrulandı
2. Manuel/runtime test geçti (kod testi IDE'de, runtime kullanıcıda)
3. `TEST PASSED` bildirildi
4. ROADMAP'te ilgili sprint `✅`
5. Mantıksal birim bitince `git push` (atomik commit)
6. README/CLAUDE.md senkronu

---

## Sıradaki Adım

**Faz 2e — Raw text + Reset + Cleanup global.**
PageContent[] geçişi (2.0–2d) tamam ve commit edildi: extract→json, GET
migration-aware, PUT yapısal, frontend load yapısal. Save/approve/load çalışıyor.

Ertelenenler: 1.2b (ses işleme), B4 (TextProcessor Exe→Library), B6 (çift istek),
B7 (Pyrefly kozmetik).

Sıradaki: 2e ile iki regresyonu düzelt (raw text orijinali göstermiyor, cleanup
global scope'unu yitirdi) + Reset'i doğru raw kaynağına bağla. GET raw/edited'i
ayrı versin (`raw_pages` + `pages`), cleanup tüm kitaba uygulansın. Ölü `content`/
`parsePages` kalıntıları temizlenir.

2e kapanınca → **Faz 3 Render Orkestrasyonu:** ffmpeg ön-koşul → ChunkEntry şema
tamamla → ChunkBuilderService → Chunk CRUD → RenderJob → merge/mp3/SRT → Render UI.

Prompt öncesi güncel repomix yüklenir ve son sprint izleri grep'le doğrulanır.
