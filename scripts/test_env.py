import sys
import torch

print("CUDA available:", torch.cuda.is_available())
print("Device:", "cuda" if torch.cuda.is_available() else "cpu")

try:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    print("Chatterbox import: OK")
except ImportError:
    print("Chatterbox import failed. Checking C:\\AI\\chatterbox\\src in sys.path...")
    src_path = "C:\\AI\\chatterbox\\src"
    if src_path not in sys.path:
        sys.path.append(src_path)
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            print("Chatterbox import: OK (after adding src to sys.path)")
        except ImportError:
            print(f"Chatterbox import still failed after adding {src_path} to sys.path.")
    else:
        print(f"{src_path} is already in sys.path but import failed.")
