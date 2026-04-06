import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

logger = logging.getLogger("finchwire.downloader")

def run_download_job(job: Dict[str, Any], media_dir: Path) -> Dict[str, Any]:
    """
    Executes a single download job using yt-dlp.
    Updates the job dict with status and file info.
    """
    url = job.get("url")
    is_audio = job.get("is_audio", False)
    safe_name = job.get("safe_filename") or f"media_{uuid.uuid4().hex[:8]}"
    
    # Ensure media dir exists
    media_dir.mkdir(exist_ok=True, parents=True)
    
    # Prepare output template
    ext = "mp3" if is_audio else "mp4"
    output_tpl = str(media_dir / f"{safe_name}.%(ext)s")
    
    # Build yt-dlp command
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--newline",
        "--progress",
    ]
    
    if is_audio:
        cmd += ["-x", "--audio-format", "mp3"]
    else:
        # Standard 720p or lower for mobile efficiency
        cmd += ["-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best"]
        cmd += ["--merge-output-format", "mp4"]
        
    cmd += ["-o", output_tpl, url]
    
    logger.info(f"Starting download for {url} (is_audio={is_audio})")
    job["status"] = "downloading"
    job["progress"] = 0
    
    try:
        # We use subprocess.Popen to potentially track progress lines in the future, 
        # but for now we'll just run it to completion.
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        for line in process.stdout:
            # Try to parse progress if possible (yt-dlp --newline output)
            if "[download]" in line and "%" in line:
                try:
                    parts = line.split()
                    for p in parts:
                        if "%" in p:
                            val = float(p.replace("%", ""))
                            job["progress"] = val
                            break
                except:
                    pass
        
        process.wait()
        
        if process.returncode == 0:
            # Find the actual file (yt-dlp might have changed the ext)
            actual_files = list(media_dir.glob(f"{safe_name}.*"))
            if actual_files:
                file_path = actual_files[0]
                job["status"] = "completed"
                job["progress"] = 100
                job["relative_path"] = file_path.name
                job["filesize"] = file_path.stat().st_size
                logger.info(f"Download completed: {file_path.name}")
            else:
                job["status"] = "failed"
                job["error"] = "File not found after download"
        else:
            job["status"] = "failed"
            job["error"] = f"yt-dlp exited with code {process.returncode}"
            
    except Exception as e:
        logger.exception("Media download failed")
        job["status"] = "failed"
        job["error"] = str(e)
        
    return job

async def media_worker_loop(store_ref: Any, media_dir: Path):
    """
    Background loop that checks for 'queued' jobs and processes them.
    If 'yt_download_url' is set in settings, it attempts to delegate to the external service.
    """
    logger.info("Media Downloader worker started.")
    while True:
        try:
            settings = store_ref.get_collection("settings")
            yt_url = str(settings.get("yt_download_url") or "").strip()
            
            # Check for queued jobs
            downloads = store_ref.get_collection("downloads")
            if not isinstance(downloads, list):
                await asyncio.sleep(10)
                continue
                
            queued_job = next((j for j in downloads if j.get("status") == "queued"), None)
            
            if queued_job:
                if yt_url:
                    # Delegate to external YT-Download (Media Drop)
                    await _delegate_to_external_service(queued_job, yt_url)
                else:
                    # Process local with yt-dlp
                    await asyncio.to_thread(run_download_job, queued_job, media_dir)
                store_ref.save()
            
        except Exception as e:
            logger.error(f"Downloader loop error: {e}")
            
        await asyncio.sleep(5)

async def _delegate_to_external_service(job: Dict[str, Any], service_url: Dict[str, Any]):
    """
    Sends a request to the external YT-Download server.
    """
    import requests
    url = job.get("url")
    is_audio = job.get("is_audio", False)
    
    # Standard Media Drop / YT-Download endpoint is usually /api/downloads or similar
    # We'll assume the provided URL is the base and it has a POST /api/download (based on repo analysis)
    target_endpoint = f"{service_url.rstrip('/')}/api/download"
    
    try:
        payload = {"url": url, "isAudio": is_audio}
        job["status"] = "downloading"
        job["progress"] = 10 # Started
        
        # This is a fire-and-forget or status-check depending on how YT-Download responds
        response = requests.post(target_endpoint, json=payload, timeout=10)
        if response.status_code < 300:
            job["status"] = "completed" # Or track if YT-Download provides a job ID
            job["progress"] = 100
            logger.info(f"Delegated download for {url} to external service.")
        else:
            job["status"] = "failed"
            job["error"] = f"External service error: {response.status_code}"
    except Exception as e:
        job["status"] = "failed"
        job["error"] = f"Failed to connect to external service: {str(e)}"
