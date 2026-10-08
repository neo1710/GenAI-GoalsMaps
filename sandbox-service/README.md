# Sandbox Agent Service 🛡️🐍

A secure, isolated Python execution and data manipulation environment designed for backend AI agents (such as the `sandbox_agent` workflow node in **GenAI-GoalsMaps**).

---

## 📋 Overview & What Was Built

The Sandbox Service provides an isolated runtime for running AI-generated Python code, performing statistical analysis, generating synthetic datasets, and manipulating CSV files safely.

### 🌟 Key Capabilities
1. **Python Sandbox Execution (`POST /execute`)**:
   - Executes arbitrary Python scripts in an isolated subprocess.
   - Enforces configurable execution timeouts (default: 30 seconds) to prevent infinite loops.
   - Static security auditor blocks malicious system commands (`os.system`, destructive filesystem commands, fork bombs).
   - Dedicated `/workspace/input` and `/workspace/output` directories with automatic tracking of newly generated/modified files.
   - Captures stdout, stderr, execution duration, and exit codes.

2. **CSV Creator (`POST /csv/create`, `POST /csv/synthetic`)**:
   - Create CSVs from JSON record arrays or matrix arrays.
   - Built-in synthetic dataset generator for common agent workflows:
     - `goals_and_milestones` (goal tracking, progress %, deadlines, categories)
     - `sales_performance` (transactions, products, discounts, revenues)
     - `user_analytics` (sessions, retention, subscriptions, churn risk)
     - `timeseries_metrics` (system telemetry, cpu, memory, status)
     - `project_tasks` (sprint tasks, story points, hours)
     - Custom schema specification (int, float, date, boolean, category).

3. **CSV Analyser (`POST /csv/analyze`, `POST /csv/query`)**:
   - Ingests CSV files from workspace or raw CSV string payloads.
   - Automatic delimiter sniffing and encoding detection.
   - Comprehensive column profiling:
     - **Numerical columns**: count, missing %, mean, std, min, 25%, median, 75%, max, skewness.
     - **Outlier detection**: IQR-based anomaly detection (1.5 * IQR) with sample outlier values.
     - **Categorical columns**: unique count, cardinality ratio, top 5 frequent values with percentages.
     - **Correlations**: Pearson correlation matrix and top correlated pairs.
     - **Quality alerts**: flags high missing rates (>20%, >50%), zero variance, and duplicate rows.
   - **Markdown Summary Generator**: outputs an LLM-ready markdown report.
   - **SQL-like Querying (`/csv/query`)**: filter expressions (e.g. `price > 100 and status == 'Done'`), sorting, column projection, and saving results to a new CSV.

4. **Unified Agent Dispatcher (`POST /agent/run`)**:
   - A single endpoint designed for backend LLM agents to call as a tool.
   - Supports actions: `create_csv`, `create_synthetic_csv`, `analyze_csv`, `query_csv`, `execute_python`, `list_files`.
   - Returns structured JSON results along with a concise natural language summary for the agent prompt.

5. **File Management API**:
   - `GET /files`: List files in `input/` and `output/`.
   - `POST /files/upload`: Upload datasets to `input/` or `output/`.
   - `GET /files/download/{folder}/{filename}`: Download generated reports and datasets.

---

## 📂 Project Architecture

```
sandbox-service/
├── Dockerfile                  # Production container definition (Python 3.12, Node.js, sandbox user)
├── compose.yaml                # Docker Compose specification (Port 8001)
├── requirements.txt            # Python dependencies (FastAPI, uvicorn, pandas, numpy, etc.)
├── .env.example                # Environment variable configuration template
├── .dockerignore               # Container build ignore rules
├── README.md                   # This documentation
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application with REST endpoints
│   ├── config.py               # Workspace paths, timeouts, limits
│   ├── schemas.py              # Pydantic models for requests and responses
│   ├── sandbox/
│   │   ├── __init__.py
│   │   ├── runner.py           # Subprocess runner, timeout handler, file tracking
│   │   └── security.py         # Static AST & regex security auditor
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── csv_creator.py      # CSV creation & synthetic data generators
│   │   ├── csv_analyser.py     # Statistical analysis, anomaly detection & Markdown reports
│   │   └── file_manager.py     # Safe path resolution & file read/write
│   └── agent/
│       ├── __init__.py
│       └── dispatcher.py       # High-level tool router for AI agents
├── workspace/
│   ├── input/                  # Input datasets for analysis or processing
│   └── output/                 # Destination for generated CSVs, reports, and code outputs
└── tests/
    ├── __init__.py
    ├── test_csv_creator.py     # Unit tests for CSV creation and synthetic templates
    ├── test_csv_analyser.py    # Unit tests for stats, outliers, and queries
    ├── test_runner.py          # Unit tests for code execution, timeouts, security
    └── test_api.py             # Integration tests for FastAPI endpoints
```

---

## 🚀 How to Run

### Method 1: Docker Compose (Recommended for Production & Microservices)

Run the containerized sandbox service with isolated non-root user:

```bash
cd sandbox-service
docker compose up --build -d
```

The service will be live at:
- **API Base URL:** `http://localhost:8001`
- **Interactive Swagger Docs:** `http://localhost:8001/docs`
- **Health Check:** `http://localhost:8001/health`

To stop:
```bash
docker compose down
```

---

### Method 2: Local Python Environment (Development)

