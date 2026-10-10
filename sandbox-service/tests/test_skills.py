import unittest
from pathlib import Path

from app.config import settings
from app.schemas import SkillDefinition, SkillRunRequest
from app.skills.manager import SkillManager, SkillRegistry


class TestSkillsEngine(unittest.TestCase):

    def setUp(self):
        settings.ensure_directories()

    def test_list_skills(self):
        skills = SkillRegistry.list_skills()
        self.assertGreaterEqual(len(skills), 5)
        skill_ids = [s.id for s in skills]
        self.assertIn("excel_kpi_dashboard", skill_ids)
        self.assertIn("word_executive_report", skill_ids)
        self.assertIn("word_goal_action_plan", skill_ids)
        self.assertIn("excel_financial_tracker", skill_ids)

    def test_register_and_delete_custom_skill(self):
        custom = SkillDefinition(
            id="custom_test_skill",
            name="Custom Test Skill",
            category="custom",
            description="A test skill for automated testing.",
            instructions="Execute test steps.",
            parameters_schema={"test_param": {"type": "string"}},
            output_format="json",
        )
        registered = SkillRegistry.register_skill(custom)
        self.assertEqual(registered.id, "custom_test_skill")

        retrieved = SkillRegistry.get_skill("custom_test_skill")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.name, "Custom Test Skill")

        deleted = SkillRegistry.delete_skill("custom_test_skill")
        self.assertTrue(deleted)
        self.assertIsNone(SkillRegistry.get_skill("custom_test_skill"))

    def test_run_excel_skill_sync(self):
        req = SkillRunRequest(
            skill_id="excel_kpi_dashboard",
            parameters={
                "filename": "test_skill_kpi.xlsx",
                "row_count": 10,
                "theme": "slate",
            },
        )
        res = SkillManager.run_skill(req)
        self.assertTrue(res.success)
        self.assertIn("test_skill_kpi.xlsx", res.summary)
        self.assertTrue((settings.OUTPUT_DIR / "test_skill_kpi.xlsx").exists())
        (settings.OUTPUT_DIR / "test_skill_kpi.xlsx").unlink()

    def test_run_word_skill_sync(self):
        req = SkillRunRequest(
            skill_id="word_executive_report",
            parameters={
                "filename": "test_skill_exec.docx",
                "document_title": "Automated Skill Test Report",
            },
        )
        res = SkillManager.run_skill(req)
        self.assertTrue(res.success)
        self.assertIn("test_skill_exec.docx", res.summary)
        self.assertTrue((settings.OUTPUT_DIR / "test_skill_exec.docx").exists())
        (settings.OUTPUT_DIR / "test_skill_exec.docx").unlink()

    def test_run_skill_stream(self):
        req = SkillRunRequest(
            skill_id="excel_financial_tracker",
            parameters={"filename": "test_stream_tracker.xlsx", "row_count": 5},
        )
        events = list(SkillManager.run_skill_stream(req))
        self.assertGreater(len(events), 3)

        # Check event types emitted
        event_types = [e.split("\n")[0] for e in events if e.startswith("event: ")]
        self.assertIn("event: start", event_types)
        self.assertIn("event: step", event_types)
        self.assertIn("event: complete", event_types)

        out_file = settings.OUTPUT_DIR / "test_stream_tracker.xlsx"
        if out_file.exists():
            out_file.unlink()


if __name__ == "__main__":
    unittest.main()

