from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
from routers import upload, query
from services.ai_service import GEMINI_MODEL, GEMINI_API_KEY
from services.vector_store import warmup_model
import asyncio


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload the embedding model in a thread so it doesn't block startup
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, warmup_model)
    yield

app = FastAPI(title="ResearchMind API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080", "http://localhost:8081", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", tags=["Upload"])
app.include_router(query.router,  prefix="/api", tags=["Query"])

# Serve uploaded PDFs so the frontend can display them
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

@app.get("/")
def root():
    return {"message": "ResearchMind backend is running ✅"}

@app.get("/api/health")
def health_check():
    """
    Checks if the Gemini API key is configured.
    Does NOT call the Gemini API — to avoid burning free-tier quota.
    The frontend polls this endpoint every 5s to show status.
    """
    if not GEMINI_API_KEY:
        return {
            "status": "offline",
            "model": GEMINI_MODEL,
            "model_ready": False,
            "error": "GEMINI_API_KEY not set in .env",
        }

    return {
        "status": "ready",
        "model": GEMINI_MODEL,
        "model_ready": True,
    }