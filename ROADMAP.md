# AudiobookPipeline — Roadmap & Sprint Manifestosu

> **Son güncelleme:** 2025  
> **Takip kuralı:** Her sprint tamamlandığında status güncellenir.  
> Sprint başlamadan önce önceki sprint'in testi geçmiş olmalıdır.

---

## Durum Göstergeleri

| Sembol | Anlam |
|--------|-------|
| `⬜` | Bekliyor |
| `🔵` | Devam ediyor |
| `✅` | Tamamlandı |
| `❌` | Bloke / Başarısız |

---

## Mimari Prensipleri

1. **Tek Giriş Noktası** — React UI yalnızca `.NET API`'yi görür. TTS, Ollama, PDF servisleri UI'a doğrudan açık değildir.
2. **Manifest Merkezi Doğruluk Kaynağı** — Her kitabın durumu `manifest.json`'da yaşar. Hiçbir servis manifest'i bypass edemez.
3. **Servisler Talep Üzerine Çalışır** — Kullanıcı UI'dan hangi servisin çalışacağına karar verir. Kullanılmayan servis RAM'de yer kaplamaz.
4. **Resume Her Yerde** — Uzun süren işlemler her chunk bazında durumu manifest'e yazar. "Devam Et" her zaman mümkündür.
5. **Abstraction Önce** — TTS engine, PDF extractor, LLM — hepsi interface arkasına alınır. Yeni model eklemek mevcut kodu bozmaz.

---

## Hedef Mimari

```
React UI (port 5173 dev / .NET static prod)
    │
    ▼ HTTP + SignalR
.NET Orchestrator API (port 5000)
    │
    ├── BackgroundTaskQueue  (Channel<IJob>)
    ├── ServiceRegistry      (ProcessManager)
    ├── ManifestService      (SemaphoreSlim per-slug)
    └── PathService
    │
    ├──► PDF Extractor (in-process)
    ├──► FastAPI TTS Service (port 5001)
    │         └── engines/ [chatterbox | fish_speech | coqui]
    └──► Ollama (port 11434)
```

---

## Netleşmiş Kararlar

| Konu | Karar |
|------|-------|
| TTS çalışma şekli | FastAPI micro-service — model RAM'de kalıcı |
| Engine abstraction | Python ABC — yeni model = sadece adapter |
| Servis yönetimi | .NET ProcessManager — tek orchestrator |
| RAM kontrolü | Başlatma öncesi pre-check |
| VRAM boşaltma | `gc.collect()` + `torch.cuda.empty_cache()` |
| Manifest eş zamanlılık | SemaphoreSlim per-slug |
| Arka plan işleri | BackgroundService + Channel — fire-and-forget yok |
| Altyazı formatı | SRT, sayfa marker chunk'lı |
| Kısmi silme | Sayfa bazlı — manifest chunk status reset |
| Ses kalite katmanı | ffmpeg normalize + parametre profili (3 varyant test) |
| Resume | Manuel "Devam Et" butonu |
| Ollama keep_alive | UI'dan ayarlanabilir |
| Seslendirme kaynağı | Approved export TXT veya harici TXT yükleme |
| UI giriş noktası | Yalnızca .NET API |
| Kurulum | `setup.bat` + `start.bat` |

---

## FAZ 0 — Teknik Borç ve Kurulum Altyapısı

> **Neden:** Production seviyesinde bug'lar mevcut. Tüm sonraki fazlar bu
> altyapı üzerine inşa edilecek. Bu faz tamamlanmadan yeni özellik eklemek
> race condition ve veri kaybı riskini artırır.

---

### Sprint 0.1 — BackgroundService Queue `⬜`

