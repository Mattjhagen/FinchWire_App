import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

logger = logging.getLogger("finchwire.downloader")

# Default download directory, can be overridden by environment
# For the user's setup, this could be a mounted drive on 192.168.1.32
DEFAULT_DOWNLOAD_DIR = Path(os.environ.get("FINCHWIRE_DOWNLOAD_DIR", "/Users/matt/FinchWire_App/backend/media"))

def run_download_job(job: Dict[str, Any], media_dir: Optional[Path] = None) -> Dict[str, Any]:
    """
    Executes a single download job using yt-dlp.
    Tailored for local server storage (e.g. at 192.168.1.32).
    Updates the job dict with status and file info.
    """
    if media_dir is None:
        media_dir = DEFAULT_DOWNLOAD_DIR

    url = job.get("url")
    is_audio = job.get("is_audio", False)
    # VidBee-inspired naming
    safe_name = job.get("safe_filename") or f"vidbee_{uuid.uuid4().hex[:8]}"
    
    # Ensure media dir exists
    media_dir.mkdir(exist_ok=True, parents=True)
    
    # Check if VidBee style playlist is requested
    is_playlist = "list=" in url or job.get("is_playlist", False)
    
    logger.info(f"Starting VidBee-style download for {url} (is_audio={is_audio}, is_playlist={is_playlist})")
    job["status"] = "downloading"
    job["progress"] = 0
    
    # Enhanced command construction for VidBee-style bypass
    # Start with base arguments
    cmd = [
        "yt-dlp",
        "--newline",
        "--add-metadata",
        "--write-info-json",
        "--no-mtime",
        "--encoding", "utf-8",
    ]

    # Handle Extractor Args - prefer job-specific, fallback to impersonate for Cloudflare
    job_extractor_args = job.get("extractor_args")
    if job_extractor_args:
        cmd += ["--extractor-args", job_extractor_args]
    else:
        cmd += ["--extractor-args", "generic:impersonate"]

    # Output template
    cmd += ["-o", str(media_dir / f"{safe_name}.%(ext)s")]
    
    # Custom binary paths if available (VidBee context)
    vidbee_bin_dir = Path("/Applications/VidBee.app/Contents/Resources/resources")
    if vidbee_bin_dir.exists():
        ffmpeg_bin = vidbee_bin_dir / "ffmpeg"
        if ffmpeg_bin.exists():
             cmd += ["--ffmpeg-location", str(ffmpeg_bin)]
        
        deno_bin = vidbee_bin_dir / "deno"
        if deno_bin.exists():
             cmd += ["--js-runtimes", f"deno:{deno_bin}"]

    # Cookie support - prioritized from job, fallback to default profile
    job_cookies_browser = job.get("cookies_from_browser")
    if job_cookies_browser:
        cmd += ["--cookies-from-browser", job_cookies_browser]
    else:
        chrome_profile = "/Users/matt/Library/Application Support/Google/Chrome/Default"
        if os.path.exists(chrome_profile):
            cmd += ["--cookies-from-browser", f"chrome:{chrome_profile}"]
    
    job_cookies_file = job.get("cookies")
    if job_cookies_file:
        cmd += ["--cookies", job_cookies_file]
    else:
        default_cookies = "/Users/matt/Downloads/cookies.txt"
        if os.path.exists(default_cookies):
            cmd += ["--cookies", default_cookies]

    if is_audio:
        cmd += ["-x", "--audio-format", "mp3"]
    else:
        # User preferred format string
        cmd += ["-f", "bestvideo+bestaudio[abr<=320]/bestvideo+bestaudio/best"]
        cmd += ["--sub-langs", "all", "--embed-subs", "--embed-chapters"]

    if not is_playlist:
        cmd.append("--no-playlist")
    
    cmd.append(url)
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        for line in process.stdout:
            # yt-dlp --newline output parsing
            if "[download]" in line and "%" in line:
                try:
                    parts = line.split()
                    for p in parts:
                        if "%" in p:
                            p_clean = p.replace("%", "")
                            # Handle cases like "100%" or "100.0%"
                            val = float(p_clean)
                            job["progress"] = val
                            break
                except:
                    pass
        
        process.wait()
        
        if process.returncode == 0:
            # Find the actual file (yt-dlp might have changed the ext)
            actual_files = list(media_dir.glob(f"{safe_name}.*"))
            # Filter out info.json
            media_files = [f for f in actual_files if not f.name.endswith(".info.json")]
            
            if media_files:
                file_path = media_files[0]
                job["status"] = "completed"
                job["progress"] = 100
                job["relative_path"] = file_path.name
                job["filesize"] = file_path.stat().st_size
                job["absolute_path"] = str(file_path.absolute())
                logger.info(f"Download completed: {file_path.name} at {job['absolute_path']}")
            else:
                job["status"] = "failed"
                job["error"] = "Media file not found after download"
        else:
            job["status"] = "failed"
            job["error"] = f"yt-dlp exited with code {process.returncode}"
            
    except Exception as e:
        logger.exception("Media download failed")
        job["status"] = "failed"
        job["error"] = str(e)
        
    return job

async def media_worker_loop(store_ref: Any, media_dir: Optional[Path] = None):
    """
    Background loop that checks for 'queued' jobs and processes them.
    Integrates with state store for persistence.
    """
    logger.info("VidBee-style Media Downloader worker started.")
    media_dir = media_dir or DEFAULT_DOWNLOAD_DIR
    
    while True:
        try:
            # Check for queued jobs
            downloads = store_ref.get_collection("downloads")
            if not isinstance(downloads, list):
                await asyncio.sleep(10)
                continue
                
            queued_job = next((j for j in downloads if j.get("status") == "queued"), None)
            
            if queued_job:
                # Process local with yt-dlp
                # This ensures we download locally to our server at 192.168.1.32
                await asyncio.to_thread(run_download_job, queued_job, media_dir)
                store_ref.save()
            
        except Exception as e:
            logger.error(f"Downloader loop error: {e}")
            
        await asyncio.sleep(5)
