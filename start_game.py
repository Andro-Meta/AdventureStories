#!/usr/bin/env python3
"""
Adventure Stories - Game Launcher
Boots the appropriate AI backend (per config.js LLM_BACKEND) plus the static
web server, then opens the game in a browser.
"""

import os
import re
import sys
import time
import platform
import subprocess
import requests
from pathlib import Path


def detect_backend() -> str:
    """Read LLM_BACKEND from config.js without importing JS — simple regex."""
    cfg = Path("config.js")
    if not cfg.exists():
        return "minicpm-python"
    text = cfg.read_text(encoding="utf-8")
    m = re.search(r"export\s+const\s+LLM_BACKEND\s*=\s*['\"]([^'\"]+)['\"]", text)
    return m.group(1) if m else "minicpm-python"


BACKEND = detect_backend()
AI_PORT = 8090 if BACKEND == "llama-cpp" else 8001


def print_header():
    print("=" * 50)
    print("   Adventure Stories - GAME LAUNCHER")
    print(f"   AI backend: {BACKEND}  (port {AI_PORT})")
    print("=" * 50)
    print()


def check_setup():
    """Verify the setup is complete for the selected backend."""
    print("[1/5] Verifying setup...")

    if BACKEND == "llama-cpp":
        bin_name = "llama-server.exe" if platform.system() == "Windows" else "llama-server"
        bin_path = Path("llama-cpp") / bin_name
        if not bin_path.exists():
            print(f"ERROR: {bin_path} not found.")
            print("Download a llama.cpp release and extract to ./llama-cpp/.")
            print("https://github.com/ggml-org/llama.cpp/releases")
            input("Press Enter to exit...")
            sys.exit(1)
        # Don't pin a specific GGUF — start_llama_server.py preflights the model file.
        print(f"OK Setup verified - llama-server binary found at {bin_path}")
        print()
        return

    # minicpm-python backend
    if not Path("venv_local_ai/Scripts/python.exe").exists():
        print("ERROR: Virtual environment missing!")
        print("Please run setup_local_ai.py first")
        input("Press Enter to exit...")
        sys.exit(1)

    if not Path("models/minicpm-2b-128k/config.json").exists():
        print("ERROR: MiniCPM-2B-128k model missing!")
        print("Please run setup_local_ai.py first")
        input("Press Enter to exit...")
        sys.exit(1)

    print("OK Setup verified - MiniCPM-2B-128k model found")
    print()

def _kill_pid(pid: int) -> bool:
    """Kill a single process by PID. Cross-platform best-effort."""
    try:
        if os.name == 'nt':
            subprocess.run(["taskkill", "/f", "/pid", str(pid)],
                           capture_output=True, check=False)
        else:
            subprocess.run(["kill", "-9", str(pid)], capture_output=True, check=False)
        return True
    except Exception:
        return False


def _pids_listening_on_port(port: int) -> list[int]:
    """Return PIDs holding a TCP listener on this port. Best-effort; empty
    list if the platform tooling isn't available or fails to parse."""
    pids: list[int] = []
    self_pid = os.getpid()
    try:
        if os.name == 'nt':
            # netstat -ano: last column is the PID. Filter for LISTENING on :port.
            out = subprocess.run(
                ["netstat", "-ano", "-p", "TCP"],
                capture_output=True, text=True, check=False
            ).stdout
            for line in out.splitlines():
                # Lines look like:
                #   TCP    0.0.0.0:8090   0.0.0.0:0   LISTENING   12345
                if "LISTENING" not in line:
                    continue
                parts = line.split()
                if len(parts) < 5:
                    continue
                local = parts[1]
                if not local.endswith(f":{port}"):
                    continue
                try:
                    pid = int(parts[-1])
                except ValueError:
                    continue
                if pid and pid != self_pid:
                    pids.append(pid)
        else:
            # lsof -t prints PIDs only.
            out = subprocess.run(
                ["lsof", "-t", f"-iTCP:{port}", "-sTCP:LISTEN"],
                capture_output=True, text=True, check=False
            ).stdout
            for line in out.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    pid = int(line)
                except ValueError:
                    continue
                if pid and pid != self_pid:
                    pids.append(pid)
    except Exception:
        pass
    # Dedupe while preserving order
    seen = set()
    return [p for p in pids if not (p in seen or seen.add(p))]


