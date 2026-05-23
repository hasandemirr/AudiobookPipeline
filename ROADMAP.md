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

## FAZ 0 — Teknik Borç ve Kurulum Altyapısı

> **Neden:** Production seviyesinde bug'lar. Tüm sonraki fazlar bu altyapı
> üzerine inşa edilir.

| Sprint | İş | Durum |
|--------|-----|-------|
| **0.1** | BackgroundService Queue (`Task.Run` kaldırıldı, `Channel<IJob>` + `QueuedHostedService` + `ExtractJob`) | ✅ |
| **0.2** | ManifestService Distributed Lock (`SemaphoreSlim` per-slug, `UpdateAsync`) | ✅ |
| **0.3** | Dependency Injection Cleanup (`ExtractConfig`, servisler `AddScoped`, `IServiceProvider` scope) | ✅ |
| **0.4** | Zombie Process Cleanup (`ApplicationStopping` hook, PID dosyası, orphan tespiti) | ⬜ |
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
- `setup_python.ps1`: py -3.11 tespit (auto-install YOK) → repo/venv → resemble-ai/chatterbox klon → numpy → torch cu121 → `pip install -e chatterbox` → cu121 torch reconcile guard → .env'e absolute CHATTERBOX_SRC/PYTHON_VENV
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
| **1.2** | FastAPI TTS Servisi (port 5001, /render, /engines, /voices, /health) | ⬜ |
| **1.3** | .NET → TTS Proxy (`TtsEndpoints`, `VoiceEndpoints`, IHttpClientFactory) | ⬜ |
| **1.4** | render_chunks.py retire (`scripts/legacy/`'e taşı) | ⬜ |

**Faz 1 notları:**
- `requirements.txt` bu fazda güncellenir: fastapi, uvicorn, pynvml, noisereduce, ffmpeg-python eklenir. **(Bkz. B5: kurulum cu121 torch reconcile desenini korumalı.)**
- `unload()` zorunlu: `del model` + `gc.collect()` + `torch.cuda.empty_cache()`.
- Voice processor: ffmpeg normalize + gürültü temizleme + 16kHz mono.

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
- ✅ KAPANDI (B3 ile birlikte erken yapıldı).
- ✅ KAPANDI (idempotent merge; detay borç tablosunda).

---

## FAZ 4 — Chunk Pipeline ve Altyazı

> **Neden:** Sayfa takibi, kısmi silme ve SRT altyazı için chunk pipeline'ı
> timestamp ve sayfa bilgisi yazmalı.

| Sprint | İş | Durum |
|--------|-----|-------|
| **4.1** | Chunk pipeline yenileme (her chunk'a `page`, `type`, page_marker chunk'ları) | ⬜ |
| **4.2** | SRT altyazı üretimi (`generate_srt.py`, `[Sayfa N]` marker'lı) | ⬜ |

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
| **B5** | `pip install` (ör. requirements.txt güncellemesi) chatterbox bağımlılık ağacını yeniden çözüp CPU torch'u geri getirebilir — 0.5'te reconcile guard yakaladı; Faz 1+ kurulum adımları cu121 reconcile desenini korumalı | Orta | 1.x |

---

## Faz Bağımlılık Grafiği

```
Faz 0 (0.4, 0.5 kaldı)
  └─► Faz 1 (TTS abstraction + FastAPI)
        └─► Faz 2 (service orchestration)
              └─► Faz 3 (UI)
                    └─► Faz 4 (chunk pipeline + SRT)
                          └─► Faz 5 (Ollama)

Bağımsız / paralel:
  Sprint 3.1 (cleanup accordion)
  Sprint 0.5 (setup.bat) — ✅
```

---

## Önemli: Repomix Senkronizasyonu

Claude project knowledge'ı bir repomix snapshot'ıdır ve **otomatik
güncellenmez**. Sprint 0.1/0.2/0.3 değişiklikleri Antigravity tarafından
yapıldı ama project knowledge hâlâ bu değişiklikler öncesini gösterebilir.

**Kural:** Yeni bir sprint prompt'u üretilmeden önce güncel repomix
yüklenmelidir. Aksi halde Claude eski kod üzerine prompt üretir.

---

## Sprint Tamamlanma Kriteri (Genel)

Her sprint sonunda:
1. İlgili dosya/klasör varlığı doğrulandı
2. Manuel test adımları geçti
3. `TEST PASSED` terminale yazıldı
4. Bu dosyada ilgili sprint `✅` işaretlendi (Claude prompt üretir, Antigravity günceller)
5. Büyük sprint sonrası `git push`
6. Yeni script/servis README ve gerekirse CLAUDE.md'ye eklendi

---

## Sıradaki Adım

**Sprint 1.1 — BaseTTSEngine (ABC) + ChatterboxEngine adapter + registry.**
Faz 0 tamam (0.1–0.3, 0.5 ✅; 0.4 Faz 1.2 sonrasına ertelendi). B1/B3 ve
dev-orchestration teardown kapatıldı. Chatterbox kurulu (0.5b) → TTS servis
mimarisine geçiş açık. Ana tartışma: engine ABC arayüz tasarımı
(`load`/`unload`/`synthesize`/`health` imzaları + adapter'ın
`ChatterboxMultilingualTTS`'i sarması).
