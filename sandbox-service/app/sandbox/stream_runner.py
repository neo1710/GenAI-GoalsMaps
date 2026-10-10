import json
import os
import queue
import subprocess
import sys
import threading
import time
import uuid
from typing import Any, Dict, Generator, List, Optional

from app.config import settings
from app.sandbox.security import CodeSecurityAuditor
from app.schemas import ExecuteCodeRequest


def format_sse(event: str, data: Any) -> str:
    """Formats an SSE message strictly complying with W3C SSE specification."""
    payload = json.dumps(data) if not isinstance(data, str) else json.dumps({"message": data})
    return f"event: {event}\ndata: {payload}\n\n"


class SandboxStreamRunner:
    """
    Executes Python scripts in an isolated subprocess with real-time SSE streaming.
    Streams stdout, stderr, execution milestones, file creation events, and final exit status.
    """

    @classmethod
    def execute_stream(cls, req: ExecuteCodeRequest) -> Generator[str, None, None]:
        settings.ensure_directories()
        start_time = time.perf_counter()

        # Step 1: Security Audit
        if settings.ENABLE_SECURITY_CHECK:
            is_safe, violations = CodeSecurityAuditor.audit(req.code)
            if not is_safe:
                err_msg = f"Security Violation: {'; '.join(violations)}"
                yield format_sse("error", {"error": err_msg, "violations": violations})
                yield format_sse("complete", {
                    "success": False,
                    "exit_code": 1,
                    "execution_time_ms": 0.0,
                    "output_files": [],
                    "download_urls": [],
                    "error_message": err_msg,
                })
                return

        # Step 2: Write input files if specified
        if req.input_files:
            for rel_path, content in req.input_files.items():
                clean_name = os.path.basename(rel_path.strip().replace("\\", "/"))
                target = settings.INPUT_DIR / clean_name
                target.write_text(content, encoding="utf-8")
                yield format_sse("status", {"message": f"Prepared input file: input/{clean_name}"})

        # Step 3: Snapshot existing output files
        before_output_files = {p.name: p.stat().st_mtime_ns for p in settings.OUTPUT_DIR.glob("*") if p.is_file()}

        # Step 4: Write execution script
        run_id = uuid.uuid4().hex[:8]
        script_file = settings.WORKSPACE_DIR / f"_sandbox_run_{run_id}.py"
        script_file.write_text(req.code, encoding="utf-8")

        timeout = req.timeout_seconds or settings.EXECUTION_TIMEOUT_SECONDS
        python_executable = sys.executable

        env = os.environ.copy()
        existing_pythonpath = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = (
            f"{settings.WORKSPACE_DIR}{os.pathsep}{existing_pythonpath}"
            if existing_pythonpath
            else str(settings.WORKSPACE_DIR)
        )
        if req.env_vars:
            env.update(req.env_vars)

        yield format_sse("start", {
            "run_id": run_id,
            "timeout_seconds": timeout,
            "status": "Process started",
            "working_directory": str(settings.WORKSPACE_DIR),
        })

        q: queue.Queue = queue.Queue()

        def stream_reader(pipe, stream_name: str):
            try:
                for line in iter(pipe.readline, ""):
                    if line:
                        q.put((stream_name, line))
                    else:
                        break
            except Exception:
                pass
            finally:
                pipe.close()

        process = None
        exit_code = 0
        timed_out = False
        error_msg = None
        stdout_acc: List[str] = []
        stderr_acc: List[str] = []

        try:
            process = subprocess.Popen(
                [python_executable, str(script_file)],
                cwd=str(settings.WORKSPACE_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # Line buffered
                env=env,
            )

            # Start reader threads
            t_stdout = threading.Thread(target=stream_reader, args=(process.stdout, "stdout"), daemon=True)
            t_stderr = threading.Thread(target=stream_reader, args=(process.stderr, "stderr"), daemon=True)
            t_stdout.start()
            t_stderr.start()

            last_ping_time = time.perf_counter()

            while True:
                # Check for timeout
                current_elapsed = time.perf_counter() - start_time
                if current_elapsed > timeout:
                    timed_out = True
                    process.terminate()
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    break

                try:
                    # Non-blocking pull with small timeout
                    stream_type, line = q.get(timeout=0.15)
                    # Strip trailing newline for cleaner JSON payload
                    clean_line = line.rstrip("\r\n")

                    if stream_type == "stdout":
                        stdout_acc.append(line)
                        yield format_sse("stdout", {"line": clean_line, "timestamp_ms": round((time.perf_counter() - start_time) * 1000, 1)})
                    else:
                        stderr_acc.append(line)
                        yield format_sse("stderr", {"line": clean_line, "timestamp_ms": round((time.perf_counter() - start_time) * 1000, 1)})

                except queue.Empty:
                    # If process finished and threads are dead, break out
                    if process.poll() is not None and not t_stdout.is_alive() and not t_stderr.is_alive():
                        break

                    # Send periodic keep-alive ping comment every 3 seconds of inactivity
                    if time.perf_counter() - last_ping_time > 3.0:
                        yield f": keep-alive {round(time.perf_counter() - start_time, 1)}s\n\n"
                        last_ping_time = time.perf_counter()

            # Flush any remaining items from queue
            while not q.empty():
                try:
                    stream_type, line = q.get_nowait()
                    clean_line = line.rstrip("\r\n")
                    if stream_type == "stdout":
                        stdout_acc.append(line)
                        yield format_sse("stdout", {"line": clean_line})
                    else:
                        stderr_acc.append(line)
                        yield format_sse("stderr", {"line": clean_line})
                except queue.Empty:
                    break

            if timed_out:
                exit_code = 124
                error_msg = f"Execution timed out after {timeout} seconds."
                yield format_sse("error", {"error": error_msg})
            else:
                exit_code = process.returncode if process else 1

        except Exception as e:
            exit_code = 1
            error_msg = f"Process execution failed: {str(e)}"
            yield format_sse("error", {"error": error_msg})

        finally:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            # Clean up temp file
            try:
                if script_file.exists():
                    script_file.unlink()
            except Exception:
                pass

        # Step 5: Check output files
        new_or_modified = sorted([
            p.name
            for p in settings.OUTPUT_DIR.glob("*")
            if p.is_file() and (p.name not in before_output_files or p.stat().st_mtime_ns > before_output_files[p.name])
        ])

        for fname in new_or_modified:
            fpath = settings.OUTPUT_DIR / fname
            yield format_sse("file_created", {
                "filename": fname,
                "relative_path": f"output/{fname}",
                "size_bytes": fpath.stat().st_size,
                "download_url": f"/files/download/output/{fname}",
            })

        yield format_sse("complete", {
            "success": (exit_code == 0),
            "exit_code": exit_code,
            "execution_time_ms": round(elapsed_ms, 2),
            "output_files": [f"output/{f}" for f in new_or_modified],
            "download_urls": [f"/files/download/output/{f}" for f in new_or_modified],
            "error_message": error_msg or ("\n".join(stderr_acc) if exit_code != 0 else None),
        })

