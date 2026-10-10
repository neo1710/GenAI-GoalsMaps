from typing import Any, Dict, List, Literal, Optional, Union
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
# Excel Tool Schemas
# -------------------------------------------------------------

ExcelThemeType = Literal["corporate_blue", "emerald", "slate", "violet", "amber"]
ExcelTemplateType = Literal["kpi_dashboard", "financial_model", "project_tracker", "sales_summary"]


class ExcelSheetSpec(BaseModel):
    title: str = Field(..., description="Worksheet tab title")
    columns: List[str] = Field(default_factory=list, description="Column header names")
    rows: Optional[List[List[Any]]] = Field(None, description="2D list of row values")
    data: Optional[List[Dict[str, Any]]] = Field(None, description="List of dictionaries representing rows")
    header_bg_color: Optional[str] = Field(None, description="Hex color code without '#', e.g. '1E3A8A'")
    header_text_color: Optional[str] = Field("FFFFFF", description="Hex color code without '#'")
    column_formats: Optional[Dict[str, str]] = Field(
        None,
        description="Format type per column: 'currency', 'percent', 'integer', 'float', 'date', or custom code"
    )
    summary_row: Optional[Dict[str, str]] = Field(
        None,
        description="Optional aggregation formulas for columns, e.g. {'Revenue': 'SUM', 'Progress': 'AVERAGE'}"
    )
    column_widths: Optional[Dict[str, int]] = Field(None, description="Custom widths for columns")
    zebra_stripes: bool = Field(default=True, description="Alternating light row backgrounds")


class CreateExcelRequest(BaseModel):
    filename: str = Field(..., description="Target Excel file name, e.g. 'q3_report.xlsx'")
    document_title: Optional[str] = Field(None, description="Optional banner title placed above table on first sheet")
    theme: Optional[ExcelThemeType] = Field("corporate_blue", description="Color palette theme")
    sheets: Optional[List[ExcelSheetSpec]] = Field(None, description="List of worksheet specifications")
    template: Optional[ExcelTemplateType] = Field(None, description="Predefined template if sheets not provided")
    template_row_count: Optional[int] = Field(20, ge=1, le=1000, description="Row count for template generation")
    instructions: Optional[str] = Field(None, description="Natural language instructions for custom generation")


class CreateExcelResponse(BaseModel):
    success: bool
    filename: str
    relative_path: str
    absolute_path: str
    download_url: str
    sheets_created: List[str]
    total_rows: int
    file_size_bytes: int
    previews: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    message: str


class ExcelSheetInfo(BaseModel):
    sheet_name: str
    row_count: int
    column_count: int
    columns: List[str]
    preview: List[Dict[str, Any]] = Field(default_factory=list)


class ExcelInspectResponse(BaseModel):
    success: bool
    filename: str
    relative_path: str
    sheet_count: int
    sheet_names: List[str]
    sheets: List[ExcelSheetInfo]
    file_size_bytes: int


# -------------------------------------------------------------
# Word Tool Schemas
# -------------------------------------------------------------

WordThemeType = Literal["corporate_blue", "emerald", "slate", "violet", "amber"]
WordTemplateType = Literal["executive_summary", "goal_progress_report", "technical_spec", "project_status"]


class WordKpiCard(BaseModel):
    metric: str
    value: str
    subtitle: Optional[str] = None


class WordTableSpec(BaseModel):
    headers: List[str]
    rows: List[List[Any]]
    column_alignments: Optional[List[Literal["left", "center", "right"]]] = None


class WordSectionSpec(BaseModel):
    heading: Optional[str] = None
    level: int = Field(default=1, ge=1, le=3, description="Heading level (1, 2, or 3)")
    paragraphs: Optional[List[str]] = Field(None, description="List of paragraph text blocks")
    bullet_points: Optional[List[str]] = Field(None, description="Unordered bullet items")
    numbered_list: Optional[List[str]] = Field(None, description="Ordered numbered list items")
    callout: Optional[str] = Field(None, description="Highlighted takeaway callout box")
    kpis: Optional[List[WordKpiCard]] = Field(None, description="Side-by-side KPI metric cards")
    table: Optional[WordTableSpec] = Field(None, description="Embedded styled table")