**Neden:** `Task.Run` fire-and-forget pattern'ı production'da kabul edilemez.
Uygulama restart'ta iş sessizce kaybolur, exception yakalanmaz, aynı slug
için iki istek race condition üretir.

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Jobs/IJob.cs`
- `src/Api/AudiobookPipeline.Api/Jobs/ExtractJob.cs`
- `src/Api/AudiobookPipeline.Api/Jobs/BackgroundTaskQueue.cs`
- `src/Api/AudiobookPipeline.Api/Endpoints/ExtractEndpoints.cs` (güncelleme)
- `src/Api/AudiobookPipeline.Api/Program.cs` (güncelleme)

**Yapılacaklar:**
- [ ] `IJob` interface: `ExecuteAsync(CancellationToken)`
- [ ] `ExtractJob : IJob` — mevcut `RunExtract` mantığı buraya taşınır
- [ ] `RenderJob : IJob` — ileride TTS render için iskelet
- [ ] `BackgroundTaskQueue : BackgroundService` — `Channel<IJob>` unbounded, tek consumer
- [ ] `ExtractEndpoints` → `Task.Run` kaldırılır, job queue'ya eklenir
- [ ] `Program.cs` → `AddHostedService<BackgroundTaskQueue>`

**Test kriteri:**
Extract başlatılır → uygulama restart edilir → job kayıt altında görünür →
"Devam Et" ile kaldığı yerden devam eder. `TEST PASSED` terminale yazılır.

---

### Sprint 0.2 — ManifestService Distributed Lock `⬜`

**Neden:** İki eş zamanlı istek (approve + narrate toggle) aynı manifest'i
okuyup yazarsa biri diğerinin değişikliğini ezer. İki sekme ile tetiklenebilir.

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Services/ManifestService.cs`

**Yapılacaklar:**
- [ ] `ConcurrentDictionary<string, SemaphoreSlim>` per-slug lock
- [ ] `UpdateAsync<T>(slug, Func<BookManifest, Task<T>>)` wrapper
- [ ] Tüm endpoint'lerdeki okuma/yazma çiftleri wrapper'dan geçirilir
- [ ] Lock timeout: 30 saniye → `503 Service Unavailable`

**Test kriteri:**
Aynı slug'a eş zamanlı 10 istek → manifest tutarlılığı doğrulanır.
`TEST PASSED` terminale yazılır.

---

### Sprint 0.3 — Dependency Injection Cleanup `⬜`

**Neden:** Endpoint'ler içinde `new Service()` pattern'ı test edilemez,
mock edilemez, config değişiminde recompile gerektirir.

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Program.cs`
- `src/Api/AudiobookPipeline.Api/Config/ExtractConfig.cs`
- `src/Api/AudiobookPipeline.Api/Endpoints/ExtractEndpoints.cs`

**Yapılacaklar:**
- [ ] `ExtractConfig` record: `MinRepeatCount`, `ScanLines`, `TokenCount`
- [ ] `PdfExtractService`, `TocParserService`, `OcrFixService` → `AddScoped`
- [ ] `HeaderFooterDetector` → `AddScoped`, `IOptions<ExtractConfig>` ile config
- [ ] Endpoint handler'lar constructor injection ile servis alır
- [ ] `appsettings.json` güncellenir

**Test kriteri:**
`appsettings.json` değerleri değiştirilir → recompile olmadan davranış değişir.
`TEST PASSED` terminale yazılır.

---

### Sprint 0.4 — Zombie Process Cleanup `⬜`

**Neden:** Uygulama crash olduğunda Python ve Ollama process'leri arka planda
kalır. Sonraki başlatmada port çakışması veya RAM israfı oluşur.

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Services/ProcessCleanupService.cs`
- `src/Api/AudiobookPipeline.Api/Program.cs`

**Yapılacaklar:**
- [ ] `IHostApplicationLifetime.ApplicationStopping` hook
- [ ] `ProcessCleanupService.DisposeAll()` → SIGTERM → 5sn bekle → SIGKILL
- [ ] Başlangıçta orphan process tespiti: port 5001 kontrolü
- [ ] PID dosyası: `config/{id}.pid` — başlangıçta yazar, kapanışta siler

**Test kriteri:**
TTS servisi çalışırken uygulama Task Manager'dan kill edilir → yeniden
başlatılınca port çakışması olmaz. `TEST PASSED` terminale yazılır.

---

### Sprint 0.5 — setup.bat + start.bat `⬜`

**Neden:** Yeni makinede kurulum şu an manuel ve hata prone.
Hedef: `git clone` + `setup.bat` = çalışır sistem.

**Dosyalar:**
- `setup.bat`
- `start.bat`
- `config/services.json` (default)
- `voices/registry.json` (boş default)

**Yapılacaklar:**

