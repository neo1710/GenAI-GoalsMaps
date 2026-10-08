import unittest
from fastapi.testclient import TestClient

from app.main import app


class TestSandboxAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_check(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("workspace", data)

    def test_csv_create_and_analyze_flow(self):
        # 1. Create CSV
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

        # 2. Analyze CSV
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

    def test_agent_unified_dispatcher(self):
        agent_payload = {
            "action": "create_synthetic_csv",
            "parameters": {
                "filename": "agent_sales.csv",
                "template": "sales_performance",
                "row_count": 10,
            },
        }
        resp = self.client.post("/agent/run", json=agent_payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["action"], "create_synthetic_csv")
        self.assertIn("agent_sales.csv", data["summary"])

    def test_download_and_raw_file_access(self):
        # 1. Verify download endpoint
        dl_resp = self.client.get("/files/download/output/api_test_goals.csv")
        self.assertEqual(dl_resp.status_code, 200)
        self.assertIn("text/csv", dl_resp.headers.get("content-type", ""))
        self.assertIn("Build Agent", dl_resp.text)

        # 2. Verify raw text endpoint
        raw_resp = self.client.get("/files/raw/output/api_test_goals.csv")
        self.assertEqual(raw_resp.status_code, 200)
        self.assertIn("Create Sandbox", raw_resp.text)


if __name__ == "__main__":
    unittest.main()