class CreateWordRequest(BaseModel):
    filename: str = Field(..., description="Target Word document name, e.g. 'Project_Status.docx'")
    document_title: str = Field(..., description="Primary title of the document")
    subtitle: Optional[str] = Field(None, description="Secondary subtitle or project descriptor")
    author: Optional[str] = Field(None, description="Author or organisation name")
    date_str: Optional[str] = Field(None, description="Date string or empty for current date")
    theme: Optional[WordThemeType] = Field("corporate_blue", description="Visual styling palette")
    sections: Optional[List[WordSectionSpec]] = Field(None, description="List of document sections")
    template: Optional[WordTemplateType] = Field(None, description="Predefined template if sections not provided")
    instructions: Optional[str] = Field(None, description="Natural language instructions for custom generation")


class CreateWordResponse(BaseModel):
    success: bool
    filename: str
    relative_path: str
    absolute_path: str
    download_url: str
    word_count: int
    section_count: int
    table_count: int
    file_size_bytes: int
    markdown_summary: str
    message: str


class WordInspectResponse(BaseModel):
    success: bool
    filename: str
    relative_path: str
    title: str
    author: Optional[str] = None
    paragraph_count: int
    word_count: int
    table_count: int
    headings: List[Dict[str, Any]]
    paragraphs_preview: List[str]
    tables: List[Dict[str, Any]]
    markdown_content: str
    file_size_bytes: int


# -------------------------------------------------------------
# Skills System Schemas
# -------------------------------------------------------------

SkillCategory = Literal["excel", "word", "data_analysis", "python", "custom"]


class SkillDefinition(BaseModel):
    id: str = Field(..., description="Unique slug identifier, e.g. 'excel_kpi_dashboard'")
    name: str = Field(..., description="Human-readable name")
    category: SkillCategory = Field(default="custom", description="Skill domain")
    description: str = Field(..., description="Summary of capability")
    instructions: str = Field(..., description="Step-by-step instructions executed by the agent")
    parameters_schema: Dict[str, Any] = Field(default_factory=dict, description="Expected parameter dictionary structure")
    output_format: str = Field(default="mixed", description="Primary output format: excel, word, csv, json, mixed")
    is_builtin: bool = Field(default=False, description="True if core built-in skill")
    tags: List[str] = Field(default_factory=list)


class SkillRunRequest(BaseModel):
    skill_id: Optional[str] = Field(None, description="Identifier of registered skill")
    skill_definition: Optional[SkillDefinition] = Field(None, description="Inline custom skill definition if not pre-registered")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Parameters passed into the skill")
    stream: bool = Field(default=False, description="Whether to stream execution events via SSE")


class SkillRunResponse(BaseModel):
    success: bool
    skill_id: str
    summary: str
    result: Any
    files_created: List[str] = Field(default_factory=list)
    execution_time_ms: float = 0.0


class SkillListResponse(BaseModel):
    skills: List[SkillDefinition]
    total_count: int


# -------------------------------------------------------------
# Agent Unified Dispatch Schemas
# -------------------------------------------------------------

AgentActionType = Literal[
    "create_csv",
    "create_synthetic_csv",
    "analyze_csv",
    "query_csv",
    "execute_python",
    "list_files",
    "create_excel",
    "inspect_excel",
    "analyze_excel",
    "create_word",
    "inspect_word",
    "read_word",
    "extract_word_tables",
    "execute_skill"
]


class AgentActionRequest(BaseModel):
    action: AgentActionType = Field(..., description="Action to perform")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Action arguments matching the tool schema")
    skill_id: Optional[str] = Field(None, description="Optional skill ID if action is 'execute_skill'")
    skill_definition: Optional[SkillDefinition] = Field(None, description="Optional inline skill definition")
    stream: bool = Field(default=False, description="Whether to stream execution events via SSE")


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