`setup.bat`:
- [ ] .NET SDK varlık kontrolü → yoksa hata + link
- [ ] Node.js varlık kontrolü → yoksa hata + link
- [ ] Python 3.11 varlık kontrolü → yoksa hata + link
- [ ] NVIDIA driver kontrolü (`nvidia-smi`)
- [ ] `npm install` (root + src/ui)
- [ ] Chatterbox repo clone (yoksa `repo/chatterbox/`)
- [ ] Python venv oluşturma (`repo/venv/`)
- [ ] PyTorch CUDA 12.1 kurulumu
- [ ] Chatterbox gereksinimleri kurulumu
- [ ] `.env` dosyası oluşturma
- [ ] `config/services.json` yoksa default oluşturma
- [ ] `voices/registry.json` yoksa boş oluşturma
- [ ] CUDA doğrulama raporu

`start.bat`:
- [ ] `.env` varlık kontrolü → yoksa `setup.bat`'e yönlendir
- [ ] Hızlı sağlık kontrolü (Python, Chatterbox, .NET)
- [ ] `npm run dev` (API + UI eş zamanlı)
- [ ] Tarayıcı otomatik aç (`start http://localhost:5173`)

**Test kriteri:**
Temiz Windows makinesinde `setup.bat` → `start.bat` → uygulama açılır.
CUDA raporu doğru görünür. `TEST PASSED` terminale yazılır.

---

## FAZ 1 — TTS Servis Mimarisi

> **Neden:** Model her render'da yükleniyor (30-60 saniye). Yeni engine eklemek
> mevcut kodu baştan yazmayı gerektiriyor. FastAPI + abstraction ile model
> RAM'de kalıcı, yeni engine sadece adapter yazımı.

---

### Sprint 1.1 — BaseTTSEngine + ChatterboxEngine `⬜`

**Neden:** TTS logic `render_chunks.py`'ye Chatterbox'a hard-coded.
ABC ile engine değişimi mevcut kodu bozmaz.

**Dosyalar:**
- `src/services/tts/engines/base.py`
- `src/services/tts/engines/chatterbox_engine.py`
- `src/services/tts/engines/registry.py`

**Yapılacaklar:**
- [ ] `BaseTTSEngine(ABC)`: `load()`, `unload()`, `synthesize()`, `health()`
- [ ] `unload()` zorunlu içeriği: `del self.model`, `gc.collect()`, `torch.cuda.empty_cache()`
- [ ] `synthesize()` dönüşü: `float` (duration_sec)
- [ ] `health()` dönüşü: `{ loaded, vram_mb, model_name }`
- [ ] `ChatterboxEngine(BaseTTSEngine)` — `render_chunks.py` mantığı wrap edilir
- [ ] `ENGINE_REGISTRY = { "chatterbox": ChatterboxEngine }`

**Test kriteri:**
`ChatterboxEngine().load()` → `synthesize(test_text)` → WAV üretilir →
`unload()` → VRAM serbest kalır. `TEST PASSED` terminale yazılır.

---

### Sprint 1.2 — FastAPI TTS Servisi `⬜`

**Neden:** Model RAM'de kalıcı olsun. Her render'da 60 saniyelik yükleme kalksın.

**Dosyalar:**
- `src/services/tts/tts_service.py`
- `src/services/tts/voice_processor.py`

**Endpoint'ler:**
```
POST /render          { slug, chunk_id, text, engine, language, voice_path?, params }
POST /engines/load    { engine }
POST /engines/unload
GET  /engines
POST /voices/process  { input_path, output_path }
POST /voices/test     { voice_path, params, text }
GET  /health
```

**Yapılacaklar:**
- [ ] FastAPI app, uvicorn, port 5001
- [ ] Startup'ta engine yüklenmez — `POST /engines/load` ile yüklenir
- [ ] `voice_processor.py`: ffmpeg normalize + noisereduce + 16kHz mono
- [ ] `pynvml` ile VRAM ve GPU sıcaklık izleme
- [ ] Her request'te engine yüklü değilse `503` döner

**Test kriteri:**
`POST /engines/load` → `POST /render` → WAV üretilir →
`POST /engines/unload` → VRAM serbest. `TEST PASSED` terminale yazılır.

---

### Sprint 1.3 — .NET → TTS Proxy Endpoints `⬜`