1. Activate your Python virtual environment (e.g. from workspace):
```bash
# If using existing venv:
..\python-embeddings\venv\Scripts\activate

# Or install dependencies in a dedicated venv:
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

2. Run the FastAPI development server:
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

3. Run the unit and integration tests:
```bash
python -m unittest discover tests
```

---

## 📡 API Reference & Examples

### 1. Unified Agent Dispatch (`POST /agent/run`)
A single tool-call endpoint for LLM agents.

#### Request: Generate Synthetic Data
```json
POST /agent/run
Content-Type: application/json

{
  "action": "create_synthetic_csv",
  "parameters": {
    "filename": "q3_goals.csv",
    "template": "goals_and_milestones",
    "row_count": 25,
    "seed": 42
  }
}
```

#### Response:
```json
{
  "success": true,
  "action": "create_synthetic_csv",
  "summary": "Generated synthetic CSV 'q3_goals.csv' (25 rows, 9 columns) using template 'goals_and_milestones'.",
  "result": {
    "filename": "q3_goals.csv",
    "relative_path": "output/q3_goals.csv",
    "row_count": 25,
    "column_count": 9,
    "columns": ["goal_id", "title", "category", "priority", "status", "progress_pct", "target_date", "assigned_owner", "estimated_budget_usd"]
  },
  "files_created": ["output/q3_goals.csv"]
}
```

---

### 2. Analyze CSV (`POST /csv/analyze`)
Performs data profiling, statistical breakdown, IQR outlier detection, and correlation analysis.

#### Request:
```json
POST /csv/analyze
Content-Type: application/json

{
  "filename": "q3_goals.csv",
  "generate_markdown_report": true,
  "top_correlations_count": 5
}
```

#### Response (Excerpt):
```json
{
  "success": true,
  "source": "q3_goals.csv",
  "row_count": 25,
  "column_count": 9,
  "columns": ["goal_id", "title", "category", "priority", "status", "progress_pct", "target_date", "assigned_owner", "estimated_budget_usd"],
  "duplicate_rows_count": 0,
  "quality_issues": [
    {
      "severity": "info",
      "column": "estimated_budget_usd",
      "issue": "Outliers Detected",
      "detail": "Found 1 (4.0%) outliers outside [-11000.00, 37000.00]."
    }
  ],
  "column_profiles": [
    {
      "name": "progress_pct",
      "inferred_type": "numeric",
      "numerical_stats": {
        "count": 25,
        "mean": 52.4,
        "std": 33.1,
        "min": 0.0,
        "median": 55.0,
        "max": 100.0,
        "outliers_count": 0
      }
    }
  ],
  "markdown_report": "# CSV Analysis Report: `q3_goals.csv`\n\n## 1. Dataset Overview\n- **Total Rows:** 25\n- **Total Columns:** 9\n..."
}
```

---

### 3. Query CSV (`POST /csv/query`)
Filter, project, sort, and slice data from any CSV.

#### Request:
```json
POST /csv/query
Content-Type: application/json

{
  "filename": "q3_goals.csv",
  "filter_expression": "progress_pct >= 75 and priority == 'Critical'",
  "columns": ["goal_id", "title", "status", "progress_pct", "assigned_owner"],
  "sort_by": "progress_pct",
  "ascending": false,
  "save_result_to": "critical_near_completion.csv"
}
```

---

### 4. Execute Arbitrary Python (`POST /execute`)
Runs user/agent code in the sandbox.

#### Request:
```json
POST /execute
Content-Type: application/json

{
  "code": "import pandas as pd\ndf = pd.read_csv('output/q3_goals.csv')\nsummary = df.groupby('status')['progress_pct'].mean()\nprint(summary)\nwith open('output/summary_result.txt', 'w') as f:\n    f.write(summary.to_string())\n",
  "timeout_seconds": 10
}
```

#### Response:
```json
{
  "success": true,
  "exit_code": 0,
  "stdout": "status\nBlocked        55.0\nCompleted     100.0\nIn Progress    58.3\nNot Started     0.0\nName: progress_pct, dtype: float64\n",
  "stderr": "",
  "execution_time_ms": 348.5,
  "output_files": [
    "output/summary_result.txt"
  ],
  "error_message": null
}
```

---

## 🔗 Integrating with Backend Workflows (`goal-map`)

In your backend or Next.js server actions / API routes:

```typescript
// Example: Calling Sandbox Service from backend agent runner
const SANDBOX_URL = process.env.SANDBOX_SERVICE_URL || "http://localhost:8002";

export async function runSandboxAgent(action: string, parameters: Record<string, unknown>) {
  const response = await fetch(`${SANDBOX_URL}/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, parameters }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sandbox execution failed: ${errorText}`);
  }

  return await response.json();
}
```

---

## 🛡️ Security Features
- **Subprocess Isolation**: Scripts run as independent processes with explicit timeouts.
- **Path Traversal Guards**: Filenames with `../` or absolute escape paths are strictly blocked by `FileManager`.
- **Static Code Auditor**: Scans AST and regex for dangerous modules (`pty`, nested `subprocess`, `os.system`, destructive `shutil.rmtree` on root, and fork bomb patterns).
- **Non-Root Container User**: When executed in Docker, runs under unprivileged `sandbox` user.
- **Output Capping**: Stdout and stderr are capped at 100,000 characters to prevent memory DOS.

