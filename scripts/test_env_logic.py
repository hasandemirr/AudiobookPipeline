import os
import sys
from pathlib import Path

def find_repo_root() -> Path:
    p = Path(__file__).resolve()
    while p != p.parent:
        if (p / ".gitignore").exists():
            return p
        p = p.parent
    raise RuntimeError("Repo kökü bulunamadı.")

repo_root = find_repo_root()
print(f"Repo root found: {repo_root}")

# .env dosyası varsa yükle
env_path = repo_root / ".env"
if env_path.exists():
    print(f".env file found at: {env_path}")
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

chatterbox_src = os.environ.get(
    "CHATTERBOX_SRC", r"C:\AI\chatterbox\src")
print(f"CHATTERBOX_SRC value: {chatterbox_src}")

if chatterbox_src == r"C:\AI\chatterbox\src":
    print("LOGIC TEST PASSED")
else:
    print("LOGIC TEST FAILED")
