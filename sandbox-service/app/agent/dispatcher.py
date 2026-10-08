from typing import Any, Dict, List

from app.schemas import (
    AgentActionRequest,
    AgentActionResponse,
    AnalyzeCsvRequest,
    CreateCsvFromRecordsRequest,
    CreateSyntheticCsvRequest,
    ExecuteCodeRequest,
    QueryCsvRequest,
)
from app.sandbox.runner import SandboxRunner
from app.tools.csv_analyser import CSVAnalyser
from app.tools.csv_creator import CSVCreator
from app.tools.file_manager import FileManager


class AgentDispatcher:
    """Dispatches tool calls from backend LLM agents to the corresponding sandbox capability."""

    @classmethod
    def dispatch(cls, req: AgentActionRequest) -> AgentActionResponse:
        action = req.action
        params = req.parameters

        if action == "create_csv":
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

