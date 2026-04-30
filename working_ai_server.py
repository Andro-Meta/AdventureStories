#!/usr/bin/env python3
"""
Working AI Server - EXACT implementation from MiniCPM-2B-128k documentation
Uses the MiniCPM-2B-128k model with 128k context window for rich storytelling
"""

import sys
import json
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# EXACT configuration from MiniCPM-2B-128k documentation
MODEL_NAME = "openbmb/MiniCPM-2B-128k"
MODEL_CACHE_DIR = "./models/minicpm-2b-128k"

class ChatMessage(BaseModel):
    role: str
    content: str

class GenerationRequest(BaseModel):
    messages: list
    max_tokens: int = 2048
    temperature: float = 0.8
    top_p: float = 0.8

# App will be created after lifespan is defined

# Global model variables
model = None
tokenizer = None
model_loaded = False

def load_model():
    global model, tokenizer, model_loaded

    print("Loading model using EXACT official documentation method...")

    path = Path(MODEL_CACHE_DIR)
    if not (path / "config.json").exists():
        msg = (
            f"Model files not found at {path.resolve()}.\n"
            f"Expected to find {path / 'config.json'}.\n"
            f"Run `setup_local_ai.py` (or download {MODEL_NAME} via huggingface-cli) "
            f"into ./models/minicpm-2b-128k/ before starting the server."
        )
        print(msg, file=sys.stderr)
        model_loaded = False
        raise FileNotFoundError(msg)

    try:
        # EXACT code from official MiniCPM-2B-128k documentation
        # nosec B615 — loading from a local filesystem path, not the HuggingFace Hub;
        # revision pinning is not applicable here.
        tokenizer = AutoTokenizer.from_pretrained(str(path))  # nosec B615 — local path, not Hub
        model = AutoModelForCausalLM.from_pretrained(  # nosec B615
            str(path),
            dtype=torch.bfloat16,
            device_map='cuda' if torch.cuda.is_available() else 'cpu',
            trust_remote_code=True
        )

        model_loaded = True
        print("Model loaded successfully using official method!")

    except Exception as e:
        print(f"Failed to load model: {e}")
        model_loaded = False
        raise

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Working AI Server...")
    load_model()
    yield
    print("Shutting down Working AI Server...")

app = FastAPI(title="Working AI Server", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Working AI Server",
        "model": MODEL_NAME,
        "status": "ready" if model_loaded else "loading"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy" if model_loaded else "loading",
        "model_loaded": model_loaded
    }

@app.post("/v1/chat/completions")
async def chat_completions(request: GenerationRequest):
    if not model_loaded:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    
    try:
        # Get the last user message
        user_message = ""
        for msg in request.messages:
            if msg.get("role") == "user":
                user_message = msg.get("content", "")
        
        # Use chatml format as specified in MiniCPM-2B-128k documentation
        # The model uses: <|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n
        prompt = f"<|im_start|>user\n{user_message}<|im_end|>\n<|im_start|>assistant\n"
        
        # Tokenize and generate using the exact method from documentation
        inputs = tokenizer(prompt, return_tensors="pt")
        if torch.cuda.is_available():
            inputs = {k: v.to('cuda') for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
                use_cache=False  # Disable cache to avoid DynamicCache issues
            )
        
        # Decode response
        input_length = inputs["input_ids"].shape[1]
        generated_tokens = outputs[0][input_length:]
        responds = tokenizer.decode(generated_tokens, skip_special_tokens=True)
        
        return {
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": responds
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0
            },
            "model": MODEL_NAME
        }
        
    except Exception as e:
        print(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("Working AI Server starting...")
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
