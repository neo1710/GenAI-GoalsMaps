import os
import unittest
from pathlib import Path

from app.config import settings
from app.schemas import (
    ColumnSpec,
    CreateCsvFromMatrixRequest,
    CreateCsvFromRecordsRequest,
    CreateSyntheticCsvRequest,
)
from app.tools.csv_creator import CSVCreator


class TestCSVCreator(unittest.TestCase):
    def setUp(self):
        settings.ensure_directories()

    def test_create_from_records(self):
        records = [
            {"id": 1, "name": "Project Alpha", "progress": 85.5, "active": True},
            {"id": 2, "name": "Project Beta", "progress": 42.0, "active": False},
            {"id": 3, "name": "Project Gamma", "progress": 100.0, "active": True},
        ]
        req = CreateCsvFromRecordsRequest(
            filename="test_projects.csv",
            data=records,
            delimiter=",",
            include_header=True,
        )
        res = CSVCreator.from_records(req)

        self.assertTrue(res.success)
        self.assertEqual(res.row_count, 3)
        self.assertEqual(res.column_count, 4)
        self.assertIn("name", res.columns)
        self.assertTrue(Path(res.absolute_path).exists())

    def test_create_from_matrix(self):
        columns = ["metric", "value", "unit"]
        rows = [
            ["cpu", 45.2, "%"],
            ["memory", 68.1, "%"],
            ["latency", 12.4, "ms"],
        ]
        req = CreateCsvFromMatrixRequest(
            filename="test_matrix.csv",
            columns=columns,
            rows=rows,
        )
        res = CSVCreator.from_matrix(req)

        self.assertTrue(res.success)
        self.assertEqual(res.row_count, 3)
        self.assertEqual(res.columns, columns)

    def test_create_synthetic_goals_template(self):
        req = CreateSyntheticCsvRequest(
            filename="synthetic_goals.csv",
            template="goals_and_milestones",
            row_count=20,
            seed=123,
        )
        res = CSVCreator.create_synthetic(req)

        self.assertTrue(res.success)
        self.assertEqual(res.row_count, 20)
        self.assertIn("goal_id", res.columns)
        self.assertIn("progress_pct", res.columns)
        self.assertIn("assigned_owner", res.columns)

    def test_create_synthetic_custom_schema(self):
        columns = [
            ColumnSpec(name="user_id", type="integer", min_val=1000, max_val=9999),
            ColumnSpec(name="score", type="float", min_val=0.0, max_val=10.0),
            ColumnSpec(name="plan", type="category", categories=["free", "pro", "enterprise"]),
            ColumnSpec(name="is_active", type="boolean"),
        ]
        req = CreateSyntheticCsvRequest(
            filename="custom_users.csv",
            row_count=15,
            custom_columns=columns,
            seed=99,
        )
        res = CSVCreator.create_synthetic(req)

        self.assertTrue(res.success)
        self.assertEqual(res.row_count, 15)
        self.assertEqual(res.columns, ["user_id", "score", "plan", "is_active"])


if __name__ == "__main__":
    unittest.main()

