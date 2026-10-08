import os
from pathlib import Path


class Settings:
    PROJECT_NAME: str = "Sandbox Agent Service"
    VERSION: str = "1.0.0"

    # Base workspace directory (Docker uses /workspace, local fallback uses ./workspace)
    _default_workspace = (
        Path("/workspace")
        if os.path.exists("/workspace")
        else Path(__file__).resolve().parent.parent / "workspace"
    )

    WORKSPACE_DIR: Path = Path(os.getenv("SANDBOX_WORKSPACE_DIR", str(_default_workspace))).resolve()
    INPUT_DIR: Path = WORKSPACE_DIR / "input"
    OUTPUT_DIR: Path = WORKSPACE_DIR / "output"

    # Execution limits
    EXECUTION_TIMEOUT_SECONDS: int = int(os.getenv("SANDBOX_EXECUTION_TIMEOUT", "30"))
    MAX_FILE_SIZE_MB: int = int(os.getenv("SANDBOX_MAX_FILE_SIZE_MB", "50"))
    MAX_CSV_PREVIEW_ROWS: int = int(os.getenv("SANDBOX_MAX_PREVIEW_ROWS", "20"))

    # Service port
    PORT: int = int(os.getenv("PORT", "8001"))
    HOST: str = os.getenv("HOST", "0.0.0.0")

    # Security settings
    ENABLE_SECURITY_CHECK: bool = os.getenv("ENABLE_SECURITY_CHECK", "true").lower() in ("true", "1", "yes")

    def ensure_directories(self) -> None:
        """Ensure input and output directories exist."""
        self.WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
        self.INPUT_DIR.mkdir(parents=True, exist_ok=True)
        self.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()

