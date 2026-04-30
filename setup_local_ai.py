#!/usr/bin/env python3
"""
Setup script for Adventure Stories Local AI Server
Automatically installs dependencies and sets up the environment
"""

import os
import sys
import subprocess
import platform
import argparse
from pathlib import Path

def run_command(command, check=True):
    """Run a command and return the result.

    Pass a list for safe execution (no shell — preferred).
    Pass a string only when shell features like pipes are genuinely required.
    """
    display = command if isinstance(command, str) else ' '.join(str(c) for c in command)
    print(f"Running: {display}")
    # Use shell only when the caller passes a string (e.g. "lspci | grep amd").
    # List arguments never need shell=True and avoid injection risk.
    use_shell = isinstance(command, str)
    result = subprocess.run(command, shell=use_shell, capture_output=True, text=True)  # nosec B602 — shell=True only when caller passes a string with pipe/redirect; all other callers use lists

    if check and result.returncode != 0:
        print(f"Error running command: {display}")
        print(f"Error output: {result.stderr}")
        sys.exit(1)

    return result

def detect_gpu():
    """Detect available GPU"""
    try:
        # Check for NVIDIA GPU
        result = run_command(["nvidia-smi"], check=False)
        if result.returncode == 0:
            return "nvidia"
    except:
        pass
    
    try:
        # Check for AMD GPU (basic check)
        if platform.system() == "Linux":
            result = run_command("lspci | grep -i amd", check=False)  # pipe requires shell
            if result.returncode == 0 and "VGA" in result.stdout:
                return "amd"
    except:
        pass
    
    return "cpu"

def install_pytorch(gpu_type):
    """Install PyTorch with appropriate GPU support"""
    print(f"Installing PyTorch for {gpu_type}...")
    
    if gpu_type == "nvidia":
        command = ["pip", "install", "torch", "torchvision", "torchaudio",
                   "--index-url", "https://download.pytorch.org/whl/cu118"]
    elif gpu_type == "amd":
        command = ["pip", "install", "torch", "torchvision", "torchaudio",
                   "--index-url", "https://download.pytorch.org/whl/rocm5.6"]
    else:
        command = ["pip", "install", "torch", "torchvision", "torchaudio",
                   "--index-url", "https://download.pytorch.org/whl/cpu"]

    run_command(command)

def create_virtual_environment():
    """Create a virtual environment for the AI server"""
    venv_path = Path("venv_local_ai")
    
    if venv_path.exists():
        print("Virtual environment already exists")
        return venv_path
    
    print("Creating virtual environment...")
    run_command([sys.executable, "-m", "venv", str(venv_path)])
    
    return venv_path

def get_pip_command(venv_path):
    """Get the pip command for the virtual environment"""
    if platform.system() == "Windows":
        return str(venv_path / "Scripts" / "pip")
    else:
        return str(venv_path / "bin" / "pip")

def get_python_command(venv_path):
    """Get the python command for the virtual environment"""
    if platform.system() == "Windows":
        return str(venv_path / "Scripts" / "python")
    else:
        return str(venv_path / "bin" / "python")

def install_dependencies(venv_path, gpu_type):
    """Install all dependencies in virtual environment"""
    pip_cmd = get_pip_command(venv_path)
    
    # Upgrade pip using the proper method for virtual environments
    python_cmd = get_python_command(venv_path)
    print("Upgrading pip...")
    result = run_command([python_cmd, "-m", "pip", "install", "--upgrade", "pip"], check=False)
    if result.returncode != 0:
        print("Note: Pip upgrade had warnings, but continuing with installation...")
        print("This is usually not a problem.")
    
    # Install PyTorch first
    if gpu_type == "nvidia":
        run_command([pip_cmd, "install", "torch", "torchvision", "torchaudio",
                     "--index-url", "https://download.pytorch.org/whl/cu118"])
    elif gpu_type == "amd":
        run_command([pip_cmd, "install", "torch", "torchvision", "torchaudio",
                     "--index-url", "https://download.pytorch.org/whl/rocm5.6"])
    else:
        run_command([pip_cmd, "install", "torch", "torchvision", "torchaudio",
                     "--index-url", "https://download.pytorch.org/whl/cpu"])

    # Install other requirements
    run_command([pip_cmd, "install", "-r", "requirements_local_ai.txt"])

def create_startup_scripts(venv_path):
    """Create startup scripts for easy server launch"""
    python_cmd = get_python_command(venv_path)
    
    # Windows batch file
    with open("start_local_ai_server.bat", "w") as f:
        f.write(f"""@echo off
echo Starting Adventure Stories Local AI Server...
echo.
echo This will download the MiniCPM-2B-128k model (~4GB) on first run
echo Server will be available at: http://localhost:8001
echo Using virtual environment: {venv_path}
echo.
{python_cmd} local_ai_server.py --auto-download --host 0.0.0.0 --port 8001
pause
""")
    
    # Unix shell script
    with open("start_local_ai_server.sh", "w") as f:
        f.write(f"""#!/bin/bash
echo "Starting Adventure Stories Local AI Server..."
echo ""
echo "This will download the MiniCPM-2B-128k model (~4GB) on first run"
echo "Server will be available at: http://localhost:8001"
echo "Using virtual environment: {venv_path}"
echo ""
{python_cmd} local_ai_server.py --auto-download --host 0.0.0.0 --port 8001
""")
    
    # Make shell script executable
    if platform.system() != "Windows":
        run_command(["chmod", "+x", "start_local_ai_server.sh"])
    
    print(f"Created startup scripts using virtual environment: {venv_path}")

