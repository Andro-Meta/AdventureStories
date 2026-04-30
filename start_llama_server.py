#!/usr/bin/env python3
"""
llama.cpp llama-server launcher for Adventure Stories.

Tier 2 of the overhaul. Replaces the legacy MiniCPM/Transformers backend
(working_ai_server.py) with the much faster llama-server binary, which exposes
an OpenAI-compatible /v1/chat/completions endpoint plus native support for
GBNF grammars and json_schema-constrained generation.

Setup (one-time, manual):
  1. Download a llama.cpp release for your platform from
     https://github.com/ggml-org/llama.cpp/releases (pick a CUDA build for
     NVIDIA GPUs) and extract it to ./llama-cpp/ next to this script.
  2. Download a Qwen3-8B GGUF (recommended Q5_K_M, ~5.7GB) from
     https://huggingface.co/Qwen and place it in ./models/.
     Update LLAMA_CPP_CONFIG.MODEL_FILE in config.js if you use a different name.
  3. Set LLM_BACKEND = 'llama-cpp' in config.js.
  4. Run this script (or let start_game.py launch it via the dispatcher).

Default port is 8080 (llama-server's default). The frontend reads the URL
from config.LLAMA_CPP_CONFIG.DEFAULT_URL via getActiveBackendConfig().
"""

import os
import platform
import subprocess
import sys
from pathlib import Path

# ---- Defaults (mirror LLAMA_CPP_CONFIG in config.js) -------------------------
# Override via env var: ADV_LLAMA_PORT=8091 python start_llama_server.py
PORT = int(os.environ.get("ADV_LLAMA_PORT", "8090"))  # 8080 commonly taken by Docker Desktop / other services
# Phase 4.0b: bind to 0.0.0.0 so a phone on the same Wi-Fi can reach the
# llama-server during mobile testing. Set to 127.0.0.1 if you only want local
# access (more secure on shared networks).
# Override via env var: ADV_LLAMA_HOST=127.0.0.1 python start_llama_server.py
HOST = os.environ.get("ADV_LLAMA_HOST", "0.0.0.0")
# Locked-in narrator after 2026-04-29 head-to-head: Gemma-3n-E4B Q4_K_M.
# 100% JSON-schema reliability, ~5x faster than Qwen3-4B on arc-memory
# calls, 5:1 sliding-window attention keeps the KV cache small enough for
# 12+ GB phones at 32k context. ~4.5 GB on disk. Update LLAMA_CPP_CONFIG
# in config.js to match if you swap models.
MODEL_FILE = Path("./models/gemma-3n-E4B-it-Q4_K_M.gguf")
CONTEXT_SIZE = 32768
GPU_LAYERS = 999  # Offload all layers to GPU; set 0 for CPU-only

# --- Phase 2.5 Tier B / Phase 4 prep: speculative decoding ---
# llama.cpp's `--model-draft` flag enables tree-based speculative decoding:
# a smaller "draft" model proposes N tokens per step, the larger model
# verifies in parallel. Typical speedup: 1.5-3x on a single GPU when the
# draft model is small enough to add no measurable latency on its own.
#
# Vocabulary requirement: the draft and main models MUST share the same
# tokenizer vocabulary. Gemma-3n-E4B (our narrator) pairs with Gemma-3n-E2B
# as a draft (both share the Gemma-3n vocab). Qwen3-4B pairs with Qwen3-0.6B.
# Mismatched vocabularies cause llama.cpp to reject the load.
#
# Recommended setup for our locked-in Gemma-3n-E4B narrator:
#   1. Download Gemma-3n-E2B-it-Q4_K_M.gguf (~2 GB) from
#      https://huggingface.co/unsloth/gemma-3n-E2B-it-GGUF
#   2. Place it in ./models/
#   3. Uncomment the line below.
#   4. Restart start_llama_server.py.
#
# Mobile note: speculative decoding STAYS valuable on phone. The 2 GB draft
# fits comfortably alongside the 4.5 GB main model on a 12+ GB device, and
# the speedup matters even more there since mobile inference is bandwidth-
# bound. Keep this enabled for the React Native port.
DRAFT_MODEL_FILE = None  # e.g. Path("./models/gemma-3n-E2B-it-Q4_K_M.gguf")
DRAFT_GPU_LAYERS = 999
DRAFT_MAX_TOKENS = 16  # Max tokens the draft proposes per step (4-16 typical)

if platform.system() == "Windows":
    SERVER_BIN = Path("./llama-cpp/llama-server.exe")