**Neden:** UI doğrudan FastAPI'yi görmemeli. Tüm istekler `.NET` üzerinden geçmeli.

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Endpoints/TtsEndpoints.cs`
- `src/Api/AudiobookPipeline.Api/Endpoints/VoiceEndpoints.cs`
- `src/Api/AudiobookPipeline.Api/Program.cs`

**Endpoint'ler:**
```
POST   /api/tts/render/{slug}
POST   /api/tts/engines/load
POST   /api/tts/engines/unload
GET    /api/tts/engines
POST   /api/voices/process
POST   /api/voices/test
GET    /api/voices
POST   /api/voices
DELETE /api/voices/{id}
```

**Yapılacaklar:**
- [ ] `IHttpClientFactory` ile `HttpClient` yönetimi
- [ ] FastAPI çalışmıyorsa `503` + "TTS servisi kapalı" mesajı
- [ ] `VoiceEndpoints`: `voices/registry.json` CRUD
- [ ] `Program.cs`'de `AddHttpClient`

**Test kriteri:**
UI'dan render tetiklenir → `.NET` FastAPI'ye proxy yapar → WAV üretilir.
`TEST PASSED` terminale yazılır.

---

### Sprint 1.4 — render_chunks.py Retire `⬜`

**Neden:** FastAPI devreye girdikten sonra eski script gereksiz.
İki paralel TTS yolu race condition üretir.

**Dosyalar:**
- `scripts/legacy/render_chunks.py` (taşıma)
- `CLAUDE.md` (güncelleme)
- `ROADMAP.md` (güncelleme)

**Yapılacaklar:**
- [ ] `render_chunks.py` → `scripts/legacy/` klasörüne taşı
- [ ] `chunk_text.py` ve `merge_audio.py` korunur
- [ ] `CLAUDE.md` güncellenir
- [ ] `start.bat` güncellenir

**Test kriteri:**
Eski script path'i üzerinden render tetiklenmeye çalışılır → hata verilir.
FastAPI üzerinden render çalışır. `TEST PASSED` terminale yazılır.

---

## FAZ 2 — Service Orchestration

> **Neden:** Kullanıcı UI'dan servisleri yönetebilmeli. RAM yetersizse
> başlatma engellenmeli. Servis durumları anlık izlenebilmeli.

---

### Sprint 2.1 — ServiceRegistry + ProcessManager `⬜`

**Neden:** `config/services.json` tanımlarına göre servisleri başlatıp
durduran, PID takip eden, RAM/VRAM izleyen merkezi yönetici.

**Dosyalar:**
- `config/services.json`
- `src/Api/AudiobookPipeline.Api/Services/ServiceProcess.cs`
- `src/Api/AudiobookPipeline.Api/Services/ServiceRegistry.cs`

**`config/services.json` şeması:**
```json
{
  "services": [
    {
      "id": "tts",
      "name": "TTS — Chatterbox",
      "ram_mb": 4500,
      "vram_mb": 4200,
      "requires_cuda": true,
      "start_cmd": "python -m uvicorn tts_service:app --port 5001",
      "health_url": "http://localhost:5001/health",
      "in_process": false
    }
  ]
}
```

**Yapılacaklar:**
- [ ] `ServiceState` enum: `Stopped | Starting | Running | Stopping | Failed`
- [ ] `ServiceProcess`: start, stop, health check, PID yönetimi
- [ ] `ServiceRegistry`: services.json yükle, RAM/VRAM pre-check, SignalR notify
- [ ] SIGTERM → 5sn → SIGKILL graceful shutdown
- [ ] `config/{id}.pid` dosyası yönetimi

**Test kriteri:**
UI'dan TTS başlatılır → `Running` state → durdurulur → `Stopped`.
RAM yetersizse başlatma reddedilir. `TEST PASSED` terminale yazılır.

---

### Sprint 2.2 — System Monitor Endpoints `⬜`

**Neden:** Kullanıcı servis başlatmadan önce yeterli kaynak olup olmadığını görmeli.

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Endpoints/SystemEndpoints.cs`

**Endpoint:**
```
GET /api/system/health
Response: {
  ram:  { total_mb, used_mb, free_mb },
  vram: { total_mb, used_mb, free_mb, gpu_name, temp_c },
  disk: { total_gb, used_gb, free_gb, workspace_gb, output_gb },
  services: [ { id, state, ram_mb, vram_mb, pid } ]
}
```

**Yapılacaklar:**
- [ ] RAM: `GC.GetGCMemoryInfo()` + `Process.GetCurrentProcess()`
- [ ] VRAM: FastAPI `/health` endpoint'inden çekilir
- [ ] Disk: `DriveInfo` ile workspace ve output boyutları
- [ ] GPU temp: FastAPI üzerinden `pynvml`

