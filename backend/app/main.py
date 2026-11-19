from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine

# Model imports register the tables with SQLAlchemy metadata; legacy
# tables (Snapshot, Argument) stay registered so create_all does not
# drop anything and the demo database keeps working.
from app.models.project import Project  # noqa: F401
from app.models.discussion import Discussion  # noqa: F401
from app.models.decision import Decision  # noqa: F401
from app.models.decision_history import DecisionHistory  # noqa: F401
from app.models.commitment import Commitment  # noqa: F401
from app.models.dependency import Dependency  # noqa: F401
from app.models.commitment_history import CommitmentHistory  # noqa: F401
from app.models.candidate import Candidate  # noqa: F401
from app.models.chain import Chain  # noqa: F401
from app.models.chain_annotation import ChainAnnotation  # noqa: F401
from app.models.chain_comment import ChainComment  # noqa: F401

from app.routes.projects import router as projects_router
from app.routes.discussions import router as discussions_router
from app.routes.decisions import router as decisions_router
from app.routes.commitments import router as commitments_router
from app.routes.candidates import router as candidates_router
from app.routes.chains import router as chains_router


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
app.include_router(candidates_router)
app.include_router(chains_router)


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
