from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine

from app.models.project import Project
from app.models.discussion import Discussion
from app.models.decision import Decision
from app.models.decision_history import DecisionHistory
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.models.commitment_history import CommitmentHistory
from app.models.candidate import Candidate

from app.routes.projects import router as projects_router
from app.routes.discussions import router as discussions_router
from app.routes.decisions import router as decisions_router
from app.routes.commitments import router as commitments_router
from app.routes.dependencies import router as dependencies_router
from app.routes.candidates import router as candidates_router


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="DecisionTrace API",
    description="Backend API for the DecisionTrace project",
    version="0.1.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(projects_router)
app.include_router(discussions_router)
app.include_router(decisions_router)
app.include_router(commitments_router)
app.include_router(dependencies_router)
app.include_router(candidates_router)


@app.get("/")
def root():
    return {
        "message": "DecisionTrace API is running!"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }