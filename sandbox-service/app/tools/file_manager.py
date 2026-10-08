import datetime
import os
from pathlib import Path
from typing import List, Literal, Optional, Tuple

from app.config import settings
from app.schemas import FileItem, FileListResponse


class FileManager:
    """Safely manages input and output files inside the sandbox workspace."""

    @staticmethod
    def _is_safe_path(base_dir: Path, target_path: Path) -> bool:
        """Prevent path traversal vulnerabilities."""
        try:
            resolved_target = target_path.resolve()
            resolved_base = base_dir.resolve()
            return str(resolved_target).startswith(str(resolved_base))
        except Exception:
            return False

    @classmethod
    def resolve_path(cls, filename: str, folder: Optional[Literal["input", "output"]] = None) -> Path:
        """
        Locates a file within workspace input or output folders.
        If folder is not specified, searches input first, then output.
        """
        cleaned_name = os.path.basename(filename.strip().replace("\\", "/"))

        if folder == "input":
            candidate = settings.INPUT_DIR / cleaned_name
            if not cls._is_safe_path(settings.INPUT_DIR, candidate):
                raise ValueError(f"Path traversal detected for filename: {filename}")
            return candidate

        if folder == "output":
            candidate = settings.OUTPUT_DIR / cleaned_name
            if not cls._is_safe_path(settings.OUTPUT_DIR, candidate):
                raise ValueError(f"Path traversal detected for filename: {filename}")
            return candidate

        # If not specified, look in input then output
        input_candidate = settings.INPUT_DIR / cleaned_name
        output_candidate = settings.OUTPUT_DIR / cleaned_name

        if input_candidate.exists():
            return input_candidate
        if output_candidate.exists():
            return output_candidate

        # Default fallback to input dir
        return input_candidate

    @classmethod
    def get_output_path(cls, filename: str) -> Path:
        """Return target path in output directory, ensuring safety."""
        cleaned_name = os.path.basename(filename.strip().replace("\\", "/"))
        target = settings.OUTPUT_DIR / cleaned_name
        if not cls._is_safe_path(settings.OUTPUT_DIR, target):
            raise ValueError(f"Path traversal detected for filename: {filename}")
        return target

    @classmethod
    def get_input_path(cls, filename: str) -> Path:
        """Return target path in input directory, ensuring safety."""
        cleaned_name = os.path.basename(filename.strip().replace("\\", "/"))
        target = settings.INPUT_DIR / cleaned_name
        if not cls._is_safe_path(settings.INPUT_DIR, target):
            raise ValueError(f"Path traversal detected for filename: {filename}")
        return target

    @classmethod
    def write_file(cls, filename: str, content: str, folder: Literal["input", "output"] = "output") -> Path:
        """Write text content to a file in input or output."""
        target_path = cls.get_input_path(filename) if folder == "input" else cls.get_output_path(filename)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(content, encoding="utf-8")
        return target_path

    @classmethod
    def read_file(cls, filename: str, folder: Optional[Literal["input", "output"]] = None) -> str:
        """Read text content from a file."""
        target_path = cls.resolve_path(filename, folder=folder)
        if not target_path.exists():
            raise FileNotFoundError(f"File not found: {filename}")
        return target_path.read_text(encoding="utf-8")

    @classmethod
    def list_files(cls) -> FileListResponse:
        """List all files in both input and output directories."""
        settings.ensure_directories()
        input_items: List[FileItem] = []
        output_items: List[FileItem] = []

        for p in settings.INPUT_DIR.glob("*"):
            if p.is_file():
                stat = p.stat()
                input_items.append(
                    FileItem(
                        name=p.name,
                        folder="input",
                        relative_path=f"input/{p.name}",
                        size_bytes=stat.st_size,
                        last_modified=datetime.datetime.fromtimestamp(
                            stat.st_mtime, tz=datetime.timezone.utc
                        ).isoformat(),
                    )
                )

        for p in settings.OUTPUT_DIR.glob("*"):
            if p.is_file():
                stat = p.stat()
                output_items.append(
                    FileItem(
                        name=p.name,
                        folder="output",
                        relative_path=f"output/{p.name}",
                        size_bytes=stat.st_size,
                        last_modified=datetime.datetime.fromtimestamp(
                            stat.st_mtime, tz=datetime.timezone.utc
                        ).isoformat(),
                    )
                )

        return FileListResponse(
            input_files=input_items,
            output_files=output_items,
            total_count=len(input_items) + len(output_items),
        )

