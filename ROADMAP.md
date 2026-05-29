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
| **2e** | Raw text + Reset + Cleanup global (regresyon düzeltme + global scope) | ✅ |
| **2f** | Review UX cilası: scoped delete/reset (bölüm/kitap), panel her-zaman-açık, ilk-section-otomatik, buton görsel birliği | ✅ |

### 2.0–2d — PageContent[] Geçişi `✅`
**Depolama:** Per-section JSON. Ham → `sections/{id}.json`, reviewed → `reviewed/{id}.json` (`List<PageContent>`). Pointer'lar `.json` gösterir (`TxtPath` adı korundu). Manifest hafif.
**Migration:** Lazy — GET'te `.json` yoksa eski `.txt` `ParsePagesContent` ile bir kez `.json`'a çevrilir, pointer güncellenir.
**Serileştirme:** ManifestService Options (SnakeCaseLower). `LoadPages`/`SavePages` paylaşır. Tüm HTTP yanıtları snake_case.
**OCR fix sayfa-bağımsız** (bağlam kullanmaz) → sayfa sayfa uygulanır.

**Oturum dersleri:** (1) Yarım geçiş: PUT eski format yazınca GET .json'u marker sanıp 500 verdi → 2c çözdü. (2) Kestrel senkron I/O yasağı → PUT `async`+`ReadToEndAsync`. (3) tsc geçmeden frontend "uygulanmış" sayılmaz (unused import → vite build çalışmadı). **Her frontend prompt'unda `npm run build` şart.**

### 2e — Raw text + Reset + Cleanup global `✅`
**Çözülen regresyon:** GET tek `content` dönüyordu, frontend raw+edited'i ondan türetince raw paneli reviewed'ı gösteriyordu. Çözüm: GET artık `raw_pages` (her zaman `sections/{id}.json`, orijinal) + `pages` (reviewed-öncelikli) ayrı döner; frontend `leftPages=raw_pages`, `rightPages=pages`.
**Global cleanup (yeni yetenek, eskiden yoktu):** Cleanup match mantığı saf `applyPatternsToPages`'e çıkarıldı (tek kaynak, TS). `POST sections/bulk-save` birden çok section'ı yazar ama Status'a dokunmaz (section'lar açılıp kaydedilene kadar "extracted" kalır). SectionList'e çoklu seçim (checkbox + tümünü seç). Orchestration: seçili section'ları çek → saf fonksiyon → tek bulk-save → reload. Backend match mantığı içermez (ikizleme yok).
**Karar:** Kitap-geneli cleanup tek-seferlik (kalıcı pattern saklanmaz) — kitap bir kez yüklenip section'lara bölündüğü için yeterli.

### 2f — Review UX cilası `✅`
**Scoped delete:** Satır-içi "Delete" butonu mini popover açar: "Bu bölümden sil" (in-memory) / "Tüm kitaptan sil" (disk-bazlı, exact-match, tüm section'lar). Popover viewport-clamp'li (kenarda taşmıyor).
**Scoped reset:** Toolbar "Reset" dropdown: "Bu bölümü resetle" / "Tüm kitabı resetle" (ikinci onay adımı — yıkıcı). `DELETE sections/reviewed-all` tüm reviewed json'ları siler, kitabı raw'a döndürür.
**Tutarlılık dersi:** Reset'ler `ReviewedPath`'e değil **dosya varlığına** bakmalı — global cleanup ReviewedPath'i null bırakıp reviewed json yazıyor, GET dosya varlığıyla okuyor; reset de aynı temele oturtuldu yoksa cleanup-only section'lar atlanıyordu.
**Custom-match dersi:** `applyPatternsToPages` pattern metnini de trim'lemeli (satır metni zaten trim'li) — trim'siz pattern sessizce hiçbir şey eşleştirmiyordu (bulk-save 200 ama silmiyordu).
**Diğer:** Panel section açıkken her zaman görünür (boş-durumda mesaj + custom alanı), ilk section otomatik seçili gelir, buton/dialog görsel birliği (tekil=nötr+Trash2, çoklu=amber+Layers).

---

## FAZ 3 — Render Orkestrasyonu (asıl ürün değeri)

