import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import List, Optional, Set

from app.config import settings
from app.sandbox.security import CodeSecurityAuditor, SecurityViolationError
from app.schemas import ExecuteCodeRequest, ExecuteCodeResponse


class SandboxRunner:
    """Executes arbitrary Python code in an isolated subprocess with workspace tracking."""

    MAX_OUTPUT_CHARS = 100_000  # Cap output to prevent DOS

    @classmethod
    def execute(cls, req: ExecuteCodeRequest) -> ExecuteCodeResponse:
        settings.ensure_directories()

        # Step 1: Security Audit
        if settings.ENABLE_SECURITY_CHECK:
            is_safe, violations = CodeSecurityAuditor.audit(req.code)
            if not is_safe:
                return ExecuteCodeResponse(
                    success=False,
                    exit_code=1,
                    stdout="",
                    stderr=f"Security Violation: {'; '.join(violations)}",
                    execution_time_ms=0.0,
                    output_files=[],
                    error_message=f"Code execution rejected: {'; '.join(violations)}",
                )

        # Step 2: Write input files if specified
        if req.input_files:
            for rel_path, content in req.input_files.items():
                clean_name = os.path.basename(rel_path.strip().replace("\\", "/"))
                target = settings.INPUT_DIR / clean_name
                target.write_text(content, encoding="utf-8")

        # Step 3: Snapshot existing output files and timestamps
        before_output_files = {p.name: p.stat().st_mtime_ns for p in settings.OUTPUT_DIR.glob("*") if p.is_file()}

        # Step 4: Write execution script
        run_id = uuid.uuid4().hex[:8]
        script_file = settings.WORKSPACE_DIR / f"_sandbox_run_{run_id}.py"
        script_file.write_text(req.code, encoding="utf-8")

        # Prepare subprocess environment
        timeout = req.timeout_seconds or settings.EXECUTION_TIMEOUT_SECONDS
        python_executable = sys.executable

        env = os.environ.copy()
        # Add workspace to PYTHONPATH so imports from tools work if desired
        existing_pythonpath = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = (
            f"{settings.WORKSPACE_DIR}{os.pathsep}{existing_pythonpath}"
            if existing_pythonpath
            else str(settings.WORKSPACE_DIR)
        )
        if req.env_vars:
            env.update(req.env_vars)

        start_time = time.perf_counter()
        exit_code = 0
        stdout = ""
        stderr = ""
        error_msg = None

        try:
            process = subprocess.run(
                [python_executable, str(script_file)],
                cwd=str(settings.WORKSPACE_DIR),
                capture_output=True,
                text=True,
                timeout=timeout,
                env=env,
                check=False,
            )
            exit_code = process.returncode
            stdout = process.stdout
            stderr = process.stderr
        except subprocess.TimeoutExpired:
            exit_code = 124  # Standard timeout exit code
            stderr = f"Execution timed out after {timeout} seconds."
            error_msg = "Process timed out."
        except Exception as e:
            exit_code = 1
            stderr = f"Failed to execute process: {str(e)}"
            error_msg = str(e)
        finally:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            # Clean up temporary script
            try:
                if script_file.exists():
                    script_file.unlink()
            except Exception:
                pass

        # Step 5: Check newly created or modified files in output/
        new_or_modified = sorted([
            p.name
            for p in settings.OUTPUT_DIR.glob("*")
            if p.is_file() and (p.name not in before_output_files or p.stat().st_mtime_ns > before_output_files[p.name])
        ])

        # Truncate output if necessary
        if len(stdout) > cls.MAX_OUTPUT_CHARS:
            stdout = stdout[: cls.MAX_OUTPUT_CHARS] + "\n... [Output truncated by Sandbox]"
        if len(stderr) > cls.MAX_OUTPUT_CHARS:
            stderr = stderr[: cls.MAX_OUTPUT_CHARS] + "\n... [Stderr truncated by Sandbox]"

        return ExecuteCodeResponse(
            success=(exit_code == 0),
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
            execution_time_ms=round(elapsed_ms, 2),
            output_files=[f"output/{f}" for f in new_or_modified],
            download_urls=[f"/files/download/output/{f}" for f in new_or_modified],
            error_message=error_msg or (stderr if exit_code != 0 else None),
        )
