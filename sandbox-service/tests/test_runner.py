import unittest
from pathlib import Path

from app.config import settings
from app.sandbox.runner import SandboxRunner
from app.schemas import ExecuteCodeRequest


class TestSandboxRunner(unittest.TestCase):
    def setUp(self):
        settings.ensure_directories()
        out_file = settings.OUTPUT_DIR / "runner_generated.txt"
        if out_file.exists():
            out_file.unlink()

    def test_successful_python_execution(self):
        code = """
import sys
x = 10
y = 25
print(f"SUM={x + y}")
"""
        req = ExecuteCodeRequest(code=code, timeout_seconds=5)
        res = SandboxRunner.execute(req)

        self.assertTrue(res.success)
        self.assertEqual(res.exit_code, 0)
        self.assertIn("SUM=35", res.stdout)
        self.assertGreater(res.execution_time_ms, 0)

    def test_file_generation_in_sandbox(self):
        code = """
with open("output/runner_generated.txt", "w") as f:
    f.write("Hello from isolated sandbox execution!")
"""
        req = ExecuteCodeRequest(code=code, timeout_seconds=5)
        res = SandboxRunner.execute(req)

        self.assertTrue(res.success)
        self.assertIn("output/runner_generated.txt", res.output_files)

        target = settings.OUTPUT_DIR / "runner_generated.txt"
        self.assertTrue(target.exists())
        self.assertEqual(target.read_text().strip(), "Hello from isolated sandbox execution!")

    def test_security_violation_blocked(self):
        code = """
import os
os.system("echo hacked")
"""
        req = ExecuteCodeRequest(code=code, timeout_seconds=5)
        res = SandboxRunner.execute(req)

        self.assertFalse(res.success)
        self.assertIn("Security Violation", res.stderr)

    def test_timeout_handling(self):
        code = """
import time
time.sleep(5)
"""
        req = ExecuteCodeRequest(code=code, timeout_seconds=1)
        res = SandboxRunner.execute(req)

        self.assertFalse(res.success)
        self.assertEqual(res.exit_code, 124)
        self.assertIn("timed out", res.stderr)


if __name__ == "__main__":
    unittest.main()
