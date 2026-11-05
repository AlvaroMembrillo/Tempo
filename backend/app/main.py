from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, data, events, holidays, projects, reports, time_blocks

app = FastAPI(
    title="Tempo API",
    description="Horas de trabajo, proyectos y disponibilidad.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth, projects, events, time_blocks, holidays, reports, data):
    app.include_router(router.router)


@app.get("/health", tags=["Sistema"])
def health() -> dict[str, str]:
    return {"status": "ok"}