**Test kriteri:**
`GET /api/system/health` → tüm alanlar dolu ve doğru değerler.
`TEST PASSED` terminale yazılır.

---

### Sprint 2.3 — SignalR Genişletmesi `⬜`

**Neden:** Servis state değişimleri, RAM, render progress UI'a anlık iletilmeli.

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Hubs/ProgressHub.cs`

**Mevcut:** `ExtractProgress`

**Eklenecek eventler:**
```
ServiceStateChanged  → { serviceId, state, ram_mb, vram_mb }
RamUsageUpdated      → { ram_mb, vram_mb, services[] }
RenderProgress       → { slug, chunk_id, done, total, percent,
                         current_page, eta_sec }
VoiceProcessed       → { voice_id, status, error? }
```

**Yapılacaklar:**
- [ ] `ServiceStateChanged` eventi — state değişiminde
- [ ] `RamUsageUpdated` — her 5 saniyede broadcast (servis çalışıyorsa)
- [ ] `RenderProgress` — her chunk tamamlandığında
- [ ] `VoiceProcessed` — ses işleme tamamlandığında

**Test kriteri:**
TTS başlatılır → UI'da `ServiceStateChanged` alınır.
Render çalışırken her chunk'ta `RenderProgress` alınır.
`TEST PASSED` terminale yazılır.

---

### Sprint 2.4 — Service Control Endpoints `⬜`

**Neden:** UI'dan servis başlatma/durdurma API'ye bağlanmalı.

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Endpoints/ServiceEndpoints.cs`

**Endpoint'ler:**
```
GET  /api/services
POST /api/services/{id}/start
POST /api/services/{id}/stop
GET  /api/services/{id}/health
```

**Yapılacaklar:**
- [ ] Start öncesi RAM + VRAM pre-check
- [ ] Yetersizse `{ error: "insufficient_ram", required_mb, free_mb }` döner
- [ ] Stop: graceful shutdown, SignalR notify
- [ ] Health: servis'in kendi `/health`'ine proxy

**Test kriteri:**
RAM yetersizken start → `422` + açıklama mesajı.
Yeterli RAM'de start → `200` + Running state.
`TEST PASSED` terminale yazılır.

---

## FAZ 3 — UI Genişletmesi

> **Neden:** Backend altyapısı hazır. Kullanıcı her şeyi UI'dan yönetebilmeli.

---

### Sprint 3.1 — Cleanup Panel Accordion `🔵`

**Neden:** CleanupPanel sol sidebar'a taşınır, accordion gruplar ile
kullanıcı deneyimi iyileştirilir.

**Dosyalar:**
- `src/ui/src/components/review/CleanupPanel.tsx`
- `src/ui/src/pages/ReviewPage.tsx`

**Yapılacaklar:**
- [ ] CleanupPanel sol sidebar'a taşınır (SectionList altına)
- [ ] HIGH/MEDIUM/LOW accordion gruplar
- [ ] HIGH varsayılan açık, diğerleri kapalı
- [ ] Outer collapse toggle kaldırılır
- [ ] Apply ve Reset butonları her zaman görünür

**Test kriteri:**
Sol sidebar'da cleanup accordion görünür. HIGH expand, MEDIUM collapse.
Apply çalışır. `TEST PASSED` terminale yazılır.

---

### Sprint 3.2 — Services Dashboard `⬜`

**Neden:** Kullanıcı hangi servisin çalıştığını görmeli, başlatıp durdurabilmeli.

**Dosyalar:**
- `src/ui/src/pages/SettingsPage.tsx`
- `src/ui/src/components/settings/ServicesPanel.tsx`
- `src/ui/src/hooks/useServices.ts`
- `src/ui/src/lib/api.ts`

**UI:**
```
System Health
RAM:  ████████░░  6.2 / 16 GB
VRAM: ██████████  6.8 / 8 GB   GPU: RTX 2070 Super  62°C
Disk: ███░░░░░░░  124 / 512 GB

Services
┌────────────────────┬──────┬──────┬──────────────┐
│ PDF Extractor      │ 0.5G │  —   │ ● Running    │
│ TTS — Chatterbox   │ 4.5G │ 4.2G │ ● Running ■  │
│ Ollama             │  —   │  —   │ ○ Stopped ▶  │
└────────────────────┴──────┴──────┴──────────────┘
```

