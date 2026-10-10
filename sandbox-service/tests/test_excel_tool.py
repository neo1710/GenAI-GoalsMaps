import gc
import unittest
from pathlib import Path

from app.config import settings
from app.schemas import CreateExcelRequest, ExcelSheetSpec
from app.tools.excel_tool import ExcelTool
from app.tools.file_manager import FileManager


class TestExcelTool(unittest.TestCase):

    def setUp(self):
        settings.ensure_directories()
        self.test_filename = "test_sales_report.xlsx"

    def tearDown(self):
        gc.collect()
        test_file = settings.OUTPUT_DIR / self.test_filename
        if test_file.exists():
            try:
                test_file.unlink()
            except Exception:
                pass

    def test_create_excel_from_template(self):
        req = CreateExcelRequest(
            filename=self.test_filename,
            document_title="Quarterly KPI Scorecard",
            template="kpi_dashboard",
            template_row_count=15,
            theme="emerald",
        )
        res = ExcelTool.create_excel(req)

        self.assertTrue(res.success)
        self.assertEqual(res.filename, self.test_filename)
        self.assertIn("Goals_and_KPIs", res.sheets_created)
        self.assertEqual(res.total_rows, 15)
        self.assertTrue((settings.OUTPUT_DIR / self.test_filename).exists())

    def test_create_excel_custom_sheets(self):
        spec = ExcelSheetSpec(
            title="Revenue",
            columns=["Month", "Target", "Actual", "Variance"],
            rows=[
                ["Jan", 10000, 12000, 2000],
                ["Feb", 11000, 10500, -500],
                ["Mar", 12000, 13500, 1500],
            ],
            header_bg_color="1E3A8A",
            column_formats={
                "Target": "currency_integer",
                "Actual": "currency_integer",
                "Variance": "currency_integer",
            },
            summary_row={"Target": "SUM", "Actual": "SUM", "Variance": "SUM"},
        )
        req = CreateExcelRequest(
            filename=self.test_filename,
            document_title="Q1 Revenue Analysis",
            sheets=[spec],
            theme="corporate_blue",
        )
        res = ExcelTool.create_excel(req)

        self.assertTrue(res.success)
        self.assertEqual(res.total_rows, 3)

        # Inspect generated file
        inspect_res = ExcelTool.inspect_file(self.test_filename, folder="output")
        self.assertTrue(inspect_res.success)
        self.assertEqual(inspect_res.sheet_count, 1)
        # 3 data rows + 1 summary row = 4 rows
        self.assertEqual(inspect_res.sheets[0].row_count, 4)

    def test_analyze_excel_sheet(self):
        req = CreateExcelRequest(
            filename=self.test_filename,
            template="sales_summary",
            template_row_count=20,
        )
        ExcelTool.create_excel(req)

        analysis = ExcelTool.analyze_sheet(self.test_filename, folder="output", generate_markdown=True)
        self.assertTrue(analysis.success)
        self.assertGreaterEqual(analysis.row_count, 20)
        self.assertIsNotNone(analysis.markdown_report)
        self.assertIn("Sales_Performance", analysis.source)

    def test_convert_to_csv(self):
        req = CreateExcelRequest(
            filename=self.test_filename,
            template="project_tracker",
            template_row_count=10,
        )
        ExcelTool.create_excel(req)

        conv = ExcelTool.convert_to_csv(self.test_filename, folder="output", output_filename="converted_tasks.csv")
        self.assertTrue(conv["success"])
        csv_file = settings.OUTPUT_DIR / "converted_tasks.csv"
        self.assertTrue(csv_file.exists())
        try:
            csv_file.unlink()
        except Exception:
            pass


if __name__ == "__main__":
    unittest.main()

