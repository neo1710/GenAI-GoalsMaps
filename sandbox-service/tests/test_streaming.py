import json
import unittest
from pathlib import Path

from app.agent.dispatcher import AgentDispatcher
from app.config import settings
from app.sandbox.stream_runner import SandboxStreamRunner
from app.schemas import AgentActionRequest, ExecuteCodeRequest


class TestStreamingExecution(unittest.TestCase):

    def setUp(self):
        settings.ensure_directories()

    def test_sandbox_stream_runner_python(self):
        code = """
import time
print("Step 1: Initializing process")
print("Step 2: Processing data")
with open("output/stream_test_output.txt", "w") as f:
    f.write("Generated from streaming run")
print("Step 3: Done")
"""
        req = ExecuteCodeRequest(code=code, timeout_seconds=10)
        events = list(SandboxStreamRunner.execute_stream(req))

        self.assertGreater(len(events), 3)

        # Parse event types
        event_types = [e.split("\n")[0] for e in events if e.startswith("event: ")]
        self.assertIn("event: start", event_types)
        self.assertIn("event: stdout", event_types)
        self.assertIn("event: file_created", event_types)
        self.assertIn("event: complete", event_types)

        out_file = settings.OUTPUT_DIR / "stream_test_output.txt"
        self.assertTrue(out_file.exists())
        out_file.unlink()

    def test_agent_dispatcher_stream_excel(self):
        req = AgentActionRequest(
            action="create_excel",
            parameters={
                "filename": "test_stream_agent_excel.xlsx",
                "template": "project_tracker",
                "template_row_count": 8,
            },
            stream=True,
        )
        events = list(AgentDispatcher.dispatch_stream(req))
        event_types = [e.split("\n")[0] for e in events if e.startswith("event: ")]

        self.assertIn("event: start", event_types)
        self.assertIn("event: status", event_types)
        self.assertIn("event: file_created", event_types)
        self.assertIn("event: complete", event_types)

        out_file = settings.OUTPUT_DIR / "test_stream_agent_excel.xlsx"
        self.assertTrue(out_file.exists())
        out_file.unlink()

    def test_streaming_security_violation(self):
        bad_code = "import os\nos.system('dir')"
        req = ExecuteCodeRequest(code=bad_code)
        events = list(SandboxStreamRunner.execute_stream(req))

        event_types = [e.split("\n")[0] for e in events if e.startswith("event: ")]
        self.assertIn("event: error", event_types)
        self.assertIn("event: complete", event_types)


if __name__ == "__main__":
    unittest.main()

