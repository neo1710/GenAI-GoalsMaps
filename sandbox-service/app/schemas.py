from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# -------------------------------------------------------------
# Code Execution Schemas
# -------------------------------------------------------------

class ExecuteCodeRequest(BaseModel):
    code: str = Field(..., description="Python code string to execute in the sandbox")
    timeout_seconds: Optional[int] = Field(None, ge=1, le=120, description="Execution timeout in seconds")
    input_files: Optional[Dict[str, str]] = Field(
        default=None,
        description="Optional dict of {relative_path: content} to populate in input/ before running"
    )
    env_vars: Optional[Dict[str, str]] = Field(
        default=None,
        description="Optional environment variables to pass into subprocess"
    )


class ExecuteCodeResponse(BaseModel):
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    execution_time_ms: float
    output_files: List[str] = Field(default_factory=list, description="Files present or created in output/")
    download_urls: List[str] = Field(default_factory=list, description="Direct download URLs for created files")
    error_message: Optional[str] = None


# -------------------------------------------------------------
# CSV Creator Schemas
# -------------------------------------------------------------

class CreateCsvFromRecordsRequest(BaseModel):
    filename: str = Field(..., description="Target file name, e.g. 'users.csv'")
    data: List[Dict[str, Any]] = Field(..., description="List of dictionaries representing rows")
    delimiter: str = Field(default=",", description="CSV delimiter character (default: ',')")
    include_header: bool = Field(default=True, description="Whether to include column headers")


class CreateCsvFromMatrixRequest(BaseModel):
    filename: str = Field(..., description="Target file name, e.g. 'report.csv'")
    columns: List[str] = Field(..., description="Column names")
    rows: List[List[Any]] = Field(..., description="2D list of row values")
    delimiter: str = Field(default=",", description="CSV delimiter character (default: ',')")


SyntheticTemplateType = Literal[
    "goals_and_milestones",
    "sales_performance",
    "user_analytics",
    "timeseries_metrics",
    "project_tasks"
]


class ColumnSpec(BaseModel):
    name: str
    type: Literal["integer", "float", "string", "category", "date", "boolean"]
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    categories: Optional[List[str]] = None


class CreateSyntheticCsvRequest(BaseModel):
    filename: str = Field(..., description="Target file name, e.g. 'synthetic_goals.csv'")
    template: Optional[SyntheticTemplateType] = Field(
        None,
        description="Predefined template: 'goals_and_milestones', 'sales_performance', 'user_analytics', etc."
    )
    row_count: int = Field(default=50, ge=1, le=10000, description="Number of synthetic rows to generate")
    custom_columns: Optional[List[ColumnSpec]] = Field(
        None,
        description="Custom column specifications if not using a predefined template"
    )
    seed: Optional[int] = Field(default=42, description="Random seed for reproducible generation")


class CreateCsvResponse(BaseModel):
    success: bool
    filename: str
    relative_path: str
    absolute_path: str
    download_url: str = Field(..., description="Direct download URL, e.g. /files/download/output/file.csv")
    row_count: int
    column_count: int
    columns: List[str]
    file_size_bytes: int
    preview: List[Dict[str, Any]] = Field(default_factory=list, description="First few rows as dicts")
    message: str


# -------------------------------------------------------------
# CSV Analyser Schemas
# -------------------------------------------------------------

class AnalyzeCsvRequest(BaseModel):
    filename: Optional[str] = Field(None, description="Name of CSV file in input/ or output/ folder")
    csv_content: Optional[str] = Field(None, description="Raw CSV string content (if not using file)")
    delimiter: Optional[str] = Field(None, description="Delimiter (auto-detected if None)")
    top_correlations_count: int = Field(default=5, ge=1, le=20, description="Max correlation pairs to return")
    generate_markdown_report: bool = Field(default=True, description="Whether to include a Markdown summary")


class NumericalStats(BaseModel):
    count: int
    missing_count: int
    missing_pct: float
    mean: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    q25: Optional[float] = None
    median: Optional[float] = None
    q75: Optional[float] = None
    max: Optional[float] = None
    skew: Optional[float] = None
    outliers_count: int = 0
    outliers_sample: List[float] = Field(default_factory=list)


class CategoricalStats(BaseModel):
    count: int
    missing_count: int
    missing_pct: float
    unique_count: int
    cardinality_ratio: float
    top_values: List[Dict[str, Any]] = Field(default_factory=list)


class ColumnProfile(BaseModel):
    name: str
    inferred_type: str
    numerical_stats: Optional[NumericalStats] = None
    categorical_stats: Optional[CategoricalStats] = None


class CorrelationPair(BaseModel):
    column_x: str
    column_y: str
    correlation: float


class QualityIssue(BaseModel):
    severity: Literal["info", "warning", "critical"]
    column: Optional[str] = None
    issue: str
    detail: str


class AnalyzeCsvResponse(BaseModel):
    success: bool
    source: str
    row_count: int
    column_count: int
    columns: List[str]
    memory_usage_bytes: int
    duplicate_rows_count: int
    column_profiles: List[ColumnProfile]
    correlations: List[CorrelationPair] = Field(default_factory=list)
    quality_issues: List[QualityIssue] = Field(default_factory=list)
    markdown_report: Optional[str] = None
    preview: List[Dict[str, Any]] = Field(default_factory=list)


# -------------------------------------------------------------
# CSV Query Schemas
# -------------------------------------------------------------

class QueryCsvRequest(BaseModel):
    filename: str = Field(..., description="CSV filename in input/ or output/")
    filter_expression: Optional[str] = Field(None, description="Filter string, e.g. \"status == 'completed' and progress_pct > 50\"")
    columns: Optional[List[str]] = Field(None, description="Subset of columns to return")
    sort_by: Optional[str] = Field(None, description="Column to sort by")
    ascending: bool = Field(default=True, description="Sort ascending or descending")
    limit: int = Field(default=50, ge=1, le=1000, description="Max rows to return")
    save_result_to: Optional[str] = Field(None, description="Optional filename in output/ to save queried rows as CSV")


class QueryCsvResponse(BaseModel):
    success: bool
    total_matching_rows: int
    returned_rows_count: int
    columns: List[str]
    rows: List[Dict[str, Any]]
    saved_file: Optional[str] = None
    download_url: Optional[str] = Field(None, description="Direct download URL if saved_file was created")


# -------------------------------------------------------------
# Agent Unified Dispatch Schemas
# -------------------------------------------------------------

AgentActionType = Literal[
    "create_csv",
    "create_synthetic_csv",
    "analyze_csv",
    "query_csv",
    "execute_python",
    "list_files"
]


class AgentActionRequest(BaseModel):
    action: AgentActionType = Field(..., description="Action to perform")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Action arguments matching the tool schema")


class AgentActionResponse(BaseModel):
    success: bool
    action: AgentActionType
    summary: str
    result: Any
    files_created: List[str] = Field(default_factory=list)


# -------------------------------------------------------------
# File Management Schemas
# -------------------------------------------------------------

class FileItem(BaseModel):
    name: str
    folder: Literal["input", "output"]
    relative_path: str
    size_bytes: int
    last_modified: str


class FileListResponse(BaseModel):
    input_files: List[FileItem]
    output_files: List[FileItem]
    total_count: int