else:
    SERVER_BIN = Path("./llama-cpp/llama-server")

# ----------------------------------------------------------------------------


def is_port_free(host: str, port: int) -> bool:
    """Probe whether (host, port) is bindable. Try the configured host first;
    fall back to 0.0.0.0 since SO_REUSEADDR semantics differ across OSes."""
    import socket
    for candidate in (host, "0.0.0.0", "127.0.0.1"):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind((candidate, port))
                s.close()
                return True
            except OSError:
                s.close()
                return False
        except OSError:
            continue
    return True  # Couldn't probe; assume free and let llama-server complain


def find_free_port_from(start: int, host: str, max_tries: int = 10) -> int:
    """Walk forward from start_port looking for one we can bind."""
    for offset in range(max_tries):
        candidate = start + offset
        if is_port_free(host, candidate):
            return candidate
    return -1


def preflight() -> None:
    """Verify the binary and model are present, AND that our port is free,
    before spawning. Bail with actionable error messages on each failure."""
    global PORT  # may auto-bump if a sibling instance is already on 8090
    if not SERVER_BIN.exists():
        sys.exit(
            f"ERROR: llama-server binary not found at {SERVER_BIN.resolve()}.\n"
            f"Download a llama.cpp release and extract it to ./llama-cpp/.\n"
            f"https://github.com/ggml-org/llama.cpp/releases"
        )
    if not MODEL_FILE.exists():
        sys.exit(
            f"ERROR: GGUF model not found at {MODEL_FILE.resolve()}.\n"
            f"Download Gemma-3n-E4B-it-Q4_K_M.gguf and place it in ./models/.\n"
            f"https://huggingface.co/unsloth/gemma-3n-E4B-it-GGUF"
        )
    # Phase 4.0b: port preflight. If 8090 is taken (another llama-server,
    # rogue process, etc.), auto-bump to the next free port and tell the
    # user how to point the front-end at it via the new ?backend= switch.
    if not is_port_free(HOST, PORT):
        bumped = find_free_port_from(PORT + 1, HOST)
        if bumped < 0:
            sys.exit(
                f"ERROR: port {PORT} (and the next 10 ports) are all in use.\n"
                f"  • Likely cause: another llama-server is already running.\n"
                f"  • Find it: `netstat -ano | findstr :{PORT}` (Windows) or "
                f"`lsof -iTCP:{PORT} -sTCP:LISTEN` (mac/Linux).\n"
                f"  • Kill it, OR set ADV_LLAMA_PORT to a free port (e.g. ADV_LLAMA_PORT=8095)."
            )
        print(f"NOTE: port {PORT} is in use; auto-switching to {bumped}.")
        print(f"      Open the game with ?backend=http://<host>:{bumped} so the front-end matches.")
        PORT = bumped


def build_command() -> list[str]:
    cmd = [
        str(SERVER_BIN),
        "-m", str(MODEL_FILE),
        "--host", HOST,
        "--port", str(PORT),
        "-c", str(CONTEXT_SIZE),
        "-ngl", str(GPU_LAYERS),
        "--jinja",  # Use the model's built-in chat template
    ]

    # Optional speculative-decoding pair (Tier 3 opt-in).
    if DRAFT_MODEL_FILE is not None:
        if not Path(DRAFT_MODEL_FILE).exists():
            sys.exit(
                f"ERROR: DRAFT_MODEL_FILE={DRAFT_MODEL_FILE} not found. "
                "Set DRAFT_MODEL_FILE to None to disable speculative decoding, "
                "or download a draft GGUF that shares the main model's vocabulary."
            )
        cmd += [
            "--model-draft", str(DRAFT_MODEL_FILE),
            "--gpu-layers-draft", str(DRAFT_GPU_LAYERS),
            "--draft-max", str(DRAFT_MAX_TOKENS),
        ]
        print(f"Speculative decoding ON: draft model = {DRAFT_MODEL_FILE}")

    return cmd


def main() -> None:
    print("=" * 60)
    print("  llama-server (Adventure Stories Tier 2 backend)")
    print("=" * 60)
    preflight()
    cmd = build_command()
    print("Launching:", " ".join(cmd))
    print(f"OpenAI-compatible endpoint: http://{HOST}:{PORT}/v1/chat/completions")
    print("Press Ctrl+C to stop.")
    try:
        subprocess.run(cmd, check=False)
    except KeyboardInterrupt:
        print("\nllama-server stopped.")


if __name__ == "__main__":
    main()
