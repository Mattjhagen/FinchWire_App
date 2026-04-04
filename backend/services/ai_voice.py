from __future__ import annotations
import base64
import os
import requests
from typing import Optional

class TtsError(Exception):
    pass

def run_tts(text: str, provider: str, api_key: str, voice_id: Optional[str] = None) -> str:
    """
    Converts text to speech and returns base64 encoded audio.
    """
    text = str(text or "").strip()
    if not text:
        raise TtsError("Text is required for TTS")
    
    provider = str(provider or "none").strip().lower()
    if provider == "none" or not api_key:
        raise TtsError("TTS provider or API key is not configured")

    if provider == "openai":
        return _run_openai_tts(text, api_key, voice_id or "alloy")
    elif provider == "elevenlabs":
        return _run_elevenlabs_tts(text, api_key, voice_id or "pNInz6obpgnuM07pZ6W8") # Adam fallback
    elif provider == "google" or provider == "gemini":
        return _run_google_tts(text, api_key)
    
    raise TtsError(f"Unsupported TTS provider: {provider}")

def _run_openai_tts(text: str, api_key: str, voice: str) -> str:
    url = "https://api.openai.com/v1/audio/speech"
    payload = {
        "model": "tts-1",
        "input": text,
        "voice": voice,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return base64.b64encode(response.content).decode("utf-8")
    except Exception as e:
        raise TtsError(f"OpenAI TTS failed: {e}")

def _run_elevenlabs_tts(text: str, api_key: str, voice_id: str) -> str:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
    }
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return base64.b64encode(response.content).decode("utf-8")
    except Exception as e:
        raise TtsError(f"ElevenLabs TTS failed: {e}")

def _run_google_tts(text: str, api_key: str) -> str:
    # Use standard Google Cloud Text-to-Speech API
    url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}"
    payload = {
        "input": {"text": text},
        "voice": {"languageCode": "en-US", "name": "en-US-Standard-C"},
        "audioConfig": {"audioEncoding": "MP3"},
    }
    try:
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data.get("audioContent", "") # Google already returns base64
    except Exception as e:
        raise TtsError(f"Google TTS failed: {e}")
