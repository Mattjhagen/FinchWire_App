from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
import logging
import uuid
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection with fallback for simple local setup
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'finchwire')
db = None

if mongo_url:
    try:
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        print(f"Connected to MongoDB: {mongo_url}")
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
else:
    print("No MONGO_URL found, using in-memory storage.")

# Create the main app
app = FastAPI(title="FinchWire Media Server")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

def datetime_utcnow():
    return datetime.utcnow()

# --- Models ---

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime_utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class LoginRequest(BaseModel):
    password: str

class AuthResponse(BaseModel):
    success: bool = True
    token: str = "bypass"

class SessionResponse(BaseModel):
    authenticated: bool = True

class MediaJob(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    original_url: str
    status: str = "queued"
    progress_percent: int = 0
    downloaded_bytes: int = 0
    total_bytes: int = 0
    filename: str
    safe_filename: str
    relative_path: str = ""
    file_size: int = 0
    source_domain: str = ""
    created_at: datetime = Field(default_factory=datetime_utcnow)
    updated_at: datetime = Field(default_factory=datetime_utcnow)
    is_audio: bool = False

class DownloadRequest(BaseModel):
    url: str
    filename: Optional[str] = None
    subfolder: Optional[str] = None
    is_audio: Optional[bool] = False

# --- Mock Storage ---
# For when MongoDB is not available
MOCK_DOWNLOAD_JOBS = []

# Helper to get/set jobs
async def get_all_jobs():
    if db:
        return await db.downloads.find().to_list(1000)
    return MOCK_DOWNLOAD_JOBS

async def add_job(job: MediaJob):
    if db:
        await db.downloads.insert_one(job.dict())
    else:
        MOCK_DOWNLOAD_JOBS.append(job.dict())

async def delete_job_by_id(job_id: str):
    if db:
        await db.downloads.delete_one({"id": job_id})
    else:
        global MOCK_DOWNLOAD_JOBS
        MOCK_DOWNLOAD_JOBS = [j for j in MOCK_DOWNLOAD_JOBS if j["id"] != job_id]

async def update_job_by_id(job_id: str, updates: dict):
    if db:
        await db.downloads.update_one({"id": job_id}, {"$set": updates})
    else:
        for j in MOCK_DOWNLOAD_JOBS:
            if j["id"] == job_id:
                j.update(updates)

# --- Routes ---

@api_router.get("/")
async def root():
    return {"message": "FinchWire Media API is running"}

# Auth
@api_router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    # Accept any password for mock but typically check against env
    return AuthResponse()

@api_router.post("/logout")
async def logout():
    return {"success": True}

@api_router.get("/session", response_model=SessionResponse)
async def session():
    return SessionResponse()

# Downloads
@api_router.get("/downloads", response_model=List[MediaJob])
async def get_downloads():
    return await get_all_jobs()

@api_router.post("/downloads", response_model=MediaJob)
async def submit_download(req: DownloadRequest):
    new_job = MediaJob(
        url=req.url,
        original_url=req.url,
        filename=req.filename or req.url.split("/")[-1] or "download",
        safe_filename=(req.filename or req.url.split("/")[-1] or "download").replace(" ", "_"),
        is_audio=req.is_audio or False,
        source_domain=req.url.split("//")[-1].split("/")[0] if "//" in req.url else ""
    )
    # Set relative path for UI
    new_job.relative_path = new_job.safe_filename
    
    await add_job(new_job)
    return new_job

@api_router.delete("/downloads/{job_id}")
async def delete_download(job_id: str):
    await delete_job_by_id(job_id)
    return {"success": True}

@api_router.post("/downloads/{job_id}/retry")
async def retry_download(job_id: str):
    await update_job_by_id(job_id, {"status": "queued", "progress_percent": 0, "error_message": None})
    return {"success": True}

# Status
@api_router.get("/status")
async def get_status_checks():
    if db:
        checks = await db.status_checks.find().to_list(1000)
        return checks
    return []

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    check = StatusCheck(client_name=input.client_name)
    if db:
        await db.status_checks.insert_one(check.dict())
    return check

# --- Media Serving ---
MEDIA_DIR = ROOT_DIR / "media"
MEDIA_DIR.mkdir(exist_ok=True)

# Include the router in the main app
app.include_router(api_router)

# Mount media directory for static file access
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    if db and hasattr(client, 'close'):
        client.close()

