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

Bu çalışmalar resmi faz numaralandırması öncesinde, Review/Cleanup
akışındaki kritik bug'ları gidermek için yapıldı.

| # | İş | Durum |
|---|-----|-------|
| F-1 | PDF extraction: digit separation (`ExtractPageText`) | ✅ |
| F-2 | Pipeline sırası: `RemovePageNumbers` → `JoinBrokenLines` | ✅ |
| F-3 | `StripEmbeddedPageNumbers` — satır içi sayfa numarası temizleme | ✅ |
| F-4 | `JoinBrokenLines` — `IsShortUpperCase` guard (header birleşmesini önler) | ✅ |
| F-5 | Export: `StripPageMarkers` — `=== SAYFA N ===` strip | ✅ |
| F-6 | `mergeCrossPageHyphens` — `!l.deleted` + `!l.suspicious` + kelime bazında suspicious skip | ✅ |
| F-7 | `applyCleanup` — `!l.deleted` nonEmpty filtresi (position matching fix) | ✅ |
| F-8 | Live preview (`previewIds` / `previewCleanup`) — hook + UI wiring | ✅ |
| F-9 | Approve sonrası panel refresh — `resetQueries` | ✅ |
| F-10 | Section reset endpoint — `DELETE /sections/{id}/reviewed` | ✅ |
| F-11 | Delete page (`deletePage`) — tüm sayfa satırlarını deleted işaretle | ✅ |

---

## Build Hijyeni (Faz 1 sırasında, ad-hoc)

Derleme/tip hata listesini sıfırlamak için yapılan izole düzeltmeler.

| # | İş | Durum |
|---|-----|-------|
| H-1 | TS5101 — `tsconfig.json` `baseUrl` kaldırıldı (`paths` göreli; TS 6.x deprecation) | ✅ |
| H-2 | TS18048 — `ReviewPage.tsx` `sectionData` narrowing (`?.` susturma yerine açık guard) | ✅ |
| H-3 | CS8625 — `Section.ReviewedPath` `string?` yapıldı (Reset akışı null atıyor) | ✅ |

Sonuç: `.NET` build 0 warning / 0 error, UI `tsc` + `vite build` temiz, Python import temiz.

---

## FAZ 0 — Teknik Borç ve Kurulum Altyapısı

> **Neden:** Production seviyesinde bug'lar. Tüm sonraki fazlar bu altyapı
> üzerine inşa edilir.

| Sprint | İş | Durum |
|--------|-----|-------|
| **0.1** | BackgroundService Queue (`Task.Run` kaldırıldı, `Channel<IJob>` + `QueuedHostedService` + `ExtractJob`) | ✅ |
| **0.2** | ManifestService Distributed Lock (`SemaphoreSlim` per-slug, `UpdateAsync`) | ✅ |
| **0.3** | Dependency Injection Cleanup (`ExtractConfig`, servisler `AddScoped`, `IServiceProvider` scope) | ✅ |
| **0.4** | Zombie Process Cleanup (`ApplicationStopping` hook, PID dosyası, orphan tespiti) | ⬜ (ertelendi → Faz 1.2 sonrası) |
| **0.5** | setup.bat + start.bat (full Python installer + cu121 reconcile + .env.example + API build fix + npm install) | ✅ |

### Sprint 0.4 — Zombie Process Cleanup `⬜`
**Neden:** Uygulama crash olduğunda Python/Ollama process'leri arka planda kalır.
- `IHostApplicationLifetime.ApplicationStopping` hook
- SIGTERM → 5sn bekle → SIGKILL
- `config/{id}.pid` dosyası yönetimi
- Başlangıçta port 5001 orphan tespiti
- **Kısmen yapıldı (dev-orchestration):** `npm run dev` `--kill-others` + `start.ps1` çıkışta `taskkill /T /F` + 5000/5173 orphan port süpürmesi. Ctrl+C sonrası orphan kalmıyor.
- **Kalan kapsam:** Gerçek servis process yönetimi (FastAPI/Ollama) — PID dosyası, SIGTERM→SIGKILL, başlangıçta orphan tespiti. Faz 1.2 sonrasına ertelendi (yöneteceği process orada doğuyor).

