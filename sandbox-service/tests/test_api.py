import gc
import unittest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


class TestSandboxAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        gc.collect()

    def test_health_check(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("workspace", data)
        self.assertIn("skills_instruction_engine", data["capabilities"])

    def test_csv_create_and_analyze_flow(self):
        create_payload = {
            "filename": "api_test_goals.csv",
            "data": [
                {"goal": "Build Agent", "points": 8, "status": "Done"},
                {"goal": "Create Sandbox", "points": 13, "status": "Done"},
                {"goal": "Write Docs", "points": 5, "status": "In Progress"},
            ],
            "delimiter": ",",
            "include_header": True,
        }
        res_create = self.client.post("/csv/create", json=create_payload)
        self.assertEqual(res_create.status_code, 200)
        create_data = res_create.json()
        self.assertTrue(create_data["success"])
        self.assertEqual(create_data["row_count"], 3)

        analyze_payload = {
            "filename": "api_test_goals.csv",
            "generate_markdown_report": True,
        }
        res_analyze = self.client.post("/csv/analyze", json=analyze_payload)
        self.assertEqual(res_analyze.status_code, 200)
        analyze_data = res_analyze.json()
        self.assertTrue(analyze_data["success"])
        self.assertEqual(analyze_data["row_count"], 3)
        self.assertIsNotNone(analyze_data["markdown_report"])

    def test_excel_api_endpoints(self):
        # 1. Create Excel
        create_payload = {
            "filename": "api_test_excel.xlsx",
            "document_title": "Executive KPI Scorecard",
            "template": "kpi_dashboard",
            "template_row_count": 12,
            "theme": "emerald",
        }
        res_create = self.client.post("/excel/create", json=create_payload)
        self.assertEqual(res_create.status_code, 200)
        data = res_create.json()
        self.assertTrue(data["success"])
        self.assertIn("Goals_and_KPIs", data["sheets_created"])

        # 2. Inspect Excel
        res_inspect = self.client.post("/excel/inspect", json={"filename": "api_test_excel.xlsx", "folder": "output"})
        self.assertEqual(res_inspect.status_code, 200)
        inspect_data = res_inspect.json()
        self.assertTrue(inspect_data["success"])
        self.assertEqual(inspect_data["sheet_count"], 1)

        # 3. Analyze Excel
        res_analyze = self.client.post("/excel/analyze", json={"filename": "api_test_excel.xlsx", "folder": "output"})
        self.assertEqual(res_analyze.status_code, 200)
        self.assertTrue(res_analyze.json()["success"])

        # 4. Download Excel with proper MIME type
        res_dl = self.client.get("/files/download/output/api_test_excel.xlsx")
        self.assertEqual(res_dl.status_code, 200)
        self.assertIn("spreadsheetml.sheet", res_dl.headers.get("content-type", ""))

    def test_word_api_endpoints(self):
        # 1. Create Word doc
        create_payload = {
            "filename": "api_test_word.docx",
            "document_title": "Quarterly Performance Brief",
            "subtitle": "Engineering & Product Operations",
            "template": "executive_summary",
            "theme": "corporate_blue",
        }
        res_create = self.client.post("/word/create", json=create_payload)
        self.assertEqual(res_create.status_code, 200)
        data = res_create.json()
        self.assertTrue(data["success"])
        self.assertGreater(data["word_count"], 40)

        # 2. Inspect Word doc
        res_inspect = self.client.post("/word/inspect", json={"filename": "api_test_word.docx", "folder": "output"})
        self.assertEqual(res_inspect.status_code, 200)
        self.assertTrue(res_inspect.json()["success"])

        # 3. Read Word as Markdown
        res_read = self.client.post("/word/read", json={"filename": "api_test_word.docx", "folder": "output"})
        self.assertEqual(res_read.status_code, 200)
        self.assertIn("# Quarterly Performance Brief", res_read.text)

        # 4. Extract Tables
        res_tables = self.client.post("/word/extract-tables", json={"filename": "api_test_word.docx", "folder": "output"})
        self.assertEqual(res_tables.status_code, 200)
        self.assertTrue(res_tables.json()["success"])

        # 5. Download Word with proper MIME type
        res_dl = self.client.get("/files/download/output/api_test_word.docx")
        self.assertEqual(res_dl.status_code, 200)
        self.assertIn("wordprocessingml.document", res_dl.headers.get("content-type", ""))

    def test_skills_engine_api(self):
        # 1. List skills
        res_list = self.client.get("/skills")
        self.assertEqual(res_list.status_code, 200)
        skills = res_list.json()["skills"]
        self.assertGreaterEqual(len(skills), 5)

        # 2. Get specific skill
        res_get = self.client.get("/skills/excel_kpi_dashboard")
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.json()["id"], "excel_kpi_dashboard")

        # 3. Run skill sync
        run_payload = {
            "skill_id": "word_goal_action_plan",
            "parameters": {
                "filename": "api_skill_action_plan.docx",
                "document_title": "Product Roadmap 2026",
            },
        }
        res_run = self.client.post("/skills/run", json=run_payload)
        self.assertEqual(res_run.status_code, 200)
        self.assertTrue(res_run.json()["success"])

    def test_streaming_endpoints(self):
        # 1. Streaming Python execution
        exec_payload = {
            "code": "print('Hello from streaming API!')\nwith open('output/stream_api.txt', 'w') as f: f.write('OK')",
            "timeout_seconds": 10,
        }
        with self.client.stream("POST", "/execute/stream", json=exec_payload) as stream_resp:
            self.assertEqual(stream_resp.status_code, 200)
            self.assertIn("text/event-stream", stream_resp.headers.get("content-type", ""))
            chunks = list(stream_resp.iter_lines())
            joined = "\n".join(chunks)
            self.assertIn("event: start", joined)
            self.assertIn("event: stdout", joined)
            self.assertIn("event: complete", joined)

        # 2. Streaming Agent run
        agent_payload = {
            "action": "create_excel",
            "parameters": {
                "filename": "api_agent_stream.xlsx",
                "template": "financial_model",
                "row_count": 10,
            },
            "stream": True,
        }
        with self.client.stream("POST", "/agent/run/stream", json=agent_payload) as stream_resp:
            self.assertEqual(stream_resp.status_code, 200)
            chunks = list(stream_resp.iter_lines())
            joined = "\n".join(chunks)
            self.assertIn("event: start", joined)
            self.assertIn("event: file_created", joined)
            self.assertIn("event: complete", joined)

        # 3. Streaming Skills run
        skill_payload = {
            "skill_id": "excel_financial_tracker",
            "parameters": {"filename": "api_skill_stream.xlsx", "row_count": 5},
            "stream": True,
        }
        with self.client.stream("POST", "/skills/run/stream", json=skill_payload) as stream_resp:
            self.assertEqual(stream_resp.status_code, 200)
            chunks = list(stream_resp.iter_lines())
            joined = "\n".join(chunks)
            self.assertIn("event: start", joined)
            self.assertIn("event: step", joined)
            self.assertIn("event: complete", joined)


if __name__ == "__main__":
    unittest.main()