def create_config_file():
    """Create configuration file for the game"""
    config = {
        "local_ai_server": {
            "enabled": True,
            "url": "http://localhost:8001",
            "model": "openbmb/MiniCPM-2B-128k",
            "max_tokens": 1024,
            "temperature": 0.7,
            "context_length": 128000
        }
    }
    
    import json
    with open("local_ai_config.json", "w") as f:
        json.dump(config, f, indent=2)

def setup_llama_cpp_backend():
    """
    Tier 2 backend setup: prepare directories and print manual download steps.
    We do NOT automate the llama.cpp binary or GGUF download — the right
    artifact depends on user's GPU/OS/CUDA version, and release URLs rotate.
    """
    print("Preparing directories for llama-cpp backend...")
    Path("llama-cpp").mkdir(exist_ok=True)
    Path("models").mkdir(exist_ok=True)
    print()
    print("=" * 60)
    print("Manual steps required:")
    print("=" * 60)
    print()
    print("1) Download a llama.cpp release for your platform:")
    print("   https://github.com/ggml-org/llama.cpp/releases")
    print("   - NVIDIA GPU: pick a llama-bXXXX-bin-win-cuda-... archive")
    print("   - CPU only:   pick a llama-bXXXX-bin-win-cpu-... archive")
    print("   Extract the archive contents into ./llama-cpp/ so that")
    print("   ./llama-cpp/llama-server.exe (or 'llama-server' on Linux/Mac) exists.")
    print()
    print("2) Download Qwen3-8B GGUF (recommended Q5_K_M, ~5.7GB):")
    print("   https://huggingface.co/Qwen")
    print("   Save as ./models/Qwen3-8B-Q5_K_M.gguf")
    print("   (Or update LLAMA_CPP_CONFIG.MODEL_FILE in config.js to your filename.)")
    print()
    print("3) Set LLM_BACKEND = 'llama-cpp' in config.js.")
    print()
    print("4) Launch with:  python start_game.py")
    print("   (This will spawn start_llama_server.py automatically.)")
    print()


def main():
    parser = argparse.ArgumentParser(description="Setup Adventure Stories Local AI Server")
    parser.add_argument("--gpu", choices=["nvidia", "amd", "cpu", "auto"], default="auto",
                       help="GPU type to install for (auto-detect by default; minicpm-python backend only)")
    parser.add_argument("--backend", choices=["minicpm-python", "llama-cpp"], default="minicpm-python",
                       help="Which AI backend to set up. Default: minicpm-python (legacy). "
                            "Use llama-cpp for the Tier 2 stack (Qwen3-8B + grammar-constrained JSON).")
    args = parser.parse_args()

    print("=" * 60)
    print(f"Adventure Stories Local AI Server Setup ({args.backend})")
    print("=" * 60)
    print()

    if args.backend == "llama-cpp":
        setup_llama_cpp_backend()
        return

    # ---- minicpm-python backend (legacy) ------------------------------------
    if args.gpu == "auto":
        gpu_type = detect_gpu()
        print(f"Detected GPU type: {gpu_type}")
    else:
        gpu_type = args.gpu

    # Always create virtual environment for clean installation
    venv_path = create_virtual_environment()

    # Install dependencies in virtual environment
    install_dependencies(venv_path, gpu_type)
    create_startup_scripts(venv_path)

    # Create config file
    create_config_file()
    
    print()
    print("=" * 60)
    print("Setup Complete!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Start the whole stack with: python start_game.py")
    print("   (This launches the AI backend and the static web server.)")
    print()
    print("2. Or start the MiniCPM AI server manually:")
    print(f"   - {get_python_command(venv_path)} working_ai_server.py")
    print("   - It will load ./models/minicpm-2b-128k/ and listen on http://localhost:8001")
    print()
    print("3. To switch to the Tier 2 llama.cpp + Qwen3 backend instead:")
    print("   - Re-run with --backend llama-cpp and follow the printed steps.")
    print("   - Set LLM_BACKEND = 'llama-cpp' in config.js when ready.")
    print()
    print("4. Virtual Environment:")
    print(f"   - Installed in: {venv_path}")
    print("   - Clean, isolated installation")
    print("   - No global Python package conflicts")
    print()
    print(f"GPU Support: {gpu_type}")
    if gpu_type == "cpu":
        print("Note: CPU inference will be slower. Consider getting a GPU for better performance.")
    
    print()
    print("Model Info:")
    print("- Model: MiniCPM-2B-128k (OpenBMB)")
    print("- Context Length: 128,000 tokens")
    print("- Size: ~4GB download")
    print("- Architecture: Optimized for efficiency")
    print("- Features: trust_remote_code=True, 128k context")
    print("- No API quotas or rate limits!")

if __name__ == "__main__":
    main()