### Sprint 0.5 — setup.bat + start.bat `✅`
**Neden:** Yeni makinede `git clone` + `setup.bat` = çalışır sistem.
- `.env.example` (versiyonlu şablon) + `setup.ps1`: .env türetme, klasör yapısı, API csproj build (TextProcessor değil), npm install (root + src/ui)
- `setup_python.ps1`: py -3.11 tespit (auto-install YOK) → repo/venv → resemble-ai/chatterbox klon → numpy → torch cu121 (pinli 2.5.1) → `pip install -e chatterbox` → `requirements.txt` → cu121 torch reconcile guard → .env'e absolute CHATTERBOX_SRC/PYTHON_VENV. **Temiz venv'de uçtan uca doğrulandı.**
- `.gitignore`: `venv/`, `chatterbox/`
- `setup.bat` / `start.bat` ince launcher; `start.ps1` health-poll + `npm run dev` + tarayıcı aç
- **B2 (SignalR proxy):** metha tek makinede tekrarlanamadı, ikinci makine kaldırıldı → kapatıldı.
- `config/services.json` default: Faz 2'ye ertelendi (şema henüz tanımsız).

---

## FAZ 1 — TTS Servis Mimarisi

> **Neden:** Model her render'da yükleniyor. Yeni engine eklemek mevcut kodu
> baştan yazmayı gerektiriyor. FastAPI + abstraction ile model RAM'de kalıcı.