**Yapılacaklar:**
- [ ] `useServices` hook: `/api/services` polling + SignalR `ServiceStateChanged`
- [ ] RAM/VRAM bar görselleştirme
- [ ] Start/Stop butonları
- [ ] RAM yetersiz uyarısı (disabled button + mesaj)
- [ ] GPU sıcaklık göstergesi

**Test kriteri:**
TTS durdurulup başlatılır, UI anlık güncellenir. RAM bar doğru değerleri gösterir.
`TEST PASSED` terminale yazılır.

---

### Sprint 3.3 — Voice Management UI `⬜`

**Neden:** Kullanıcı ses profili oluşturabilmeli, kaydedilmiş sesler arasından
seçim yapabilmeli.

**Dosyalar:**
- `src/ui/src/pages/SettingsPage.tsx`
- `src/ui/src/components/settings/VoicesPanel.tsx`
- `src/ui/src/components/settings/VoiceWizard.tsx`
- `src/ui/src/hooks/useVoices.ts`

**Sihirbaz adımları:**
1. Ses dosyası yükle (.wav / .mp3 / .m4a)
2. Otomatik işleme (normalize, gürültü, 16kHz)
3. 3 varyant render et — kullanıcı dinler, seçer
4. İsim ver, kaydet

**Yapılacaklar:**
- [ ] `VoiceWizard` 4 adımlı bileşen
- [ ] `useVoices` hook: registry CRUD
- [ ] Ses oynatma (HTML5 Audio)
- [ ] `POST /api/voices/process` → işleme progress
- [ ] `POST /api/voices/test` → 3 varyant render
- [ ] Kaydedilmiş sesler listesi: oynat, düzenle, sil

**Test kriteri:**
Ses yüklenir → işlenir → 3 varyant dinlenir → profil kaydedilir →
listede görünür. `TEST PASSED` terminale yazılır.

---

### Sprint 3.4 — Render UI `⬜`

**Neden:** Seslendirme akışı UI'a bağlanır. Progress, durdurma, devam etme.

**Dosyalar:**
- `src/ui/src/components/book/RenderPanel.tsx`
- `src/ui/src/hooks/useRender.ts`
- `src/ui/src/lib/api.ts`

**UI:**
```
Kaynak: ● Approved TXT  ○ Harici TXT yükle
Ses:    [ Erkek Sesi - Derin ▼ ]
Çıktı:  ☑ WAV  ☑ SRT

[ Seslendirmeyi Başlat ]

─── Aktif Render ───
Chunk 412/847  |  Sayfa 203  |  %48.6
Geçen: 4:12:33  |  Kalan: ~4:28

[ ⏸ Duraklat ]  [ ⏹ Durdur ]

─── Durdurulmuş Render ───
Kaldığı yer: Chunk 412 / Sayfa 203
[ ▶ Devam Et ]
```

**Yapılacaklar:**
- [ ] `useRender` hook: render state, SignalR `RenderProgress`
- [ ] Render başlatma: kaynak seçimi + ses profili seçimi
- [ ] Duraklat / Durdur / Devam Et
- [ ] ETA hesaplama (geçen süre / tamamlanan chunk oranı)
- [ ] Hatalı chunk listesi gösterimi

**Test kriteri:**
Render başlatılır → progress SignalR ile güncellenir → durdurulur →
"Devam Et" ile kaldığı yerden devam eder. `TEST PASSED` terminale yazılır.

---

### Sprint 3.5 — Output + Storage Manager `⬜`

**Neden:** Kullanıcı output'ları yönetebilmeli. Sayfa bazlı silme ile
kısmi yeniden render mümkün olmalı.

**Dosyalar:**
- `src/ui/src/components/book/OutputPanel.tsx`
- `src/Api/AudiobookPipeline.Api/Endpoints/OutputEndpoints.cs`

**UI:**
```
Output: ilyada
  ilyada.wav  2.3 GB  14:23:00  ⬇ İndir
  ilyada.srt  128 KB            ⬇ İndir

Sayfa bazlı silme:
  Sayfa [ ___ ]'dan itibaren sil
  → 435 chunk silinecek, manifest güncellenir

[ 🗑 Chunk WAV'ları sil ]
[ 🗑 Output'u sil ]
[ 🗑 Kitabı tamamen sil ]

Storage: Workspace 845MB | Output 2.3GB | Toplam 3.1GB
```

