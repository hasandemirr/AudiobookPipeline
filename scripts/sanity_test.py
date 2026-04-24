import sys, torch, torchaudio as ta
from pathlib import Path

import os
from pathlib import Path

def find_repo_root() -> Path:
    p = Path(__file__).resolve()
    while p != p.parent:
        if (p / ".gitignore").exists():
            return p
        p = p.parent
    raise RuntimeError("Repo kökü bulunamadı.")

repo_root = find_repo_root()

# .env dosyası varsa yükle
env_path = repo_root / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

chatterbox_src = os.environ.get(
    "CHATTERBOX_SRC", r"C:\AI\chatterbox\src")
sys.path.insert(0, chatterbox_src)

from chatterbox.mtl_tts import ChatterboxMultilingualTTS

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device: {DEVICE}")

REFERENCE_VOICE = Path(r"assets\reference_voices\speaker.wav")
OUTPUT_PATH = Path(r"workspace\sanity\audio\test_output.wav")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)
print(f"Model yüklendi. SR: {model.sr}")

TEXT = "Sistem testi başarılı. Türkçe ses üretimi gerçekleştiriliyor."
assert len(TEXT) <= 300, f"Metin 300 karakter sınırını aşıyor: {len(TEXT)}"

kwargs = {"language_id": "tr", "exaggeration": 0.5, "cfg_weight": 0.5, "temperature": 0.8}
if REFERENCE_VOICE.exists():
    kwargs["audio_prompt_path"] = str(REFERENCE_VOICE)
    print(f"Reference voice kullanılıyor: {REFERENCE_VOICE}")
else:
    print("WARN: Reference voice bulunamadı, varsayılan ses kullanılıyor.")

wav = model.generate(TEXT, **kwargs)
ta.save(str(OUTPUT_PATH), wav, model.sr)

size_kb = OUTPUT_PATH.stat().st_size / 1024
print(f"Çıktı: {OUTPUT_PATH} ({size_kb:.1f} KB)")
assert size_kb > 10, "Çıktı dosyası çok küçük, üretim başarısız olmuş olabilir."
print("TEST PASSED")
