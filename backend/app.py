from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.constants import ALLOWED_ORIGINS
from routes.auth import router as auth_router
from routes.files import router as files_router
from routes.analytics import router as analytics_router
from services.expiry_service import start_expiry_checker


app = FastAPI(title="Secure File Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ALLOWED_ORIGINS == ["*"] else ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers (endpoints remain unchanged)
app.include_router(auth_router)
app.include_router(files_router)
app.include_router(analytics_router)


@app.on_event("startup")
def on_startup():
    """Start background services when the server starts."""
    start_expiry_checker()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
