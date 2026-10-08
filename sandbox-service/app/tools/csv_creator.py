import csv
import datetime
import io
import random
from typing import Any, Dict, List, Optional

import pandas as pd

from app.config import settings
from app.schemas import (
    ColumnSpec,
    CreateCsvFromMatrixRequest,
    CreateCsvFromRecordsRequest,
    CreateCsvResponse,
    CreateSyntheticCsvRequest,
)
from app.tools.file_manager import FileManager


class CSVCreator:
    """Tool for creating and generating CSV files from data structures or synthetic templates."""

    @classmethod
    def from_records(cls, req: CreateCsvFromRecordsRequest) -> CreateCsvResponse:
        """Create a CSV file from a list of record dictionaries."""
        if not req.data:
            raise ValueError("Data records cannot be empty.")

        # Ensure output directory exists
        settings.ensure_directories()
        target_path = FileManager.get_output_path(req.filename)

        # Collect all unique columns across records preserving order
        columns: List[str] = []
        for row in req.data:
            for k in row.keys():
                if k not in columns:
                    columns.append(k)

        with open(target_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=columns,
                delimiter=req.delimiter,
                extrasaction="ignore"
            )
            if req.include_header:
                writer.writeheader()
            writer.writerows(req.data)

        file_size = target_path.stat().st_size
        preview = req.data[: settings.MAX_CSV_PREVIEW_ROWS]

        return CreateCsvResponse(
            success=True,
            filename=target_path.name,
            relative_path=f"output/{target_path.name}",
            absolute_path=str(target_path),
            download_url=f"/files/download/output/{target_path.name}",
            row_count=len(req.data),
            column_count=len(columns),
            columns=columns,
            file_size_bytes=file_size,
            preview=preview,
            message=f"Successfully created CSV '{target_path.name}' with {len(req.data)} rows and {len(columns)} columns.",
        )

    @classmethod
    def from_matrix(cls, req: CreateCsvFromMatrixRequest) -> CreateCsvResponse:
        """Create a CSV file from column list and 2D row values."""
        if not req.columns:
            raise ValueError("Columns cannot be empty.")

        settings.ensure_directories()
        target_path = FileManager.get_output_path(req.filename)

        with open(target_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, delimiter=req.delimiter)
            writer.writerow(req.columns)
            writer.writerows(req.rows)

        # Build preview dictionaries
        preview: List[Dict[str, Any]] = []
        for row in req.rows[: settings.MAX_CSV_PREVIEW_ROWS]:
            preview.append({col: (row[idx] if idx < len(row) else None) for idx, col in enumerate(req.columns)})

        file_size = target_path.stat().st_size

        return CreateCsvResponse(
            success=True,
            filename=target_path.name,
            relative_path=f"output/{target_path.name}",
            absolute_path=str(target_path),
            download_url=f"/files/download/output/{target_path.name}",
            row_count=len(req.rows),
            column_count=len(req.columns),
            columns=req.columns,
            file_size_bytes=file_size,
            preview=preview,
            message=f"Successfully created CSV '{target_path.name}' with {len(req.rows)} rows and {len(req.columns)} columns.",
        )

    @classmethod
    def create_synthetic(cls, req: CreateSyntheticCsvRequest) -> CreateCsvResponse:
        """Generate realistic synthetic CSV datasets for testing, workflows, or agent mock data."""
        rng = random.Random(req.seed)
        rows: List[Dict[str, Any]] = []

        if req.template == "goals_and_milestones":
            rows = cls._generate_goals_template(req.row_count, rng)
        elif req.template == "sales_performance":
            rows = cls._generate_sales_template(req.row_count, rng)
        elif req.template == "user_analytics":
            rows = cls._generate_user_analytics_template(req.row_count, rng)
        elif req.template == "timeseries_metrics":
            rows = cls._generate_timeseries_template(req.row_count, rng)
        elif req.template == "project_tasks":
            rows = cls._generate_tasks_template(req.row_count, rng)
        elif req.custom_columns:
            rows = cls._generate_custom_schema(req.row_count, req.custom_columns, rng)
        else:
            # Default to goals_and_milestones if unspecified
            rows = cls._generate_goals_template(req.row_count, rng)

        create_req = CreateCsvFromRecordsRequest(
            filename=req.filename,
            data=rows,
            delimiter=",",
            include_header=True
        )
        return cls.from_records(create_req)

    # ---------------------------------------------------------
    # Template Generators
    # ---------------------------------------------------------

    @staticmethod
    def _generate_goals_template(count: int, rng: random.Random) -> List[Dict[str, Any]]:
        categories = ["Product Development", "AI Agents", "Data Engineering", "Marketing Growth", "Operations", "Finance"]
        priorities = ["High", "Medium", "Low", "Critical"]
        statuses = ["Not Started", "In Progress", "In Review", "Blocked", "Completed"]
        owners = ["Alice Chen", "Bob Smith", "Charlie Davis", "Dana White", "Elena Rostova", "Frank Miller"]

        goal_nouns = ["Engine", "Pipeline", "Dashboard", "Workflow", "Vector Store", "Service", "App", "Protocol"]
        goal_verbs = ["Optimize", "Deploy", "Architect", "Refactor", "Scale", "Evaluate", "Implement"]

        data = []
        base_date = datetime.date(2026, 1, 1)

        for i in range(1, count + 1):
            verb = rng.choice(goal_verbs)
            noun = rng.choice(goal_nouns)
            status = rng.choice(statuses)
            progress = (
                100 if status == "Completed"
                else 0 if status == "Not Started"
                else rng.randint(10, 90)
            )

            deadline_offset = rng.randint(15, 180)
            target_date = base_date + datetime.timedelta(days=deadline_offset)

            data.append({
                "goal_id": f"GOAL-{1000 + i}",
                "title": f"{verb} {noun} for Q{rng.randint(1, 4)}",
                "category": rng.choice(categories),
                "priority": rng.choice(priorities),
                "status": status,
                "progress_pct": progress,
                "target_date": target_date.isoformat(),
                "assigned_owner": rng.choice(owners),
                "estimated_budget_usd": rng.randint(1, 20) * 1000,
            })
        return data

    @staticmethod
    def _generate_sales_template(count: int, rng: random.Random) -> List[Dict[str, Any]]:
        regions = ["North America", "Europe", "Asia-Pacific", "Latin America", "Middle East"]
        products = [
            ("AI Workflow Pro", 299.00),
            ("Enterprise Agent Studio", 999.00),
            ("Vector Search Tier 1", 79.00),
            ("Embedding Acceleration Pack", 149.00),
            ("Cloud Sandbox Seat", 49.00),
        ]
        payment_methods = ["Credit Card", "Wire Transfer", "ACH", "Corporate Invoice"]

        data = []
        base_date = datetime.date(2026, 1, 1)

        for i in range(1, count + 1):
            product_name, unit_price = rng.choice(products)
            qty = rng.randint(1, 15)
            discount = rng.choice([0.0, 0.05, 0.10, 0.15, 0.20])
            total = round(qty * unit_price * (1.0 - discount), 2)
            txn_date = base_date + datetime.timedelta(days=rng.randint(0, 120))

            data.append({
                "transaction_id": f"TXN-{20000 + i}",
                "date": txn_date.isoformat(),
                "region": rng.choice(regions),
                "product": product_name,
                "quantity": qty,
                "unit_price": unit_price,
                "discount_pct": int(discount * 100),
                "total_revenue": total,
                "payment_method": rng.choice(payment_methods),
            })
        return data

    @staticmethod
    def _generate_user_analytics_template(count: int, rng: random.Random) -> List[Dict[str, Any]]:
        tiers = ["Free", "Starter", "Professional", "Enterprise"]
        channels = ["Organic Search", "Direct", "Referral", "Product Hunt", "LinkedIn"]

        data = []
        base_date = datetime.date(2025, 6, 1)

        for i in range(1, count + 1):
            signup = base_date + datetime.timedelta(days=rng.randint(0, 250))
            sessions = rng.randint(1, 120)
            avg_duration = round(rng.uniform(2.5, 45.0), 1)
            satisfaction = rng.randint(4, 10)
            churned = rng.random() < 0.15

            data.append({
                "user_id": f"USR-{5000 + i}",
                "signup_date": signup.isoformat(),
                "tier": rng.choice(tiers),
                "acquisition_channel": rng.choice(channels),
                "sessions_count": sessions,
                "avg_session_duration_min": avg_duration,
                "satisfaction_score": satisfaction,
                "is_churned": churned,
            })
        return data

    @staticmethod
    def _generate_timeseries_template(count: int, rng: random.Random) -> List[Dict[str, Any]]:
        hosts = ["agent-worker-01", "agent-worker-02", "sandbox-node-a", "sandbox-node-b"]
        start_time = datetime.datetime(2026, 4, 1, 0, 0, 0)
        data = []

        for i in range(count):
            curr_time = start_time + datetime.timedelta(minutes=i * 5)
            cpu = round(rng.uniform(15.0, 95.0), 2)
            mem = round(rng.uniform(30.0, 88.0), 2)
            net = round(rng.uniform(10.0, 450.0), 1)
            err = round(rng.uniform(0.0, 2.5), 3)
            status = "HEALTHY" if cpu < 85 and err < 1.0 else "WARNING"

            data.append({
                "timestamp": curr_time.isoformat(),
                "host": rng.choice(hosts),
                "cpu_usage_pct": cpu,
                "memory_usage_pct": mem,
                "network_throughput_mbps": net,
                "error_rate_pct": err,
                "status": status,
            })
        return data

    @staticmethod
    def _generate_tasks_template(count: int, rng: random.Random) -> List[Dict[str, Any]]:
        assignees = ["Dev 1", "Dev 2", "QA Lead", "ML Engineer", "Product Owner"]
        statuses = ["Backlog", "In Development", "Code Review", "Done"]

        data = []
        for i in range(1, count + 1):
            est_hours = rng.choice([2, 4, 8, 16, 24])
            logged_hours = (
                est_hours if rng.random() > 0.3
                else max(1, est_hours + rng.randint(-3, 6))
            )

            data.append({
                "task_id": f"TASK-{300 + i}",
                "task_name": f"Implement feature block #{i}",
                "assignee": rng.choice(assignees),
                "story_points": rng.choice([1, 2, 3, 5, 8]),
                "status": rng.choice(statuses),
                "estimated_hours": est_hours,
                "logged_hours": logged_hours,
            })
        return data

    @staticmethod
    def _generate_custom_schema(
        count: int,
        columns: List[ColumnSpec],
        rng: random.Random
    ) -> List[Dict[str, Any]]:
        data = []
        base_date = datetime.date(2026, 1, 1)

        for i in range(1, count + 1):
            row: Dict[str, Any] = {}
            for col in columns:
                if col.type == "integer":
                    min_val = int(col.min_val if col.min_val is not None else 0)
                    max_val = int(col.max_val if col.max_val is not None else 100)
                    row[col.name] = rng.randint(min_val, max_val)
                elif col.type == "float":
                    min_val = col.min_val if col.min_val is not None else 0.0
                    max_val = col.max_val if col.max_val is not None else 100.0
                    row[col.name] = round(rng.uniform(min_val, max_val), 2)
                elif col.type == "category" and col.categories:
                    row[col.name] = rng.choice(col.categories)
                elif col.type == "boolean":
                    row[col.name] = rng.choice([True, False])
                elif col.type == "date":
                    day_offset = rng.randint(0, 365)
                    row[col.name] = (base_date + datetime.timedelta(days=day_offset)).isoformat()
                else:
                    row[col.name] = f"{col.name}_{i}"
            data.append(row)
        return data