> Render veri modeli + chunk üretimi + minimal görünüm tamamlandı (3.1–3.3b-1, commit'li).
> **Mimari dönüş:** Render artık PDF-review context'ine bağlı DEĞİL. Ayrı bir
> **Audiobook Context** (Faz 3.5) olarak yeniden yapılandırıldı — bkz aşağı.
> Chunk çekirdeği (ChunkBuilderService, ChunkStatus, RenderManifest, RenderService)
> audiobook context'inde aynen yeniden kullanılır.

| Sprint | İş | Durum |
|--------|-----|-------|
| **3.1** | Render veri modeli: `RenderManifest`+`RenderService` (ayrı render.json, kendi lock), `ChunkStatus` enum, `ChunkEntry` şema tamamla (SectionId/Order/PageStart/PageEnd), `BookManifest.Chunks` kaldır | ✅ |
| **3.2** | ChunkBuilderService (.NET) — cümle-atomik ≤MaxChars (ayarlanabilir 280) paketleme, uzun cümle noktalama böl (`IsLong`) | ✅ |
| **3.3a** | `POST /api/books/{slug}/chunk` — tüm section approve + narrate chunk + render.json oluştur (idempotent) | ✅ |
| **3.3b-1** | `GET /render` + `/render/:slug` route + minimal RenderPage (section-gruplu chunk görünümü) | ✅ |
| **3.4–3.7** | RenderJob / audio / merge / SRT / tam Render UI — **Faz 3.5 Audiobook Context'e DEVREDİLDİ** (aşağı bkz) | ➡️ |

**Kilitli kararlar:**
- Chunk'layıcı .NET (C#). Cümle korunarak ≤280 char; aşarsa virgül→`"`→boşluk böl, `IsLong=true`. Same-page-preferred (gerekirse `PageStart`/`PageEnd` ile sayfa aşılır).
- Chunk metni manifest'te (`ChunkEntry.Text`).
- Sıralı render zorunlu (tek GPU). SignalR ilerleme. Başarılı→sonraki, hata→dur+bildir. Resume (`ChunkStatus`).
- State machine: Pending→Rendering→Done; Done→Stale (edit); Stale→Rendering; Failed→Pending. Edit done→Stale (otomatik render yok, UI uyarır).
- Ara chunk wav (16-bit PCM, çalınabilir) → merge → mp3 (UI'dan format). ffmpeg ön-koşul.
- SRT: chunk'ın tüm metni render süresi kadar (render yan ürünü, ayrı hizalama yok).
- `audio_prompt_path` opsiyonel (varsayılan ses). Klonlama = zero-shot, eğitim YOK; 1.2b + 5.3 ile eklenir (tüketim ucu hazır).

---

## FAZ 3.5 — Audiobook Context (mimari dönüş)

> PDF-extract ile audiobook İKİ AYRI context. Geçiş yalnızca sol navbar'dan.
> PDF-extract: PDF → temizlenmiş/approve TXT (review pipeline sonu). Audiobook:
> hazır TXT → chunk → render → merge. Audiobook kendi entity'si (M1), kaynaktan
> snapshot (K1) — kaynak değişimi audiobook'u ETKİLEMEZ.

**Kilitli mimari kararlar:**
- **M1** — Audiobook ayrı entity, kendi slug'ı, kendi storage'ı (`audiobooks/{slug}/`).
- **K1** — Snapshot, sıfır canlı bağ. Kitaptan audiobook üretilince içerik kopyalanır; kaynak sonradan değişse audiobook etkilenmez.
- **T3** — İki girdi: (a) sistemdeki approve kitaplardan seç, (b) doğrudan txt yükle. Txt'de sayfa yok → `PageStart/PageEnd` nullable, veri yoksa UI'da gösterilmez.
- **B1** — Sıkı sınır. "Kitabı Seslendir" butonu review'dan KALKAR. Context geçişi yalnız navbar.
- Slug: kütüphaneden → `{kitap-slug}-audio`, txt'den → `{txt-adı}-audio` (default öneri, düzenlenebilir; çakışma → `(1)`,`(2)`).
- Storage: `audiobooks/{slug}/audiobook.json` (meta) + `chunks.json` (chunk'lar) + `audio/` + `output/`.
- Model: `RenderManifest` genişletilir (source_type [pdf|txt], source_ref, title) — yeni model değil.
- Chunk içeriği `List<PageContent>`'e normalize (pdf→reviewed pages kopyası; txt→düz metin, page null).
- Audiobook oluşurken tek-sefer chunk'lanır; sonradan ayrı "yeniden chunk'la" eylemi (idempotent koruma kalkar).

| Sprint | İş | Durum |
|--------|-----|-------|
| **3.5.1** | Audiobook veri modeli + storage: `AudiobookManifest`/genişletilmiş RenderManifest, `AudiobookService` (audiobooks/ load/save/list), PathService audiobook path'leri, slug üretimi+çakışma | ⬜ |
| **3.5.2** | Audiobook oluşturma (backend): kitaptan (reviewed snapshot→chunk) + txt'den (normalize→chunk). ChunkBuilderService yeniden kullanılır | ⬜ |
| **3.5.3** | Sol navbar "Audiobooks" sekmesi + AudiobookLibrary (kart listesi) + "Yeni Audiobook" dialog (PDF seç / txt yükle) | ⬜ |
| **3.5.4** | AudiobookDetail sayfası (görünüm): chunk kutuları, section-gruplu soldan-sağa grid, üst meta (chunk sayısı, sayfa aralığı) | ⬜ |
| **3.5.5** | Chunk edit: textarea + blur-save + canlı sayaç + PUT + Done→Stale | ⬜ |
| **3.5.6** | RenderJob (BackgroundTaskQueue) — sıralı render, SignalR progress, resume, hata→dur; `/render` PCM_S16+süre header; .NET `audio/{id}.wav` yazar | ⬜ |
| **3.5.7** | Yeniden render (tek chunk) + chunk ekle/çıkar (CRUD) | ⬜ |
| **3.5.8** | ffmpeg ön-koşul + merge + mp3/format + SRT (chunk süresi = altyazı) | ⬜ |
| **3.5.9** | Atıl kod temizliği (aşağıdaki envanter) | ⬜ |

**Silinecek/taşınacak atıl kod envanteri (her sprint'te ilgili parça temizlenir):**
- ReviewToolbar: "Kitabı Seslendir" butonu + `onNarrateBook` prop + `Headphones` import (B1).
- ReviewPage: `chunkBookMutation`.
- App.tsx: `/render/:slug` route → audiobook route'una taşınır/silinir.
- RenderPage.tsx: AudiobookDetail'e evrilir; eski silinir.
- SectionEndpoints: `ChunkBook` (POST /chunk) + `GetRender` (GET /render) → audiobook endpoint'lerine taşınır, eskiler silinir.
- api.ts: `chunkBook`, `getRender` → audiobook fonksiyonlarına dönüşür; `BookSummary.chunk_count` book context'inde anlamsız (kalkar/gizlenir).
- BookEndpoints: `ReadChunkCount` / `chunk_count` book özetinden kalkar.
- PathService: `RenderManifestPath` (`workspace/{slug}/render.json`) → audiobook storage'ına taşınır.

**Kalıcı çekirdek (DOKUNULMAZ, audiobook'ta yeniden kullanılır):** ChunkBuilderService, ChunkStatus, ChunkConfig, RenderManifest (genişletilir), RenderService, ChunkEntry.

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

**Faz 2 (review) tamamlandı** — PageContent[] geçişi (2.0–2d), raw/reset/cleanup-global (2e)
ve UX cilası (2f) bitti, commit edildi. Review pipeline'ı fonksiyonel, cilalı ve tutarlı.

Ertelenenler: 1.2b (ses işleme), B4 (TextProcessor Exe→Library), B6 (çift istek),
B7 (Pyrefly kozmetik).

**Faz 3 render foundation tamam** (3.1 veri modeli, 3.2 ChunkBuilder, 3.3a chunk
endpoint, 3.3b-1 minimal RenderPage — commit'li). **Mimari dönüş:** render artık
ayrı bir **Audiobook Context** (Faz 3.5) — PDF-review'dan bağımsız, kendi entity'si
(M1), snapshot (K1), iki girdi (kitap seç / txt yükle, T3), sıkı sınır (B1).

**Sıradaki: Faz 3.5.1 — Audiobook veri modeli + storage.** AudiobookManifest
(genişletilmiş RenderManifest: source_type/source_ref/title), AudiobookService
(audiobooks/ load/save/list), PathService audiobook path'leri, slug üretimi+çakışma.
Sonra 3.5.2 (oluşturma backend) → 3.5.3 (navbar+library+dialog) → 3.5.4 (detay görünüm)
→ 3.5.5 (edit) → 3.5.6 (render) → 3.5.7 (re-render/CRUD) → 3.5.8 (merge/SRT) →
3.5.9 (atıl kod temizliği).

Atıl kod envanteri Faz 3.5 bölümünde — her sprint'te ilgili parça temizlenir.
Prompt öncesi güncel repomix yüklenir ve son sprint izleri grep'le doğrulanır.
