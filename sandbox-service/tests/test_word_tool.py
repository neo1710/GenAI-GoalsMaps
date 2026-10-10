import gc
import unittest
from pathlib import Path

from app.config import settings
from app.schemas import CreateWordRequest, WordKpiCard, WordSectionSpec, WordTableSpec
from app.tools.word_tool import WordTool


class TestWordTool(unittest.TestCase):

    def setUp(self):
        settings.ensure_directories()
        self.test_filename = "test_executive_report.docx"

    def tearDown(self):
        gc.collect()
        test_file = settings.OUTPUT_DIR / self.test_filename
        if test_file.exists():
            try:
                test_file.unlink()
            except Exception:
                pass

    def test_create_word_from_template(self):
        req = CreateWordRequest(
            filename=self.test_filename,
            document_title="Quarterly Review 2026",
            subtitle="Executive Performance Briefing",
            author="GenAI Strategy Core",
            template="executive_summary",
            theme="corporate_blue",
        )
        res = WordTool.create_word(req)

        self.assertTrue(res.success)
        self.assertEqual(res.filename, self.test_filename)
        self.assertGreater(res.word_count, 50)
        self.assertGreaterEqual(res.section_count, 3)
        self.assertTrue((settings.OUTPUT_DIR / self.test_filename).exists())

    def test_create_word_custom_sections(self):
        sections = [
            WordSectionSpec(
                heading="Overview & Mission",
                level=1,
                paragraphs=["This document records critical milestone deliveries."],
                callout="All deliverables must complete by end of Q4.",
                kpis=[
                    WordKpiCard(metric="Sprint Health", value="98%", subtitle="Zero blockers"),
                    WordKpiCard(metric="Velocity", value="52 pts"),
                ],
            ),
            WordSectionSpec(
                heading="Detailed Deliverables",
                level=2,
                table=WordTableSpec(
                    headers=["Item", "Owner", "Status"],
                    rows=[
                        ["Task A", "Alice", "Done"],
                        ["Task B", "Bob", "In Progress"],
                    ],
                ),
            ),
        ]
        req = CreateWordRequest(
            filename=self.test_filename,
            document_title="Custom Strategy Doc",
            sections=sections,
            theme="emerald",
        )
        res = WordTool.create_word(req)

        self.assertTrue(res.success)
        self.assertEqual(res.section_count, 2)
        self.assertEqual(res.table_count, 2)  # 1 for KPI cards + 1 for data table

        # Inspect generated Word doc
        inspect_res = WordTool.inspect_file(self.test_filename, folder="output")
        self.assertTrue(inspect_res.success)
        self.assertIn("Overview & Mission", [h["text"] for h in inspect_res.headings])
        self.assertGreater(len(inspect_res.tables), 0)

        # Read text as markdown
        markdown = WordTool.read_text(self.test_filename, folder="output")
        self.assertIn("# Overview & Mission", markdown)
        self.assertIn("Task A", markdown)

        # Extract tables
        tables = WordTool.extract_tables(self.test_filename, folder="output")
        self.assertGreater(len(tables), 0)


if __name__ == "__main__":
    unittest.main()

