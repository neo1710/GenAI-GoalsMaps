import json
import time
from typing import Any, Dict, Generator, List

from app.config import settings
from app.sandbox.runner import SandboxRunner
from app.sandbox.stream_runner import SandboxStreamRunner, format_sse
from app.schemas import (
    AgentActionRequest,
    AgentActionResponse,
    AnalyzeCsvRequest,
    CreateCsvFromRecordsRequest,
    CreateExcelRequest,
    CreateSyntheticCsvRequest,
    CreateWordRequest,
    ExecuteCodeRequest,
    QueryCsvRequest,
    SkillRunRequest,
)
from app.skills.manager import SkillManager
from app.tools.csv_analyser import CSVAnalyser
from app.tools.csv_creator import CSVCreator
from app.tools.excel_tool import ExcelTool
from app.tools.file_manager import FileManager
from app.tools.word_tool import WordTool


class AgentDispatcher:
    """
    Dispatches tool calls from backend LLM agents to sandbox capabilities.
    Supports both synchronous execution and real-time Server-Sent Events (SSE) streaming.
    """

    @classmethod
    def dispatch(cls, req: AgentActionRequest) -> AgentActionResponse:
        """Synchronously dispatches the action and returns structured response."""
        action = req.action
        params = req.parameters or {}

        # 1. Excel Tools
        if action == "create_excel":
            excel_req = CreateExcelRequest(**params)
            res = ExcelTool.create_excel(excel_req)
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=res.message,
                result=res.model_dump(),
                files_created=[res.relative_path],
            )

        elif action == "inspect_excel":
            filename = params.get("filename")
            if not filename:
                raise ValueError("Missing 'filename' parameter for inspect_excel.")
            folder = params.get("folder", "input")
            res = ExcelTool.inspect_file(filename, folder=folder)
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=f"Inspected Excel file '{res.filename}': {res.sheet_count} sheet(s) ({', '.join(res.sheet_names)}).",
                result=res.model_dump(),
                files_created=[],
            )

        elif action == "analyze_excel":
            filename = params.get("filename")
            if not filename:
                raise ValueError("Missing 'filename' parameter for analyze_excel.")
            sheet_name = params.get("sheet_name")
            folder = params.get("folder")
            res = ExcelTool.analyze_sheet(filename, sheet_name=sheet_name, folder=folder)
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=f"Analyzed Excel '{res.source}': {res.row_count} rows, {res.column_count} columns.",
                result=res.model_dump(),
                files_created=[],
            )

        # 2. Word Tools
        elif action == "create_word":
            word_req = CreateWordRequest(**params)
            res = WordTool.create_word(word_req)
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=res.message,
                result=res.model_dump(),
                files_created=[res.relative_path],
            )

        elif action == "inspect_word":
            filename = params.get("filename")
            if not filename:
                raise ValueError("Missing 'filename' parameter for inspect_word.")
            folder = params.get("folder")
            res = WordTool.inspect_file(filename, folder=folder)
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=f"Inspected Word doc '{res.filename}': {res.section_count if hasattr(res, 'section_count') else len(res.headings)} headings, {res.table_count} tables, ~{res.word_count} words.",
                result=res.model_dump(),
                files_created=[],
            )

        elif action == "read_word":
            filename = params.get("filename")
            if not filename:
                raise ValueError("Missing 'filename' parameter for read_word.")
            folder = params.get("folder")
            content = WordTool.read_text(filename, folder=folder)
            return AgentActionResponse(
                success=True,
                action=action,
                summary=f"Read Word doc '{filename}' (~{len(content.split())} words).",
                result={"filename": filename, "markdown_content": content},
                files_created=[],
            )

        elif action == "extract_word_tables":
            filename = params.get("filename")
            if not filename:
                raise ValueError("Missing 'filename' parameter for extract_word_tables.")
            folder = params.get("folder")
            tables = WordTool.extract_tables(filename, folder=folder)
            return AgentActionResponse(
                success=True,
                action=action,
                summary=f"Extracted {len(tables)} table(s) from '{filename}'.",
                result={"filename": filename, "tables": tables},
                files_created=[],
            )

        # 3. Skills Execution
        elif action == "execute_skill":
            skill_req = SkillRunRequest(
                skill_id=req.skill_id or params.get("skill_id"),
                skill_definition=req.skill_definition,
                parameters=params.get("parameters", params),
            )
            res = SkillManager.run_skill(skill_req)
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=res.summary,
                result=res.result,
                files_created=res.files_created,
            )

        # 4. Existing Tools
        elif action == "create_csv":
            create_req = CreateCsvFromRecordsRequest(**params)
            res = CSVCreator.from_records(create_req)
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=f"Created CSV file '{res.filename}' with {res.row_count} rows and columns: {', '.join(res.columns)}.",
                result=res.model_dump(),
                files_created=[res.relative_path],
            )

        elif action == "create_synthetic_csv":
            synth_req = CreateSyntheticCsvRequest(**params)
            res = CSVCreator.create_synthetic(synth_req)
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=f"Generated synthetic CSV '{res.filename}' ({res.row_count} rows, {res.column_count} columns) using template '{synth_req.template or 'custom'}'.",
                result=res.model_dump(),
                files_created=[res.relative_path],
            )

        elif action == "analyze_csv":
            analyze_req = AnalyzeCsvRequest(**params)
            res = CSVAnalyser.analyze(analyze_req)
            summary_parts = [
                f"Analyzed '{res.source}': {res.row_count} rows, {res.column_count} columns.",
                f"Found {len(res.quality_issues)} quality issue(s) / alert(s).",
            ]
            if res.correlations:
                summary_parts.append(
                    f"Top correlation: {res.correlations[0].column_x} & {res.correlations[0].column_y} (r={res.correlations[0].correlation:.2f})."
                )
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=" ".join(summary_parts),
                result=res.model_dump(),
                files_created=[],
            )

        elif action == "query_csv":
            query_req = QueryCsvRequest(**params)
            res = CSVAnalyser.query(query_req)
            files = [res.saved_file] if res.saved_file else []
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=f"Query matched {res.total_matching_rows} rows (returned {res.returned_rows_count})."
                + (f" Saved to '{res.saved_file}'." if res.saved_file else ""),
                result=res.model_dump(),
                files_created=files,
            )

        elif action == "execute_python":
            exec_req = ExecuteCodeRequest(**params)
            res = SandboxRunner.execute(exec_req)
            status_text = "succeeded" if res.success else f"failed with exit code {res.exit_code}"
            return AgentActionResponse(
                success=res.success,
                action=action,
                summary=f"Python execution {status_text} in {res.execution_time_ms:.1f}ms."
                + (f" Produced files: {', '.join(res.output_files)}" if res.output_files else ""),
                result=res.model_dump(),
                files_created=res.output_files,
            )

        elif action == "list_files":
            res = FileManager.list_files()
            return AgentActionResponse(
                success=True,
                action=action,
                summary=f"Workspace has {len(res.input_files)} input file(s) and {len(res.output_files)} output file(s).",
                result=res.model_dump(),
                files_created=[],
            )

        else:
            raise ValueError(f"Unknown agent action: '{action}'")

    @classmethod
    def dispatch_stream(cls, req: AgentActionRequest) -> Generator[str, None, None]:
        """
        Streams agent execution events live as Server-Sent Events (SSE).
        Allows callers to follow the process in real time without timeouts.
        """
        action = req.action
        start_time = time.perf_counter()

        yield format_sse("start", {
            "action": action,
            "status": f"Agent dispatched action '{action}'",
            "parameters": req.parameters,
        })

        # Delegate code execution to SandboxStreamRunner
        if action == "execute_python":
            exec_req = ExecuteCodeRequest(**(req.parameters or {}))
            yield from SandboxStreamRunner.execute_stream(exec_req)
            return

        # Delegate skill execution to SkillManager
        if action == "execute_skill":
            skill_req = SkillRunRequest(
                skill_id=req.skill_id or req.parameters.get("skill_id"),
                skill_definition=req.skill_definition,
                parameters=req.parameters.get("parameters", req.parameters),
            )
            yield from SkillManager.run_skill_stream(skill_req)
            return

        # For Office and Data actions, emit progressive execution events
        try:
            yield format_sse("status", {
                "step": 1,
                "message": f"Processing '{action}' request parameters...",
            })

            # Small yield pause for live feel
            time.sleep(0.05)

            yield format_sse("status", {
                "step": 2,
                "message": f"Running tool logic for '{action}'...",
            })

            # Execute tool logic
            sync_res = cls.dispatch(req)

            # Check created files
            if sync_res.files_created:
                for f in sync_res.files_created:
                    fname = f.replace("output/", "")
                    fpath = settings.OUTPUT_DIR / fname
                    size = fpath.stat().st_size if fpath.exists() else 0
                    yield format_sse("file_created", {
                        "filename": fname,
                        "relative_path": f"output/{fname}",
                        "size_bytes": size,
                        "download_url": f"/files/download/output/{fname}",
                    })

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            yield format_sse("complete", {
                "success": sync_res.success,
                "action": action,
                "summary": sync_res.summary,
                "files_created": sync_res.files_created,
                "execution_time_ms": round(elapsed_ms, 2),
                "result": sync_res.result,
            })

        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            yield format_sse("error", {"error": str(e), "action": action})
            yield format_sse("complete", {
                "success": False,
                "action": action,
                "summary": f"Action '{action}' failed: {str(e)}",
                "files_created": [],
                "execution_time_ms": round(elapsed_ms, 2),
                "result": None,
            })
