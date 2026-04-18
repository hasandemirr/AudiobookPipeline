import sys, torch, torchaudio as ta
from pathlib import Path

sys.path.insert(0, r"C:\AI\chatterbox\src")
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
