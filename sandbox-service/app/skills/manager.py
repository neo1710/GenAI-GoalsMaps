import json
import time
from typing import Any, Dict, Generator, List, Optional

from app.sandbox.stream_runner import format_sse
from app.schemas import (
    CreateCsvFromRecordsRequest,
    CreateExcelRequest,
    CreateSyntheticCsvRequest,
    CreateWordRequest,
    SkillDefinition,
    SkillRunRequest,
    SkillRunResponse,
)
from app.tools.csv_analyser import CSVAnalyser
from app.tools.csv_creator import CSVCreator
from app.tools.excel_tool import ExcelTool
from app.tools.file_manager import FileManager
from app.tools.word_tool import WordTool


BUILTIN_SKILLS: List[SkillDefinition] = [
    SkillDefinition(
        id="excel_kpi_dashboard",
        name="Excel KPI Dashboard Builder",
        category="excel",
        description="Generates an executive, styled multi-tab Excel workbook featuring KPI scorecards, formatted currency/percentages, and automated formula summaries.",
        instructions="""1. Parse input parameters: filename (default 'KPI_Dashboard.xlsx'), theme ('corporate_blue', 'emerald', 'slate'), and dataset rows.
2. If custom rows are not supplied, generate realistic executive milestone metrics with budget, progress %, and owners.
3. Apply styling: colored header bands, currency formats ($#,##0), percentage formats (0.0%), and automated SUM/AVERAGE formula rows.
4. Auto-fit column widths and write the workbook to workspace output/.""",
        parameters_schema={
            "filename": {"type": "string", "default": "KPI_Dashboard.xlsx"},
            "theme": {"type": "string", "enum": ["corporate_blue", "emerald", "slate", "violet", "amber"], "default": "corporate_blue"},
            "template": {"type": "string", "enum": ["kpi_dashboard", "financial_model", "project_tracker", "sales_summary"], "default": "kpi_dashboard"},
            "row_count": {"type": "integer", "default": 20},
        },
        output_format="excel",
        is_builtin=True,
        tags=["excel", "kpi", "dashboard", "reporting"],
    ),
    SkillDefinition(
        id="word_executive_report",
        name="Word Executive Report Generator",
        category="word",
        description="Compiles strategic summaries, KPI highlight cards, status tables, and action items into a polished Microsoft Word (.docx) document.",
        instructions="""1. Structure document with primary Title, Subtitle, Author, and generated Date metadata.
2. Render an Executive Overview section with KPI metric cards and an italic callout box for leadership takeaways.
3. Render a Workstream Status Table with styled headers, alternating row shading, and right-aligned numbers.
4. Render Numbered Action Items and save the document to workspace output/.""",
        parameters_schema={
            "filename": {"type": "string", "default": "Executive_Report.docx"},
            "document_title": {"type": "string", "default": "Quarterly Operational Review"},
            "subtitle": {"type": "string", "default": "Strategic Milestone & Performance Assessment"},
            "author": {"type": "string", "default": "GenAI Executive Agent"},
            "theme": {"type": "string", "enum": ["corporate_blue", "emerald", "slate", "violet", "amber"], "default": "corporate_blue"},
            "template": {"type": "string", "enum": ["executive_summary", "goal_progress_report", "technical_spec", "project_status"], "default": "executive_summary"},
        },
        output_format="word",
        is_builtin=True,
        tags=["word", "docx", "executive", "report"],
    ),
    SkillDefinition(
        id="word_goal_action_plan",
        name="Word Goal & Milestone Action Plan",
        category="word",
        description="Transforms high-level organizational goals and deliverables into an actionable Word document with milestone roadmaps, risk matrices, and accountability assignments.",
        instructions="""1. Initialize document with Goal Action Plan branding and executive subtitle.
2. Outline key goal objectives, target completion dates, and assigned owners in structured tables.
3. Highlight critical path dependencies and mitigation protocols in a styled callout box.
4. Export the resulting .docx to workspace output/.""",
        parameters_schema={
            "filename": {"type": "string", "default": "Goal_Action_Plan.docx"},
            "document_title": {"type": "string", "default": "Strategic Goal Action Plan"},
            "author": {"type": "string", "default": "Goals Architecture Team"},
            "theme": {"type": "string", "default": "emerald"},
            "template": {"type": "string", "default": "goal_progress_report"},
        },
        output_format="word",
        is_builtin=True,
        tags=["word", "goals", "milestones", "action_plan"],
    ),
    SkillDefinition(
        id="excel_financial_tracker",
        name="Excel Financial & Budget Tracker",
        category="excel",
        description="Creates a financial model spreadsheet with department allocations, actual spend, variance formulas, and spend percentages.",
        instructions="""1. Generate financial line items across departments and expense categories.
2. Calculate variance (Allocated - Actual) and % Spent with Excel formulas.
3. Format figures using currency formatting and conditional shading.
4. Append total summary row using SUM and AVERAGE formulas.""",
        parameters_schema={
            "filename": {"type": "string", "default": "Financial_Budget_Tracker.xlsx"},
            "theme": {"type": "string", "default": "emerald"},
            "template": {"type": "string", "default": "financial_model"},
            "row_count": {"type": "integer", "default": 25},
        },
        output_format="excel",
        is_builtin=True,
        tags=["excel", "finance", "budget", "variance"],
    ),
    SkillDefinition(
        id="data_clean_and_profile",
        name="Dataset Cleaner & Statistical Profiler",
        category="data_analysis",
        description="Inspects an input CSV or Excel dataset, identifies missing values and statistical anomalies, performs cleaning, and outputs an analysis report.",
        instructions="""1. Ingest specified dataset from workspace input/ (CSV or Excel).
2. Compute completeness ratios, detect IQR outliers on numeric columns, and calculate Pearson correlations.
3. Generate LLM-ready Markdown summary profiling distributions and potential data quality hazards.
4. Export profiling results and return structured metadata.""",
        parameters_schema={
            "filename": {"type": "string", "description": "Source filename in input/ or output/"},
            "top_correlations_count": {"type": "integer", "default": 5},
            "generate_markdown_report": {"type": "boolean", "default": True},
        },
        output_format="csv",
        is_builtin=True,
        tags=["data_analysis", "profiling", "clean", "statistics"],
    ),
    SkillDefinition(
        id="custom_instruction_execution",
        name="Instruction-Driven Task Runner",
        category="custom",
        description="Executes arbitrary user or agent instructions, creating or transforming documents, analyzing data, or combining multiple sandbox capabilities.",
        instructions="""1. Parse dynamic instructions and determine target outputs (Excel, Word, or CSV).
2. Synthesize or process inputs adhering strictly to instruction criteria.
3. Emit real-time progress steps for each task phase.
4. Save target output files to workspace output/ and generate download links.""",
        parameters_schema={
            "task_instructions": {"type": "string", "description": "Natural language instructions for the sandbox agent"},
            "target_format": {"type": "string", "enum": ["excel", "word", "csv", "mixed"], "default": "excel"},
            "filename": {"type": "string", "description": "Target output filename"},
        },
        output_format="mixed",
        is_builtin=True,
        tags=["custom", "instructions", "workflow"],
    ),
]


