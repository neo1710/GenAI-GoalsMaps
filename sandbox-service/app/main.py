import os
import shutil
from typing import Any, Dict, List, Literal, Optional

from fastapi import Body, FastAPI, File, HTTPException, Path as FPath, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse

from app.agent.dispatcher import AgentDispatcher
from app.config import settings
from app.sandbox.runner import SandboxRunner
from app.sandbox.stream_runner import SandboxStreamRunner
from app.schemas import (
    AgentActionRequest,
    AgentActionResponse,
    AnalyzeCsvRequest,
    AnalyzeCsvResponse,
    CreateCsvFromMatrixRequest,
    CreateCsvFromRecordsRequest,
    CreateCsvResponse,
    CreateExcelRequest,
    CreateExcelResponse,
    CreateSyntheticCsvRequest,
    CreateWordRequest,
    CreateWordResponse,
    ExcelInspectResponse,
    ExecuteCodeRequest,
    ExecuteCodeResponse,
    FileListResponse,
    QueryCsvRequest,
    QueryCsvResponse,
    SkillDefinition,
    SkillListResponse,
    SkillRunRequest,
    SkillRunResponse,
    WordInspectResponse,
)
from app.skills.manager import SkillManager, SkillRegistry
from app.tools.csv_analyser import CSVAnalyser
from app.tools.csv_creator import CSVCreator
from app.tools.excel_tool import ExcelTool
from app.tools.file_manager import FileManager
from app.tools.word_tool import WordTool

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="2.0.0",
    description="Python Sandbox Environment for Backend AI Agents, Streaming Code Execution, Skills Engine, Office (Excel/Word) Manipulation, and CSV Analysis.",
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
        "version": "2.0.0",
        "capabilities": [
            "streaming_python_execution",
            "streaming_agent_dispatcher",
            "skills_instruction_engine",
            "excel_creation_and_analysis",
            "word_document_creation_and_extraction",
            "csv_analysis_and_synthetic_data",
        ],
        "workspace": str(settings.WORKSPACE_DIR),
        "input_dir": str(settings.INPUT_DIR),
        "output_dir": str(settings.OUTPUT_DIR),
        "security_check_enabled": settings.ENABLE_SECURITY_CHECK,
    }


# -------------------------------------------------------------
# Agent Unified Runner & Streaming
# -------------------------------------------------------------