def kill_existing_processes():
    """Surgical cleanup: only target processes holding the specific ports we
    need (web 8000, AI 8090 / 8001). The previous version ran `taskkill /f
    /im python.exe` which killed THIS launcher mid-run because it's also a
    python.exe — that's why step 2 used to silently exit. Now we look up
    the offending PIDs by port and kill only those, never ourselves."""
    print("[2/5] Cleaning up old listeners on our ports...")
    target_ports = [8000, 8001, 8002, 8003, 8004, AI_PORT]
    killed = 0
    for port in sorted(set(target_ports)):
        pids = _pids_listening_on_port(port)
        for pid in pids:
            if _kill_pid(pid):
                print(f"  killed pid {pid} on port {port}")
                killed += 1
    if killed > 0:
        time.sleep(1.5)  # Give the OS a moment to release the sockets
        print(f"OK Cleanup complete ({killed} stale listeners stopped).")
    else:
        print("OK Cleanup complete (no stale listeners).")
    print()

def is_port_free(port: int) -> bool:
    """Probe whether a port is bindable on 0.0.0.0. Phase 4.0b helper used to
    pre-flight 8090 (and 8000 family) before spawning subprocesses, so the
    user gets an actionable error rather than a silent subprocess failure."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", port))
            return True
        finally:
            s.close()
    except OSError:
        return False


def start_ai_server():
    """Start the configured AI backend in a separate console."""
    print("[3/5] Starting AI Server...")

    if BACKEND == "llama-cpp":
        print(f"Using llama.cpp llama-server (Gemma-3n-E4B by default, port {AI_PORT})")
        # Phase 4.0b: pre-flight the AI port. If it's taken, the user gets a
        # clear actionable message before we spawn the subprocess.
        if not is_port_free(AI_PORT):
            print(f"WARN port {AI_PORT} is already in use.")
            print(f"     • Probable cause: another llama-server is already running.")
            print(f"     • To find it:")
            if os.name == "nt":
                print(f"         netstat -ano | findstr :{AI_PORT}")
                print(f"         (then `taskkill /PID <pid> /F` to stop it)")
            else:
                print(f"         lsof -iTCP:{AI_PORT} -sTCP:LISTEN")
                print(f"         (then `kill <pid>` to stop it)")
            print(f"     • OR set ADV_LLAMA_PORT to a free port (e.g. ADV_LLAMA_PORT=8095)")
            print(f"     start_llama_server.py will auto-bump on collision and print the new port.")
        try:
            if os.name == "nt":
                subprocess.Popen(
                    [sys.executable, "start_llama_server.py"],
                    creationflags=subprocess.CREATE_NEW_CONSOLE,
                )
            else:
                subprocess.Popen([sys.executable, "start_llama_server.py"])
            print("OK llama-server starting")
        except Exception as e:
            print(f"FAIL Failed to start llama-server: {e}")
            sys.exit(1)
        print()
        return

    print("Using MiniCPM-2B-128k with 128k context window")
    try:
        if os.name == "nt":
            subprocess.Popen(
                ["venv_local_ai/Scripts/python.exe", "working_ai_server.py"],
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
        else:
            subprocess.Popen(["venv_local_ai/bin/python", "working_ai_server.py"])
        print("OK AI Server started")
    except Exception as e:
        print(f"FAIL Failed to start AI server: {e}")
        sys.exit(1)
    print()

def wait_for_server():
    """Wait for the AI server to be ready"""
    print("[4/5] Loading AI model (this takes 30-60 seconds)...")
    print("Please wait while the AI model loads into memory...")

    health_url = (
        f"http://127.0.0.1:{AI_PORT}/health"
        if BACKEND == "minicpm-python"
        else f"http://127.0.0.1:{AI_PORT}/v1/models"  # llama-server uses /v1/models for readiness
    )

    for i in range(1, 31):
        print(f"Loading... {i}/30")
        time.sleep(2)
        try:
            response = requests.get(health_url, timeout=1)
            if response.status_code == 200:
                print("OK AI Server is ready!")
                return True
        except Exception:
            continue

    print("WARN  Server taking longer than expected, continuing anyway...")
    return False

def start_game():
    """Start the web server and game"""
    print()
    print("[5/5] Starting Adventure Stories game...")
    print()
    print("=" * 50)
    print(f"  AI SERVER: Running on port {AI_PORT} ({BACKEND})")
    print("  WEB SERVER: Starting on port 8000")
    print("  GAME URL: http://localhost:8000")
    print("=" * 50)
    print()
    print("🎮 Your Adventure Stories game is starting!")
    print("🤖 The AI server is ready for unlimited story generation!")
    print()
    
    # Start web server
    try:
        subprocess.run([sys.executable, "server.py"])
    except KeyboardInterrupt:
        print("\n🛑 Game stopped by user")
    except Exception as e:
        print(f"❌ Error starting web server: {e}")
    
    print("\n🎯 Game session ended.")
    input("Press Enter to exit...")

def main():
    """Main launcher function"""
    print_header()
    check_setup()
    kill_existing_processes()
    start_ai_server()
    wait_for_server()
    start_game()

if __name__ == "__main__":
    main()
