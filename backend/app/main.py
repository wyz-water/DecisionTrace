from fastapi import FastAPI

from app.database import Base, engine

from app.models.project import Project
from app.models.discussion import Discussion
from app.models.decision import Decision
from app.models.commitment import Commitment
from app.models.dependency import Dependency

from app.routes.projects import router as projects_router
from app.routes.discussions import router as discussions_router
from app.routes.decisions import router as decisions_router
from app.routes.commitments import router as commitments_router
from app.routes.dependencies import router as dependencies_router


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="DecisionTrace API",
    description="Backend API for the DecisionTrace project",
    version="0.1.0"
)


app.include_router(projects_router)
app.include_router(discussions_router)
app.include_router(decisions_router)
app.include_router(commitments_router)
app.include_router(dependencies_router)


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