**Endpoint'ler:**
```
DELETE /api/books/{slug}/output/from-page/{page}
DELETE /api/books/{slug}/output/chunks
DELETE /api/books/{slug}/output
DELETE /api/books/{slug}
```

**Yapılacaklar:**
- [ ] Sayfa bazlı silme: chunk status'ları `pending`'e döndür, manifest güncelle
- [ ] Tüm output silme: WAV + SRT + manifest `render_state` reset
- [ ] Storage hesaplama endpoint'i
- [ ] Confirm dialog (destructive işlemler için)

**Test kriteri:**
Sayfa 200'den itibaren silinir → 647 chunk `pending` olur → "Devam Et"
ile 200. sayfadan devam edilir. `TEST PASSED` terminale yazılır.

---

## FAZ 4 — Chunk Pipeline ve Altyazı

> **Neden:** Sayfa takibi, kısmi silme ve SRT altyazı için chunk pipeline'ının
> timestamp ve sayfa bilgisi yazması şart.

---

### Sprint 4.1 — Chunk Pipeline Yenileme `⬜`

**Neden:** `chunk_text.py` sayfa bilgisi olmadan chunk üretiyor.
Manifest'e `page`, `type`, `subtitle_start_ms` eklenmeli.

**Dosyalar:**
- `scripts/chunk_text.py`
- Manifest şeması güncelleme

**Yeni chunk şeması:**
```json
{
  "id": "chunk_042",
  "type": "page_marker",
  "page": 14,
  "text": "",
  "char_count": 0,
  "status": "pending",
  "audio_duration_sec": 0.3,
  "subtitle_start_ms": 0,
  "subtitle_end_ms": 0,
  "retries": 0
}
```

**Yapılacaklar:**
- [ ] `=== SAYFA N ===` marker'ları okunarak her chunk'a `page` alanı eklenir
- [ ] Her sayfa geçişine `type: "page_marker"` chunk eklenir (300ms sessizlik)
- [ ] `render_state` alanı manifest'e eklenir
- [ ] `subtitle_start_ms` / `subtitle_end_ms` render sırasında hesaplanır

**Test kriteri:**
`chunk_text.py` çalıştırılır → her chunk'ta `page` alanı var →
sayfa geçişlerinde `page_marker` chunk'ları var. `TEST PASSED` terminale yazılır.

---

### Sprint 4.2 — SRT Altyazı Üretimi `⬜`

**Neden:** Her chunk'ın timestamp bilgisi SRT formatına dönüştürülür.
Sayfa marker'ları altyazıda `[Sayfa N]` olarak görünür.

**Dosyalar:**
- `scripts/generate_srt.py`
- `src/services/tts/tts_service.py` (güncelleme)

**SRT örnek:**
```
1
00:00:00,000 --> 00:00:03,240
Birinci bölümde Akhilleus...

42
00:02:04,800 --> 00:02:05,100
[Sayfa 14]

43
00:02:05,100 --> 00:02:08,450
Akhilleus öfkeyle gemilere döndü.
```

**Yapılacaklar:**
- [ ] Render tamamlandıktan sonra `generate_srt.py` otomatik çalışır
- [ ] Timestamp'ler chunk `audio_duration_sec` toplamından hesaplanır
- [ ] `page_marker` chunk'ları `[Sayfa N]` olarak SRT'e yazılır
- [ ] Output: `output/{slug}/{slug}.srt`

**Test kriteri:**
Render tamamlanır → `ilyada.srt` üretilir → timestamp'ler doğru →
sayfa geçişleri `[Sayfa N]` olarak görünür. `TEST PASSED` terminale yazılır.

---

## FAZ 5 — Ollama Entegrasyonu

> **Neden:** Yabancı kelime tespiti, rakam/kısaltma düzeltme gibi LLM görevleri
> için. Kullanıcı model seçimini UI'dan yapabilmeli.

---

### Sprint 5.1 — Ollama Proxy `⬜`

**Dosyalar:**
- `src/Api/AudiobookPipeline.Api/Endpoints/OllamaEndpoints.cs`

**Endpoint'ler:**
```
GET    /api/ollama/models
POST   /api/ollama/models/pull    { model }
DELETE /api/ollama/models/{name}
POST   /api/ollama/generate       { prompt, model, keep_alive }
GET    /api/ollama/health
```