class SkillRegistry:
    """In-memory and persistent registry for built-in and user-defined sandbox skills."""

    _registry: Dict[str, SkillDefinition] = {s.id: s for s in BUILTIN_SKILLS}

    @classmethod
    def list_skills(cls) -> List[SkillDefinition]:
        return list(cls._registry.values())

    @classmethod
    def get_skill(cls, skill_id: str) -> Optional[SkillDefinition]:
        return cls._registry.get(skill_id)

    @classmethod
    def register_skill(cls, skill: SkillDefinition) -> SkillDefinition:
        cls._registry[skill.id] = skill
        return skill

    @classmethod
    def delete_skill(cls, skill_id: str) -> bool:
        if skill_id in cls._registry:
            if cls._registry[skill_id].is_builtin:
                raise ValueError(f"Cannot delete core built-in skill: '{skill_id}'")
            del cls._registry[skill_id]
            return True
        return False


class SkillManager:
    """Executes skills either synchronously or with real-time SSE event streaming."""

    @classmethod
    def run_skill(cls, req: SkillRunRequest) -> SkillRunResponse:
        """Executes a skill synchronously and returns structured results."""
        start_time = time.perf_counter()
        skill = cls._resolve_skill(req)
        params = req.parameters or {}

        result, summary, files = cls._execute_skill_logic(skill, params)
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        return SkillRunResponse(
            success=True,
            skill_id=skill.id,
            summary=summary,
            result=result,
            files_created=files,
            execution_time_ms=round(elapsed_ms, 2),
        )

    @classmethod
    def run_skill_stream(cls, req: SkillRunRequest) -> Generator[str, None, None]:
        """
        Executes a skill with real-time SSE streaming of milestones, instruction interpretation,
        step-by-step progress, file creation, and final payload.
        """
        start_time = time.perf_counter()
        skill = cls._resolve_skill(req)
        params = req.parameters or {}

        yield format_sse("start", {
            "skill_id": skill.id,
            "skill_name": skill.name,
            "category": skill.category,
            "description": skill.description,
            "output_format": skill.output_format,
        })

        yield format_sse("step", {
            "step": 1,
            "total_steps": 4,
            "status": "Interpreting skill instructions and parameter schema...",
            "instructions_excerpt": skill.instructions.split("\n")[0],
        })

        time.sleep(0.05)

        yield format_sse("step", {
            "step": 2,
            "total_steps": 4,
            "status": f"Executing core skill logic for '{skill.name}'...",
            "target_format": skill.output_format,
        })

        try:
            result, summary, files = cls._execute_skill_logic(skill, params, stream_notifier=lambda msg: format_sse("log", {"message": msg}))
            
            yield format_sse("step", {
                "step": 3,
                "total_steps": 4,
                "status": "Writing generated artifacts to workspace output/...",
                "files_detected": len(files),
            })

            for f in files:
                fpath = settings.OUTPUT_DIR / f.replace("output/", "")
                size = fpath.stat().st_size if fpath.exists() else 0
                yield format_sse("file_created", {
                    "filename": fpath.name,
                    "relative_path": f"output/{fpath.name}",
                    "size_bytes": size,
                    "download_url": f"/files/download/output/{fpath.name}",
                })

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            yield format_sse("step", {
                "step": 4,
                "total_steps": 4,
                "status": "Skill execution complete.",
                "duration_ms": round(elapsed_ms, 2),
            })

            yield format_sse("complete", {
                "success": True,
                "skill_id": skill.id,
                "summary": summary,
                "files_created": files,
                "execution_time_ms": round(elapsed_ms, 2),
                "result": result,
            })

        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            yield format_sse("error", {"error": str(e), "skill_id": skill.id})
            yield format_sse("complete", {
                "success": False,
                "skill_id": skill.id,
                "summary": f"Skill execution failed: {str(e)}",
                "files_created": [],
                "execution_time_ms": round(elapsed_ms, 2),
                "result": None,
            })

    @classmethod
    def _resolve_skill(cls, req: SkillRunRequest) -> SkillDefinition:
        if req.skill_definition:
            return req.skill_definition
        if req.skill_id:
            skill = SkillRegistry.get_skill(req.skill_id)
            if skill:
                return skill
            raise ValueError(f"Skill '{req.skill_id}' not found in registry.")
        raise ValueError("Must provide either 'skill_id' or inline 'skill_definition'.")

    @classmethod
    def _execute_skill_logic(
        cls,
        skill: SkillDefinition,
        params: Dict[str, Any],
        stream_notifier: Optional[Any] = None,
    ) -> Tuple[Any, str, List[str]]:
        """Dispatches skill logic to corresponding sandbox tools."""
        skill_id = skill.id

        if skill_id in ("excel_kpi_dashboard", "excel_financial_tracker") or skill.category == "excel":
            filename = params.get("filename", "KPI_Dashboard.xlsx" if skill_id == "excel_kpi_dashboard" else "Financial_Tracker.xlsx")
            theme = params.get("theme", "corporate_blue" if skill_id == "excel_kpi_dashboard" else "emerald")
            template = params.get("template", "kpi_dashboard" if skill_id == "excel_kpi_dashboard" else "financial_model")
            row_count = params.get("row_count", 20)
            doc_title = params.get("document_title", skill.name)

            create_req = CreateExcelRequest(
                filename=filename,
                document_title=doc_title,
                theme=theme,
                template=template,
                template_row_count=row_count,
            )
            res = ExcelTool.create_excel(create_req)
            summary = f"Skill '{skill.name}' successfully generated Excel workbook '{res.filename}' with {len(res.sheets_created)} sheet(s) and {res.total_rows} rows."
            return res.model_dump(), summary, [res.relative_path]

        elif skill_id in ("word_executive_report", "word_goal_action_plan") or skill.category == "word":
            filename = params.get("filename", "Executive_Report.docx" if skill_id == "word_executive_report" else "Goal_Action_Plan.docx")
            doc_title = params.get("document_title", "Quarterly Operational Review" if skill_id == "word_executive_report" else "Strategic Goal Action Plan")
            subtitle = params.get("subtitle", "Strategic Performance & Milestone Assessment")
            author = params.get("author", "GenAI Sandbox Agent")
            theme = params.get("theme", "corporate_blue" if skill_id == "word_executive_report" else "emerald")
            template = params.get("template", "executive_summary" if skill_id == "word_executive_report" else "goal_progress_report")

            create_req = CreateWordRequest(
                filename=filename,
                document_title=doc_title,
                subtitle=subtitle,
                author=author,
                theme=theme,
                template=template,
            )
            res = WordTool.create_word(create_req)
            summary = f"Skill '{skill.name}' created Word document '{res.filename}' ({res.section_count} sections, {res.table_count} tables, ~{res.word_count} words)."
            return res.model_dump(), summary, [res.relative_path]

        elif skill_id == "data_clean_and_profile" or skill.category == "data_analysis":
            source_file = params.get("filename")
            if not source_file:
                # Generate synthetic CSV to profile if none given
                synth = CSVCreator.create_synthetic(CreateSyntheticCsvRequest(
                    filename="profile_sample.csv",
                    template="goals_and_milestones",
                    row_count=35,
                ))
                source_file = synth.filename

            # Check if source is Excel or CSV
            if source_file.lower().endswith((".xlsx", ".xls")):
                res = ExcelTool.analyze_sheet(source_file, generate_markdown=True)
            else:
                from app.schemas import AnalyzeCsvRequest
                res = CSVAnalyser.analyze(AnalyzeCsvRequest(filename=source_file, generate_markdown_report=True))

            summary = f"Skill '{skill.name}' analyzed '{res.source}': {res.row_count} rows, {res.column_count} columns with {len(res.quality_issues)} quality check alerts."
            return res.model_dump(), summary, []

        elif skill_id == "custom_instruction_execution" or skill.category == "custom":
            instructions = params.get("task_instructions") or skill.instructions
            target_format = params.get("target_format", "excel").lower()
            filename = params.get("filename")

            if target_format == "excel":
                fname = filename or "Custom_Generated_Sheet.xlsx"
                res = ExcelTool.create_excel(CreateExcelRequest(
                    filename=fname,
                    document_title="Instruction-Generated Excel Workbook",
                    template="kpi_dashboard",
                    instructions=instructions,
                ))
                summary = f"Custom skill executed: created Excel workbook '{res.filename}' with {len(res.sheets_created)} sheets."
                return res.model_dump(), summary, [res.relative_path]

            elif target_format == "word":
                fname = filename or "Custom_Generated_Report.docx"
                res = WordTool.create_word(CreateWordRequest(
                    filename=fname,
                    document_title="Instruction-Driven Report",
                    template="executive_summary",
                    instructions=instructions,
                ))
                summary = f"Custom skill executed: created Word document '{res.filename}' with {res.section_count} sections."
                return res.model_dump(), summary, [res.relative_path]

            else:
                # Default CSV
                fname = filename or "custom_dataset.csv"
                res = CSVCreator.create_synthetic(CreateSyntheticCsvRequest(
                    filename=fname,
                    template="goals_and_milestones",
                    row_count=30,
                ))
                summary = f"Custom skill executed: generated CSV dataset '{res.filename}'."
                return res.model_dump(), summary, [res.relative_path]

        else:
            raise ValueError(f"No execution handler registered for skill: '{skill_id}'")

