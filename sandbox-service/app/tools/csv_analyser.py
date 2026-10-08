import csv
import io
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.config import settings
from app.schemas import (
    AnalyzeCsvRequest,
    AnalyzeCsvResponse,
    CategoricalStats,
    ColumnProfile,
    CorrelationPair,
    NumericalStats,
    QualityIssue,
    QueryCsvRequest,
    QueryCsvResponse,
)
from app.tools.file_manager import FileManager


class CSVAnalyser:
    """Tool for analyzing, profiling, quality checking, and querying CSV files."""

    @classmethod
    def analyze(cls, req: AnalyzeCsvRequest) -> AnalyzeCsvResponse:
        """Perform comprehensive statistical and data-quality analysis on a CSV."""
        df, source_label = cls._load_dataframe(req.filename, req.csv_content, req.delimiter)

        row_count = len(df)
        column_count = len(df.columns)
        columns = list(df.columns)
        memory_bytes = int(df.memory_usage(deep=True).sum())
        duplicates_count = int(df.duplicated().sum())

        column_profiles: List[ColumnProfile] = []
        quality_issues: List[QualityIssue] = []

        # Check dataset-level quality
        if duplicates_count > 0:
            quality_issues.append(
                QualityIssue(
                    severity="warning",
                    issue="Duplicate Rows Detected",
                    detail=f"Found {duplicates_count} identical row(s) ({(duplicates_count / row_count) * 100:.1f}%).",
                )
            )

        numerical_cols: List[str] = []

        for col_name in columns:
            series = df[col_name]
            profile, is_num, col_issues = cls._profile_column(series, row_count)
            column_profiles.append(profile)
            quality_issues.extend(col_issues)
            if is_num:
                numerical_cols.append(col_name)

        # Correlation analysis
        correlations: List[CorrelationPair] = []
        if len(numerical_cols) >= 2 and row_count >= 3:
            correlations = cls._calculate_correlations(
                df[numerical_cols], max_pairs=req.top_correlations_count
            )

        # Markdown Report Generation
        markdown_report = None
        if req.generate_markdown_report:
            markdown_report = cls._generate_markdown_report(
                source=source_label,
                row_count=row_count,
                column_count=column_count,
                duplicates=duplicates_count,
                memory_bytes=memory_bytes,
                profiles=column_profiles,
                correlations=correlations,
                issues=quality_issues,
            )

        # Preview of first few rows
        preview = (
            df.head(settings.MAX_CSV_PREVIEW_ROWS)
            .replace({np.nan: None})
            .to_dict(orient="records")
        )

        return AnalyzeCsvResponse(
            success=True,
            source=source_label,
            row_count=row_count,
            column_count=column_count,
            columns=columns,
            memory_usage_bytes=memory_bytes,
            duplicate_rows_count=duplicates_count,
            column_profiles=column_profiles,
            correlations=correlations,
            quality_issues=quality_issues,
            markdown_report=markdown_report,
            preview=preview,
        )

    @classmethod
    def query(cls, req: QueryCsvRequest) -> QueryCsvResponse:
        """Filter, project, sort, and slice rows from a CSV."""
        df, _ = cls._load_dataframe(req.filename, None, None)

        # Apply filtering if provided
        filtered_df = df
        if req.filter_expression and req.filter_expression.strip():
            try:
                filtered_df = df.query(req.filter_expression)
            except Exception as e:
                raise ValueError(f"Filter expression failed: {str(e)}")

        total_matches = len(filtered_df)

        # Apply sorting
        if req.sort_by and req.sort_by in filtered_df.columns:
            filtered_df = filtered_df.sort_values(by=req.sort_by, ascending=req.ascending)

        # Apply column selection
        target_cols = req.columns if req.columns else list(filtered_df.columns)
        valid_cols = [c for c in target_cols if c in filtered_df.columns]
        if valid_cols:
            filtered_df = filtered_df[valid_cols]

        # Apply limit
        limited_df = filtered_df.head(req.limit)

        saved_file = None
        if req.save_result_to:
            settings.ensure_directories()
            out_path = FileManager.get_output_path(req.save_result_to)
            limited_df.to_csv(out_path, index=False)
            saved_file = f"output/{out_path.name}"

        rows = limited_df.replace({np.nan: None}).to_dict(orient="records")

        download_url = f"/files/download/{saved_file}" if saved_file else None

        return QueryCsvResponse(
            success=True,
            total_matching_rows=total_matches,
            returned_rows_count=len(rows),
            columns=list(limited_df.columns),
            rows=rows,
            saved_file=saved_file,
            download_url=download_url,
        )

    # ---------------------------------------------------------
    # Internal Helpers
    # ---------------------------------------------------------

    @classmethod
    def _load_dataframe(
        cls,
        filename: Optional[str],
        csv_content: Optional[str],
        delimiter: Optional[str],
    ) -> Tuple[pd.DataFrame, str]:
        if not filename and not csv_content:
            raise ValueError("Either 'filename' or 'csv_content' must be provided.")

        sep = delimiter if delimiter else None

        if csv_content:
            source = "raw_content"
            buffer = io.StringIO(csv_content)
            df = pd.read_csv(buffer, sep=sep, engine="python")
            return df, source

        source_path = FileManager.resolve_path(filename)
        if not source_path.exists():
            raise FileNotFoundError(f"File not found in input/ or output/: {filename}")

        df = pd.read_csv(source_path, sep=sep, engine="python")
        return df, source_path.name

    @classmethod
    def _profile_column(
        cls, series: pd.Series, total_rows: int
    ) -> Tuple[ColumnProfile, bool, List[QualityIssue]]:
        col_name = str(series.name)
        missing_count = int(series.isna().sum())
        missing_pct = round((missing_count / total_rows) * 100, 2) if total_rows > 0 else 0.0
        issues: List[QualityIssue] = []

        if missing_pct >= 50.0:
            issues.append(
                QualityIssue(
                    severity="critical",
                    column=col_name,
                    issue="Critical Missing Values",
                    detail=f"{missing_pct}% of values are null or empty.",
                )
            )
        elif missing_pct >= 20.0:
            issues.append(
                QualityIssue(
                    severity="warning",
                    column=col_name,
                    issue="High Missing Rate",
                    detail=f"{missing_pct}% of values are null or empty.",
                )
            )

        # Check if numeric
        non_null_series = series.dropna()
        is_numeric = pd.api.types.is_numeric_dtype(series)

        # Attempt date detection if object
        inferred_type = str(series.dtype)
        if is_numeric:
            inferred_type = "numeric"
            num_stats, num_issues = cls._compute_numerical_stats(non_null_series, missing_count, missing_pct, col_name)
            issues.extend(num_issues)
            return (
                ColumnProfile(
                    name=col_name,
                    inferred_type=inferred_type,
                    numerical_stats=num_stats,
                ),
                True,
                issues,
            )

        # Check if boolean
        if pd.api.types.is_bool_dtype(series):
            inferred_type = "boolean"
        elif cls._is_potential_datetime(non_null_series):
            inferred_type = "datetime"
        else:
            inferred_type = "categorical"

        cat_stats, cat_issues = cls._compute_categorical_stats(non_null_series, missing_count, missing_pct, total_rows, col_name)
        issues.extend(cat_issues)

        return (
            ColumnProfile(
                name=col_name,
                inferred_type=inferred_type,
                categorical_stats=cat_stats,
            ),
            False,
            issues,
        )

    @staticmethod
    def _is_potential_datetime(series: pd.Series) -> bool:
        if len(series) == 0:
            return False
        # If values look like pure numbers or too short, avoid parsing as date
        sample = series.head(5).astype(str)
        if any(len(s.strip()) < 6 or s.strip().isdigit() for s in sample):
            return False
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                pd.to_datetime(sample, format="ISO8601")
                return True
            except Exception:
                try:
                    pd.to_datetime(sample, format="mixed")
                    return True
                except Exception:
                    return False

    @classmethod
    def _compute_numerical_stats(
        cls, series: pd.Series, missing_count: int, missing_pct: float, col_name: str
    ) -> Tuple[NumericalStats, List[QualityIssue]]:
        issues: List[QualityIssue] = []
        count = len(series)
        if count == 0:
            return (
                NumericalStats(
                    count=0,
                    missing_count=missing_count,
                    missing_pct=missing_pct,
                ),
                issues,
            )

        mean_val = float(series.mean())
        std_val = float(series.std()) if count > 1 else 0.0
        min_val = float(series.min())
        max_val = float(series.max())
        q25 = float(series.quantile(0.25))
        median_val = float(series.median())
        q75 = float(series.quantile(0.75))
        skew_val = float(series.skew()) if count > 2 and not math.isnan(series.skew()) else None

        # Constant check
        if min_val == max_val:
            issues.append(
                QualityIssue(
                    severity="warning",
                    column=col_name,
                    issue="Zero Variance",
                    detail=f"Column has constant value: {min_val}",
                )
            )

        # IQR Outlier Detection
        iqr = q75 - q25
        lower_bound = q25 - 1.5 * iqr
        upper_bound = q75 + 1.5 * iqr

        outliers = series[(series < lower_bound) | (series > upper_bound)]
        outliers_count = len(outliers)
        outliers_sample = [float(x) for x in outliers.head(5).tolist()]

        if outliers_count > 0:
            outlier_pct = round((outliers_count / count) * 100, 1)
            issues.append(
                QualityIssue(
                    severity="info" if outlier_pct < 5.0 else "warning",
                    column=col_name,
                    issue="Outliers Detected",
                    detail=f"Found {outliers_count} ({outlier_pct}%) outliers outside [{lower_bound:.2f}, {upper_bound:.2f}].",
                )
            )

        return (
            NumericalStats(
                count=count,
                missing_count=missing_count,
                missing_pct=missing_pct,
                mean=round(mean_val, 3),
                std=round(std_val, 3),
                min=round(min_val, 3),
                q25=round(q25, 3),
                median=round(median_val, 3),
                q75=round(q75, 3),
                max=round(max_val, 3),
                skew=round(skew_val, 3) if skew_val is not None else None,
                outliers_count=outliers_count,
                outliers_sample=outliers_sample,
            ),
            issues,
        )

    @classmethod
    def _compute_categorical_stats(
        cls,
        series: pd.Series,
        missing_count: int,
        missing_pct: float,
        total_rows: int,
        col_name: str,
    ) -> Tuple[CategoricalStats, List[QualityIssue]]:
        issues: List[QualityIssue] = []
        count = len(series)
        unique_count = int(series.nunique())
        cardinality_ratio = round(unique_count / total_rows, 3) if total_rows > 0 else 0.0

        # Top frequent values
        value_counts = series.value_counts().head(5)
        top_values = [
            {
                "value": str(val),
                "count": int(cnt),
                "percentage": round((cnt / total_rows) * 100, 2) if total_rows > 0 else 0.0,
            }
            for val, cnt in value_counts.items()
        ]

        if unique_count == 1 and total_rows > 1:
            issues.append(
                QualityIssue(
                    severity="warning",
                    column=col_name,
                    issue="Constant Categorical",
                    detail=f"Column contains only 1 unique value: '{series.iloc[0]}'",
                )
            )

        return (
            CategoricalStats(
                count=count,
                missing_count=missing_count,
                missing_pct=missing_pct,
                unique_count=unique_count,
                cardinality_ratio=cardinality_ratio,
                top_values=top_values,
            ),
            issues,
        )

    @staticmethod
    def _calculate_correlations(
        df_num: pd.DataFrame, max_pairs: int = 5
    ) -> List[CorrelationPair]:
        corr_matrix = df_num.corr()
        pairs: List[Tuple[str, str, float]] = []

        cols = list(corr_matrix.columns)
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                col1 = cols[i]
                col2 = cols[j]
                val = corr_matrix.loc[col1, col2]
                if not math.isnan(val):
                    pairs.append((col1, col2, round(float(val), 3)))

        # Sort by absolute correlation descending
        pairs.sort(key=lambda x: abs(x[2]), reverse=True)

        return [
            CorrelationPair(column_x=p[0], column_y=p[1], correlation=p[2])
            for p in pairs[:max_pairs]
        ]

    @classmethod
    def _generate_markdown_report(
        cls,
        source: str,
        row_count: int,
        column_count: int,
        duplicates: int,
        memory_bytes: int,
        profiles: List[ColumnProfile],
        correlations: List[CorrelationPair],
        issues: List[QualityIssue],
    ) -> str:
        lines: List[str] = [
            f"# CSV Analysis Report: `{source}`\n",
            "## 1. Dataset Overview",
            f"- **Total Rows:** {row_count:,}",
            f"- **Total Columns:** {column_count}",
            f"- **Duplicate Rows:** {duplicates:,}",
            f"- **Memory Footprint:** {memory_bytes / 1024:.2f} KB\n",
        ]

        # Quality Issues Alert
        if issues:
            lines.append("## 2. Data Quality & Anomaly Alerts")
            for iss in issues:
                icon = "🔴" if iss.severity == "critical" else "⚠️" if iss.severity == "warning" else "ℹ️"
                col_ref = f" (Column: `{iss.column}`)" if iss.column else ""
                lines.append(f"- {icon} **{iss.issue}**{col_ref}: {iss.detail}")
            lines.append("")
        else:
            lines.append("## 2. Data Quality & Anomaly Alerts\n- ✅ No data quality issues detected.\n")

        # Numerical Columns Summary
        num_profiles = [p for p in profiles if p.numerical_stats is not None]
        if num_profiles:
            lines.append("## 3. Numerical Summary")
            lines.append("| Column | Missing (%) | Mean | Std | Min | Median | Max | Outliers |")
            lines.append("|---|---|---|---|---|---|---|---|")
            for p in num_profiles:
                ns = p.numerical_stats
                lines.append(
                    f"| `{p.name}` | {ns.missing_pct}% | {ns.mean} | {ns.std} | {ns.min} | {ns.median} | {ns.max} | {ns.outliers_count} |"
                )
            lines.append("")

        # Categorical Columns Summary
        cat_profiles = [p for p in profiles if p.categorical_stats is not None]
        if cat_profiles:
            lines.append("## 4. Categorical & Text Summary")
            lines.append("| Column | Type | Unique | Missing (%) | Top Frequent Values |")
            lines.append("|---|---|---|---|---|")
            for p in cat_profiles:
                cs = p.categorical_stats
                top_str = ", ".join([f"'{t['value']}' ({t['count']})" for t in cs.top_values[:3]])
                lines.append(
                    f"| `{p.name}` | {p.inferred_type} | {cs.unique_count} | {cs.missing_pct}% | {top_str} |"
                )
            lines.append("")

        # Correlations
        if correlations:
            lines.append("## 5. Top Numerical Correlations")
            lines.append("| Column A | Column B | Pearson Correlation (r) | Strength |")
            lines.append("|---|---|---|---|")
            for c in correlations:
                r = c.correlation
                strength = (
                    "Strong Positive" if r >= 0.7
                    else "Moderate Positive" if r >= 0.3
                    else "Weak / Neutral" if r > -0.3
                    else "Moderate Negative" if r > -0.7
                    else "Strong Negative"
                )
                lines.append(f"| `{c.column_x}` | `{c.column_y}` | {r:.3f} | {strength} |")
            lines.append("")

        return "\n".join(lines)