**Yapılacaklar:**
- [ ] Ollama HTTP API'sine proxy
- [ ] `keep_alive` UI'dan ayarlanabilir (0 = hemen boşalt, -1 = kalıcı)
- [ ] Ollama çalışmıyorsa `503` döner

**Test kriteri:**
`GET /api/ollama/models` → kurulu model listesi.
`POST /api/ollama/generate` → yanıt üretilir. `TEST PASSED` terminale yazılır.

---

### Sprint 5.2 — preprocess_ollama.py `⬜`

**Neden:** Section metni Ollama'ya gönderilir, metin kalitesi iyileştirilir.

**Dosyalar:**
- `scripts/preprocess_ollama.py`

**Dönüşümler:**
- Rakam → yazı ("1453" → "bin dört yüz elli üç")
- Kısaltma açma ("vb." → "ve benzeri", "Dr." → "Doktor")
- Yabancı kelime tespiti → fonetik yazım önerisi

**Yapılacaklar:**
- [ ] Section metni chunk'lar halinde Ollama'ya gönderilir
- [ ] Dönüşüm kuralları `config/ollama_rules.json`'da tanımlanır
- [ ] Sonuç reviewed dosyasına yazılır, kullanıcı Review sayfasında onaylar
- [ ] Manifest'e `ollama_processed: true` alanı eklenir

**Test kriteri:**
"1453" içeren metin gönderilir → "bin dört yüz elli üç" olarak döner.
`TEST PASSED` terminale yazılır.

---

### Sprint 5.3 — Ollama UI `⬜`

**Dosyalar:**
- `src/ui/src/components/settings/OllamaPanel.tsx`
- `src/ui/src/hooks/useOllama.ts`

**Yapılacaklar:**
- [ ] Kurulu modeller listesi
- [ ] Model indirme (progress bar)
- [ ] Model silme
- [ ] Kitap bazında hangi model kullanılacak seçimi
- [ ] `keep_alive` ayarı

**Test kriteri:**
Ollama UI'dan model indirilir → listede görünür → kitaba atanır.
`TEST PASSED` terminale yazılır.

---

## Açık Bug'lar ve Teknik Borç

> Bu liste sprint dışı tespit edilen ve bir sonraki uygun sprint'te
> ele alınacak sorunları içerir.

| # | Sorun | Öncelik | İlgili Faz |
|---|-------|---------|------------|
| B1 | `autoSaveTimer` cleanup eksik — component unmount'ta timer temizlenmiyor | Orta | Faz 3 |
| B2 | SignalR proxy — ikinci makinede `ws://` yönlendirmesi kopuyor | Orta | Faz 0.5 |
| B3 | `pagesToContent` merge sonucunu dosyaya yazıyor — `originalText` kullanılmalı | Yüksek | Faz 3.1 |

---

## Dosya Yapısı Hedefi

```
AudiobookPipeline/
├── setup.bat
├── start.bat
├── .env
├── ROADMAP.md
├── CLAUDE.md
├── config/
│   ├── services.json
│   └── ollama_rules.json
├── voices/
│   ├── registry.json
│   ├── raw/
│   └── processed/
├── workspace/{slug}/
│   ├── manifest.json
│   ├── sections/
│   ├── reviewed/
│   ├── chunks/
│   └── audio/
├── output/{slug}/
│   ├── {slug}.wav
│   └── {slug}.srt
├── src/
│   ├── Api/AudiobookPipeline.Api/
│   ├── ui/
│   └── services/tts/
│       ├── tts_service.py
│       ├── voice_processor.py
│       └── engines/
│           ├── base.py
│           ├── chatterbox_engine.py
│           └── registry.py
└── scripts/
    ├── chunk_text.py
    ├── generate_srt.py
    ├── merge_audio.py
    └── legacy/
        └── render_chunks.py
```

---

## Sprint Tamamlanma Kriteri (Genel)

Her sprint sonunda:
1. İlgili dosya/klasör varlığı doğrulandı
2. Birim testler veya manuel test adımları geçti
3. `TEST PASSED` terminale yazıldı
4. Bu dosyada ilgili sprint `✅` olarak işaretlendi
5. Yeni eklenen script/servis `CLAUDE.md`'ye eklendi

---

*Bu doküman proje boyunca yaşayan bir referanstır.
Her sprint tamamlandığında güncellenir.*
