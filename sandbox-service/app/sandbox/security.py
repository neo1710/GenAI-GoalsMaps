import ast
import re
from typing import List, Tuple


class SecurityViolationError(Exception):
    """Raised when code violates sandbox security policies."""
    pass


class CodeSecurityAuditor:
    """Static auditor to detect dangerous calls, fork bombs, or destructive commands."""

    # Disallowed module imports or calls that could compromise host or escape sandbox
    BLOCKED_PATTERNS = [
        (r"\bimport\s+pty\b", "PTY spawning is forbidden in sandbox."),
        (r"\bos\.system\s*\(", "os.system is disabled; use standard Python libraries."),
        (r"\bsubprocess\b", "Nested subprocess invocation is disabled inside the sandbox."),
        (r"\bshutil\.rmtree\s*\(\s*['\"]\/", "Destructive root filesystem modification is prohibited."),
        (r":\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;", "Fork bombs are strictly prohibited."),
    ]

    @classmethod
    def audit(cls, code: str) -> Tuple[bool, List[str]]:
        """
        Audits Python code string.
        Returns (is_safe, list_of_violations).
        """
        violations: List[str] = []

        # Check regex patterns
        for pattern, msg in cls.BLOCKED_PATTERNS:
            if re.search(pattern, code, re.IGNORECASE):
                violations.append(msg)

        # Check AST parse
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                # Detect nested subprocess imports
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        if alias.name in ("subprocess", "pty"):
                            violations.append(f"Importing '{alias.name}' is restricted.")
                elif isinstance(node, ast.ImportFrom):
                    if node.module in ("subprocess", "pty"):
                        violations.append(f"Importing from '{node.module}' is restricted.")
        except SyntaxError as e:
            # Syntax errors will be naturally caught by the Python interpreter when run
            pass

        return len(violations) == 0, violations