@app.post("/agent/run", tags=["Agent Dispatch"])
def run_agent_action(req: AgentActionRequest):
    """
    Unified agent dispatch endpoint.
    If req.stream is True, streams SSE live events; otherwise returns JSON AgentActionResponse.
    Actions supported:
    - 'create_csv', 'create_synthetic_csv', 'analyze_csv', 'query_csv'
    - 'create_excel', 'inspect_excel', 'analyze_excel'
    - 'create_word', 'inspect_word', 'read_word', 'extract_word_tables'
    - 'execute_python', 'execute_skill', 'list_files'
    """
    try:
        if req.stream:
            return StreamingResponse(
                AgentDispatcher.dispatch_stream(req),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )
        return AgentDispatcher.dispatch(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/agent/run/stream", tags=["Agent Dispatch"])
def run_agent_action_stream(req: AgentActionRequest):
    """
    Streams agent execution events live as Server-Sent Events (SSE).
    Real-time progress, steps, stdout/stderr, files created, and final result.
    """
    req.stream = True
    return StreamingResponse(
        AgentDispatcher.dispatch_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# -------------------------------------------------------------
# Python Sandbox Execution (Sync & Streaming)
# -------------------------------------------------------------

@app.post("/execute", response_model=ExecuteCodeResponse, tags=["Sandbox Execution"])
def execute_python_code(req: ExecuteCodeRequest):
    """
    Execute Python code inside the sandbox environment (synchronous).
    Scripts run with working directory set to /workspace, with full access to
    input/ and output/ directories, subject to timeouts and security policies.
    """
    return SandboxRunner.execute(req)


@app.post("/execute/stream", tags=["Sandbox Execution"])
def execute_python_code_stream(req: ExecuteCodeRequest):
    """
    Execute Python code with real-time Server-Sent Events (SSE) streaming.
    Streams stdout lines, stderr lines, keep-alive heartbeats, and created files live.
    """
    return StreamingResponse(
        SandboxStreamRunner.execute_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# -------------------------------------------------------------
# Skills Engine (Instructions for Tasks)
# -------------------------------------------------------------

@app.get("/skills", response_model=SkillListResponse, tags=["Skills Engine"])
def list_skills():
    """List all available skills (both core built-in and dynamically registered custom skills)."""
    skills = SkillRegistry.list_skills()
    return SkillListResponse(skills=skills, total_count=len(skills))


@app.get("/skills/{skill_id}", response_model=SkillDefinition, tags=["Skills Engine"])
def get_skill(skill_id: str):
    """Retrieve details, instructions, and schema for a specific skill."""
    skill = SkillRegistry.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found.")
    return skill


@app.post("/skills", response_model=SkillDefinition, tags=["Skills Engine"])
def register_skill(skill: SkillDefinition):
    """Register or update a custom reusable instruction skill."""
    return SkillRegistry.register_skill(skill)


@app.delete("/skills/{skill_id}", tags=["Skills Engine"])
def delete_skill(skill_id: str):
    """Delete a custom registered skill (built-in skills are protected)."""
    try:
        deleted = SkillRegistry.delete_skill(skill_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found.")
        return {"success": True, "message": f"Skill '{skill_id}' deleted."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/skills/run", response_model=SkillRunResponse, tags=["Skills Engine"])
def run_skill(req: SkillRunRequest):
    """
    Execute a skill synchronously using provided parameters.
    Can reference a registered skill by 'skill_id' or supply an inline 'skill_definition'.
    """
    try:
        if req.stream:
            return StreamingResponse(
                SkillManager.run_skill_stream(req),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )
        return SkillManager.run_skill(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/skills/run/stream", tags=["Skills Engine"])
def run_skill_stream(req: SkillRunRequest):
    """
    Execute a skill with live Server-Sent Events (SSE) streaming.
    Streams instruction steps, logs, file creation events, and final result.
    """
    req.stream = True
    return StreamingResponse(
        SkillManager.run_skill_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# -------------------------------------------------------------
# Excel Tools (Creation, Analysis, Inspection)
# -------------------------------------------------------------

@app.post("/excel/create", response_model=CreateExcelResponse, tags=["Excel Tools"])
def create_excel_file(req: CreateExcelRequest):
    """
    Create a styled multi-sheet Excel (.xlsx) file based on instructions and data.
    Supports themes, auto-fit column widths, currency/percentage formatting, and summary formulas.
    """
    try:
        return ExcelTool.create_excel(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/excel/inspect", response_model=ExcelInspectResponse, tags=["Excel Tools"])
def inspect_excel_file(
    filename: str = Body(..., embed=True, description="Name of Excel file in workspace"),
    folder: Optional[Literal["input", "output"]] = Body(None, embed=True),
):
    """Inspect sheets, dimensions, headers, and preview rows of an Excel file."""
    try:
        return ExcelTool.inspect_file(filename, folder=folder)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/excel/analyze", response_model=AnalyzeCsvResponse, tags=["Excel Tools"])
def analyze_excel_sheet(
    filename: str = Body(..., embed=True),
    sheet_name: Optional[str] = Body(None, embed=True),
    folder: Optional[Literal["input", "output"]] = Body(None, embed=True),
    generate_markdown_report: bool = Body(True, embed=True),
):
    """Perform statistical profiling, IQR anomaly detection, and LLM Markdown summary on an Excel sheet."""
    try:
        return ExcelTool.analyze_sheet(
            filename=filename,
            sheet_name=sheet_name,
            folder=folder,
            generate_markdown=generate_markdown_report,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/excel/convert-to-csv", tags=["Excel Tools"])
def convert_excel_to_csv(
    filename: str = Body(..., embed=True),
    sheet_name: Optional[str] = Body(None, embed=True),
    output_filename: Optional[str] = Body(None, embed=True),
    folder: Optional[Literal["input", "output"]] = Body(None, embed=True),
):
    """Extract a sheet from an Excel file and save it as a standard CSV in workspace output/."""
    try:
        return ExcelTool.convert_to_csv(
            filename=filename,
            sheet_name=sheet_name,
            output_filename=output_filename,
            folder=folder,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# -------------------------------------------------------------
# Word Tools (Creation, Extraction, Inspection)
# -------------------------------------------------------------

@app.post("/word/create", response_model=CreateWordResponse, tags=["Word Tools"])
def create_word_document(req: CreateWordRequest):
    """
    Create a styled Microsoft Word (.docx) document based on structured sections or templates.
    Supports title banners, KPI cards, callout highlight boxes, styled tables, and lists.
    """
    try:
        return WordTool.create_word(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/word/inspect", response_model=WordInspectResponse, tags=["Word Tools"])
def inspect_word_document(
    filename: str = Body(..., embed=True),
    folder: Optional[Literal["input", "output"]] = Body(None, embed=True),
):
    """Inspect a Word (.docx) file: extract headings, paragraph previews, tables, and word count."""
    try:
        return WordTool.inspect_file(filename, folder=folder)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/word/read", response_class=PlainTextResponse, tags=["Word Tools"])
def read_word_document_markdown(
    filename: str = Body(..., embed=True),
    folder: Optional[Literal["input", "output"]] = Body(None, embed=True),
):
    """Extract full textual and tabular content of a Word file formatted as clean Markdown."""
    try:
        content = WordTool.read_text(filename, folder=folder)
        return PlainTextResponse(content=content, media_type="text/markdown; charset=utf-8")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/word/extract-tables", tags=["Word Tools"])
def extract_word_tables(
    filename: str = Body(..., embed=True),
    folder: Optional[Literal["input", "output"]] = Body(None, embed=True),
):
    """Extract all embedded tables from a Word file as structured JSON arrays."""
    try:
        tables = WordTool.extract_tables(filename, folder=folder)
        return {"success": True, "filename": filename, "table_count": len(tables), "tables": tables}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    """Upload a file (.csv, .xlsx, .docx, .txt, .json, .py) to the sandbox input/ or output/ folder."""
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
    Download a file from input/ or output/ folder with proper Office, PDF, CSV, and text MIME types.
    """
    try:
        path = FileManager.resolve_path(filename, folder=folder)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found in {folder}/.")

        ext = path.suffix.lower()
        if ext == ".csv":
            media_type = "text/csv"
        elif ext == ".xlsx":
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif ext == ".xls":
            media_type = "application/vnd.ms-excel"
        elif ext == ".docx":
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif ext == ".doc":
            media_type = "application/msword"
        elif ext == ".json":
            media_type = "application/json"
        elif ext == ".pdf":
            media_type = "application/pdf"
        else:
            media_type = "text/plain"

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
    Fetch text content of a file directly as plain text.
    For Word (.docx) and Excel (.xlsx) files, automatically extracts markdown/tabular representations.
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
