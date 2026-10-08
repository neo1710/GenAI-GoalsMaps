import unittest

from app.schemas import AnalyzeCsvRequest, QueryCsvRequest
from app.tools.csv_analyser import CSVAnalyser


class TestCSVAnalyser(unittest.TestCase):
    def test_analyze_raw_csv_content(self):
        sample_csv = """employee_id,name,department,salary,experience_years
101,Alice Chen,Engineering,125000,5
102,Bob Smith,Marketing,85000,3
103,Charlie Davis,Engineering,145000,8
104,Dana White,Sales,92000,4
105,Elena Rostova,Engineering,160000,10
106,Frank Miller,Marketing,78000,2
"""
        req = AnalyzeCsvRequest(
            csv_content=sample_csv,
            generate_markdown_report=True,
        )
        res = CSVAnalyser.analyze(req)

        self.assertTrue(res.success)
        self.assertEqual(res.row_count, 6)
        self.assertEqual(res.column_count, 5)
        self.assertIn("salary", res.columns)

        # Check salary numerical profile
        salary_prof = next(p for p in res.column_profiles if p.name == "salary")
        self.assertIsNotNone(salary_prof.numerical_stats)
        self.assertEqual(salary_prof.numerical_stats.count, 6)
        self.assertEqual(salary_prof.numerical_stats.min, 78000)
        self.assertEqual(salary_prof.numerical_stats.max, 160000)

        # Check department categorical profile
        dept_prof = next(p for p in res.column_profiles if p.name == "department")
        self.assertIsNotNone(dept_prof.categorical_stats)
        self.assertEqual(dept_prof.categorical_stats.unique_count, 3)

        # Check correlations (salary vs experience_years should have positive correlation)
        self.assertTrue(len(res.correlations) > 0)
        corr_pair = res.correlations[0]
        self.assertGreater(corr_pair.correlation, 0.8)

        # Check Markdown report presence
        self.assertIsNotNone(res.markdown_report)
        self.assertIn("# CSV Analysis Report", res.markdown_report)
        self.assertIn("Numerical Summary", res.markdown_report)

    def test_query_filter_and_projection(self):
        sample_csv = """item,category,price,in_stock
Laptop,Electronics,1200,True
Mouse,Electronics,25,True
Desk,Furniture,350,False
Chair,Furniture,150,True
Notebook,Stationery,5,True
"""
        from app.tools.file_manager import FileManager
        FileManager.write_file("test_query_stock.csv", sample_csv, folder="output")

        req = QueryCsvRequest(
            filename="test_query_stock.csv",
            filter_expression="price > 100 and in_stock == True",
            columns=["item", "price"],
            sort_by="price",
            ascending=False,
        )
        res = CSVAnalyser.query(req)

        self.assertTrue(res.success)
        self.assertEqual(res.total_matching_rows, 2)  # Laptop (1200) and Chair (150)
        self.assertEqual(res.columns, ["item", "price"])
        self.assertEqual(res.rows[0]["item"], "Laptop")
        self.assertEqual(res.rows[1]["item"], "Chair")


if __name__ == "__main__":
    unittest.main()