| Sprint | İş | Durum |
|--------|-----|-------|
| **1.1** | BaseTTSEngine (ABC) + ChatterboxEngine adapter + registry (`src/tts/`, smoke test: load→synthesize→unload, VRAM ~3.2GB→~8MB) | ✅ |
| **1.2** | FastAPI TTS Servisi (port 5001) | 🔵 |
| **1.3** | .NET → TTS Proxy (`TtsEndpoints`, `VoiceEndpoints`, IHttpClientFactory) | ⬜ |
| **1.4** | render_chunks.py retire (`scripts/legacy/`'e taşı) | ⬜ |

### Sprint 1.2 — FastAPI TTS Servisi `🔵`
İki alt-sprint olarak bölündü:

- **1.2a — Çekirdek servis**
  - **1.2a-i** `✅` — `requirements.txt` (torch'suz: fastapi, uvicorn[standard], nvidia-ml-py) + `setup_python.ps1`'e `-r` adımı + cu121 reconcile guard. **B5'i kapattı, temiz venv'de doğrulandı.**
  - **1.2a-ii** `⬜` — `src/tts/app.py`: FastAPI app, lazy singleton engine, endpoint'ler: `/health` (pynvml VRAM), `/engines`, `/engines/load`, `/engines/unload`, `/render` (ham wav bytes döner).
- **1.2b — Ses işleme** `⬜` (ertelendi) — `/voices/process`, `/voices/test` (ffmpeg normalize + noisereduce + 16kHz). 1.2a şişmesin diye ayrıldı.

**1.2 tasarım kararları (kilitli):**
- **Servis otomatik kalkmaz.** `start.bat` yalnızca .NET API (5000) + UI (5173) ayağa kaldırır. TTS servis process'i Faz 2 ProcessManager + UI ile elle tetiklenir.
- **Model lazy.** App startup'ta `load()` ÇAĞIRMAZ; engine `is_loaded=False` bekler. Model yalnızca `/engines/load` ile yüklenir, `/engines/unload` ile boşalır (VRAM guard).
- **Tek-engine.** App state'inde tek instance; yeni load öncesi eskisi unload (8GB VRAM).
- **`/render` ham wav bytes döner.** Dosya sistemi sahibi .NET orkestratör; her chunk'ı `workspace/{slug}/audio/{id}.wav`'a yazar → parça-bazlı dinle/sil/yeniden-üret.
- **uvicorn:** `app.py` `__main__` bloğu (manuel/standalone) + Faz 2 ProcessManager `python -m uvicorn src.tts.app:app --port 5001`.

**Faz 1 notları:**
- `requirements.txt` **torch/torchaudio İÇERMEZ** (cu121 `--index-url` ile kurulur; PyPI'den çekilmemeli). `numpy` da `setup_python.ps1`'de yönetilir. Servis deps: fastapi, uvicorn[standard], nvidia-ml-py (pynvml değil — deprecation uyarısı guard'ı aborte ediyordu).
- **B5 deseni `setup_python.ps1`'de kalıcı:** her `pip install` torch'u 2.6.0 CPU'ya düşürebilir → kurulum sonunda cu121 reconcile guard zorunlu. (chatterbox 0.1.7 `torch==2.6.0` pinler; cu121 index'i 2.5.1 sunar; pip "incompatible" uyarısı KOZMETİK — `2.5.1+cu121` runtime'da çalışıyor, smoke test geçti.)
- `unload()` zorunlu: `del model` + `gc.collect()` + `torch.cuda.empty_cache()`.
- Voice processor (1.2b): ffmpeg normalize + gürültü temizleme + 16kHz mono.

---

## FAZ 2 — Service Orchestration

> **Neden:** Kullanıcı UI'dan servisleri yönetebilmeli. RAM yetersizse
> başlatma engellenmeli.

| Sprint | İş | Durum |
|--------|-----|-------|
| **2.1** | ServiceRegistry + ProcessManager (services.json, start/stop, PID, RAM/VRAM) | ⬜ |
| **2.2** | System Monitor Endpoints (`/api/system/health` — RAM/VRAM/disk) | ⬜ |
| **2.3** | SignalR genişletme (ServiceStateChanged, RamUsageUpdated, RenderProgress, VoiceProcessed) | ⬜ |
| **2.4** | Service Control Endpoints (`/api/services/{id}/start|stop`, RAM pre-check) | ⬜ |

**Faz 2 notu:** Sprint 0.4'ün ertelenen kapsamı (gerçek servis process yönetimi: PID, SIGTERM→SIGKILL, orphan tespiti) burada, 2.1 ProcessManager ile birlikte ele alınır.

---

## FAZ 3 — UI Genişletmesi

> **Neden:** Backend hazır, kullanıcı her şeyi UI'dan yönetebilmeli.

| Sprint | İş | Durum |
|--------|-----|-------|
| **3.1** | Cleanup Panel Accordion (sol sidebar'a taşı, HIGH/MEDIUM/LOW grupları) | ⬜ |
| **3.2** | Services Dashboard (Settings sekmesi, RAM bar, start/stop, GPU temp) | ⬜ |
| **3.3** | Voice Management UI (yükleme sihirbazı, 3 varyant test, profil kaydet) | ⬜ |
| **3.4** | Render UI (kaynak seçimi, ses profili, progress, duraklat/durdur/devam) | ⬜ |
| **3.5** | Output + Storage Manager (sayfa bazlı silme, purge, storage özeti) | ⬜ |

**Faz 3 notları:**
- Sprint 3.1 için Prompt 15 (CleanupPanel accordion) hazır taslak mevcut.
- B1 (autoSaveTimer cleanup) ve B3 (pagesToContent merge bake) bu fazın hedefiydi; ikisi de **erken kapatıldı** (detay borç tablosunda).

---

## FAZ 4 — Chunk Pipeline ve Altyazı

> **Neden:** Sayfa takibi, kısmi silme ve SRT altyazı için chunk pipeline'ı
> timestamp ve sayfa bilgisi yazmalı.

| Sprint | İş | Durum |
|--------|-----|-------|
| **4.1** | Chunk pipeline yenileme (her chunk'a `page`, `type`, page_marker chunk'ları) | ⬜ |
| **4.2** | SRT altyazı üretimi (`generate_srt.py`, `[Sayfa N]` marker'lı) | ⬜ |

**Faz 4 notu:** Manifest chunk şemasındaki `type`, `page`, `subtitle_start_ms`,
`subtitle_end_ms` ve `render_state` alanları bu fazda eklenir (README'deki
"hedef şema" notuna bakınız). Arayüzden altyazı *düzenleme* henüz roadmap'te
madde değil — ürün gereksinimi olarak not edildi, Faz 4'e gelince eklenecek.

---

## FAZ 5 — Ollama Entegrasyonu

> **Neden:** Yabancı kelime tespiti, rakam/kısaltma düzeltme, telaffuz.

| Sprint | İş | Durum |
|--------|-----|-------|
| **5.1** | Ollama Proxy (`/api/ollama/*`, keep_alive ayarlanabilir) | ⬜ |
| **5.2** | preprocess_ollama.py (rakam→yazı, kısaltma açma, fonetik) | ⬜ |
| **5.3** | Ollama UI (model pull/delete, kitap bazında model seçimi) | ⬜ |

---

## Açık Bug'lar ve Teknik Borç

| # | Sorun | Öncelik | Hedef Sprint |
|---|-------|---------|--------------|
| **B1** | `autoSaveTimer` unmount cleanup — ✅ KAPANDI (B3 ile birlikte erken; unmount useEffect) | — | Kapandı |
| **B2** | SignalR WebSocket proxy ikinci makinede kopuyordu — ✅ KAPANDI (0.5: tek makinede tekrarlanamadı, ikinci makine kaldırıldı) | — | Kapandı |
| **B3** | `pagesToContent` merge bake — ✅ KAPANDI (`mergeDeleted` flag + `pagesToContent` `originalText` yazıyor → idempotent; eski baked reviewed dosyaları Reset gerektirir) | — | Kapandı |
| **B4** | `Program.cs` (TextProcessor) hâlâ standalone CLI — API ile çakışan extract yolu, ileride retire | Düşük | 1.4 |
| **B5** | `pip install` chatterbox torch'unu (==2.6.0 CPU) getirip cu121 build'i ezebilir — ✅ KAPANDI (1.2a-i: `setup_python.ps1` pinli cu121 + reconcile guard + nvidia-ml-py; temiz venv'de doğrulandı). Desen Faz 1+ kurulum adımlarında KORUNMALI | — | Kapandı |

---

## Faz Bağımlılık Grafiği

```
Faz 0 (0.4 ertelendi → Faz 1.2 sonrası)
  └─► Faz 1 (TTS abstraction + FastAPI)   [1.1 ✅, 1.2 🔵]
        └─► Faz 2 (service orchestration)
              └─► Faz 3 (UI)
                    └─► Faz 4 (chunk pipeline + SRT)
                          └─► Faz 5 (Ollama)

Bağımsız / paralel:
  Sprint 3.1 (cleanup accordion)
```

---

## Önemli: Repomix Senkronizasyonu

Claude project knowledge'ı bir repomix snapshot'ıdır ve **otomatik
güncellenmez**. Antigravity'nin yaptığı kod değişiklikleri (ve bazen
prompt-dışı düzeltmeleri) project knowledge'a yansımayabilir.

**Kural:** Yeni bir sprint prompt'u üretilmeden önce güncel repomix
yüklenmelidir. Aksi halde Claude eski kod üzerine prompt üretir.

---

## Antigravity Çalışma Kuralı (oturum dersi)

Antigravity birkaç kez prompt-dışı inisiyatif aldı (sistem Python kurulumu,
`$env:PYTHONWARNINGS` ekleme, script'i kendiliğinden değiştirip yeniden
çalıştırma). **Kural:** Her prompt'a açık kısıt eklenir —
*"Test FAIL olursa DUR ve bildir; script'i kendiliğinden değiştirme/yeniden
çalıştırma, eksik bağımlılık KURMA."* Kurulum/venv gibi riskli operasyonlar
Antigravity'ye değil, kullanıcıya manuel bırakılır.

---

## Sprint Tamamlanma Kriteri (Genel)

Her sprint sonunda:
1. İlgili dosya/klasör varlığı doğrulandı
2. Manuel test adımları geçti
3. `TEST PASSED` terminale yazıldı
4. Bu dosyada ilgili sprint `✅` işaretlendi
5. Büyük sprint sonrası `git push`
6. Yeni script/servis README ve gerekirse CLAUDE.md'ye eklendi

---

## Sıradaki Adım

**Sprint 1.2a-ii — `src/tts/app.py` (FastAPI TTS servisi).**
1.1 ✅, 1.2a-i ✅ (kurulum altyapısı temiz venv'de doğrulandı, B5 kapandı).
Tasarım kararları kilitli: lazy singleton engine (startup'ta yüklemez),
5 endpoint (`/health` pynvml VRAM, `/engines`, `/engines/load`,
`/engines/unload`, `/render` ham wav bytes), tek-engine, servis otomatik
kalkmaz. Prompt öncesi güncel repomix yüklenir.
