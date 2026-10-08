import os
import shutil
from typing import Literal, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

from app.agent.dispatcher import AgentDispatcher
from app.config import settings
from app.sandbox.runner import SandboxRunner
from app.schemas import (
    AgentActionRequest,
    AgentActionResponse,
    AnalyzeCsvRequest,
    AnalyzeCsvResponse,
    CreateCsvFromMatrixRequest,
    CreateCsvFromRecordsRequest,
    CreateCsvResponse,
    CreateSyntheticCsvRequest,
    ExecuteCodeRequest,
    ExecuteCodeResponse,
    FileListResponse,
    QueryCsvRequest,
    QueryCsvResponse,
)
from app.tools.csv_analyser import CSVAnalyser
from app.tools.csv_creator import CSVCreator
from app.tools.file_manager import FileManager

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Python Sandbox Environment for Backend AI Agents, CSV Analysis, Creation, and Code Execution.",
)

# Enable CORS for frontend or local dev tools
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    settings.ensure_directories()


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint and environment configuration status."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "workspace": str(settings.WORKSPACE_DIR),
        "input_dir": str(settings.INPUT_DIR),
        "output_dir": str(settings.OUTPUT_DIR),
        "security_check_enabled": settings.ENABLE_SECURITY_CHECK,
    }


# -------------------------------------------------------------
# Agent Unified Runner
# -------------------------------------------------------------

@app.post("/agent/run", response_model=AgentActionResponse, tags=["Agent Dispatch"])
def run_agent_action(req: AgentActionRequest):
    """
    Unified agent dispatch endpoint.
    Actions supported:
    - 'create_csv'
    - 'create_synthetic_csv'
    - 'analyze_csv'
    - 'query_csv'
    - 'execute_python'
    - 'list_files'
    """
    try:
        return AgentDispatcher.dispatch(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# -------------------------------------------------------------
# Python Sandbox Execution
# -------------------------------------------------------------

@app.post("/execute", response_model=ExecuteCodeResponse, tags=["Sandbox Execution"])
def execute_python_code(req: ExecuteCodeRequest):
    """
    Execute Python code inside the sandbox environment.
    Scripts run with working directory set to /workspace, with full access to
    input/ and output/ directories, subject to timeouts and security policies.
    """
    return SandboxRunner.execute(req)


# -------------------------------------------------------------
# CSV Tools
# -------------------------------------------------------------

@app.post("/csv/create", response_model=CreateCsvResponse, tags=["CSV Tools"])
def create_csv(req: CreateCsvFromRecordsRequest):
    """Create a CSV file in output/ from a list of records/dictionaries."""
    try:
        return CSVCreator.from_records(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/csv/create-matrix", response_model=CreateCsvResponse, tags=["CSV Tools"])
def create_csv_from_matrix(req: CreateCsvFromMatrixRequest):
    """Create a CSV file in output/ from column names and 2D row values."""
    try:
        return CSVCreator.from_matrix(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/csv/synthetic", response_model=CreateCsvResponse, tags=["CSV Tools"])
def create_synthetic_csv(req: CreateSyntheticCsvRequest):
    """
    Generate realistic synthetic CSV datasets for testing or demo pipelines.
    Templates: 'goals_and_milestones', 'sales_performance', 'user_analytics',
    'timeseries_metrics', 'project_tasks', or custom column schemas.
    """
    try:
        return CSVCreator.create_synthetic(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/csv/analyze", response_model=AnalyzeCsvResponse, tags=["CSV Tools"])
def analyze_csv(req: AnalyzeCsvRequest):
    """
    Perform statistical profiling, anomaly detection, correlation analysis,
    and generate a Markdown summary for a CSV file or raw CSV string.
    """
    try:
        return CSVAnalyser.analyze(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/csv/query", response_model=QueryCsvResponse, tags=["CSV Tools"])
def query_csv(req: QueryCsvRequest):
    """
    Filter, project, and sort records from an existing CSV file.
    Can optionally save results into a new CSV file in output/.
    """
    try:
        return CSVAnalyser.query(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# -------------------------------------------------------------
# File Management
# -------------------------------------------------------------

@app.get("/files", response_model=FileListResponse, tags=["File Management"])
def list_workspace_files():
    """List all files in workspace input/ and output/ directories."""
    return FileManager.list_files()


@app.post("/files/upload", tags=["File Management"])
async def upload_file(
    file: UploadFile = File(...),
    folder: Literal["input", "output"] = Query("input", description="Target folder ('input' or 'output')")
):
    """Upload a file to the sandbox input/ or output/ folder."""
    try:
        target_path = FileManager.get_input_path(file.filename) if folder == "input" else FileManager.get_output_path(file.filename)
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "success": True,
            "filename": target_path.name,
            "folder": folder,
            "relative_path": f"{folder}/{target_path.name}",
            "size_bytes": target_path.stat().st_size,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/files/download/{folder}/{filename}", tags=["File Management"])
def download_file(
    folder: Literal["input", "output"],
    filename: str,
    inline: bool = Query(False, description="If true, display in browser; if false, trigger attachment download")
):
    """
    Download a file from input/ or output/ folder.
    Access directly via browser or HTTP client, e.g.:
    GET http://localhost:8001/files/download/output/goals.csv
    """
    try:
        path = FileManager.resolve_path(filename, folder=folder)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found in {folder}/.")

        media_type = "text/csv" if path.suffix.lower() == ".csv" else (
            "application/json" if path.suffix.lower() == ".json" else "text/plain"
        )
        content_disposition_type = "inline" if inline else "attachment"

        return FileResponse(
            path=str(path),
            filename=path.name,
            media_type=media_type,
            content_disposition_type=content_disposition_type,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/files/raw/{folder}/{filename}", response_class=PlainTextResponse, tags=["File Management"])
def get_raw_file_content(folder: Literal["input", "output"], filename: str):
    """
    Fetch the raw text content of a file (e.g. CSV or TXT) directly as plain text.
    Ideal for frontends or backend agents needing file content without parsing binary files.
    """
    try:
        content = FileManager.read_file(filename, folder=folder)
        return PlainTextResponse(content=content, media_type="text/plain; charset=utf-8")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found in {folder}/.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)

