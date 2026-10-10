# Backend Updates & Integration Guide 🚀

This document details the latest backend updates introduced to **`sandbox-service`** to support:
1. **Real-Time Streaming** (SSE) for Python execution, Agent actions, and Skills.
2. **Instructional Skills Engine** (`/skills`) with built-in templates and dynamic custom task execution.
3. **Excel Processing & Creation** (`.xlsx`, `.xls`) with multi-sheet styling, KPI cards, and automated formulas.
4. **Word Processing & Creation** (`.docx`, `.doc`) with executive layouts, callout boxes, and table extraction.
5. **Office Document File Management** (MIME types, text extraction, safe downloads).

---

## 📦 1. Dependencies & Environment Updates

### Required Dependencies
The following dependencies were added to `requirements.txt`:
```txt
openpyxl>=3.1.2     # Excel (.xlsx) creation, cell styling, formulas & sheet inspection
python-docx>=1.1.0  # Word (.docx) document creation, extraction & formatting
```

### Installation Command
If running locally:
```bash
pip install -r requirements.txt
```
Or specifically:
```bash
pip install openpyxl>=3.1.2 python-docx>=1.1.0
```

### Docker Compose
Rebuild the container image to include the new dependencies:
```bash
docker compose build --no-cache sandbox-service
docker compose up -d
```

---

## ⚡ 2. Real-Time Streaming Endpoints (Server-Sent Events - SSE)

All streaming endpoints return `Content-Type: text/event-stream` with `Cache-Control: no-cache` and `Connection: keep-alive`.

### W3C SSE Event Protocol Format
Each event is formatted as:
```text
event: <event_type>
data: {"key": "value"}

```
Periodic keep-alive comments are sent automatically every 3 seconds of inactivity to prevent proxy/load balancer timeouts:
```text
: keep-alive 3.2s

```

---

### A. Python Code Execution Stream (`POST /execute/stream`)
Executes Python scripts in an isolated subprocess with line-by-line real-time stdout and stderr streaming.

- **URL:** `POST http://localhost:8001/execute/stream`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
```json
{
  "code": "import time\nprint('Step 1: Ingesting dataset')\ntime.sleep(1)\nprint('Step 2: Calculating metrics')\nwith open('output/metrics.txt', 'w') as f: f.write('OK')\nprint('Step 3: Done')",
  "timeout_seconds": 30,
  "input_files": {
    "data.csv": "col1,col2\n10,20\n30,40"
  }
}
```

#### Emitted SSE Events:
1. `event: start` -> `{"run_id": "a1b2c3d4", "timeout_seconds": 30, "status": "Process started"}`
2. `event: status` -> `{"message": "Prepared input file: input/data.csv"}`
3. `event: stdout` -> `{"line": "Step 1: Ingesting dataset", "timestamp_ms": 105.2}`
4. `event: stderr` -> `{"line": "...", "timestamp_ms": ...}`
5. `event: file_created` -> `{"filename": "metrics.txt", "relative_path": "output/metrics.txt", "size_bytes": 2, "download_url": "/files/download/output/metrics.txt"}`
6. `event: complete` -> `{"success": true, "exit_code": 0, "execution_time_ms": 1120.4, "output_files": ["output/metrics.txt"], "download_urls": ["/files/download/output/metrics.txt"]}`

---

### B. Unified Agent Runner Stream (`POST /agent/run/stream`)
Streams agent tool execution events live.
- **URL:** `POST http://localhost:8001/agent/run/stream`
- **Request Body:**
```json
{
  "action": "create_excel",
  "parameters": {
    "filename": "Q3_Report.xlsx",
    "template": "kpi_dashboard",
    "row_count": 25,
    "theme": "emerald"
  }
}
```
*Note: Calling `POST /agent/run` with `"stream": true` produces the exact same streaming response.*

#### Emitted SSE Events:
- `event: start` -> Action start notification
- `event: status` -> Step progress (`"step": 1, "message": "Rendering workbook..."`)
- `event: file_created` -> Details of the newly created Excel/Word/CSV file
- `event: complete` -> Full result payload and summary

---

### C. Skills Execution Stream (`POST /skills/run/stream`)
Streams execution of instructional skills step-by-step.
- **URL:** `POST http://localhost:8001/skills/run/stream`
- **Request Body:**
```json
{
  "skill_id": "word_executive_report",
  "parameters": {
    "filename": "Operational_Review.docx",
    "document_title": "Q3 Executive Performance Review",
    "theme": "corporate_blue"
  }
}
```

#### Emitted SSE Events:
- `event: start` -> Skill metadata (ID, category, description)
- `event: step` -> Progress (`"step": 1, "status": "Interpreting skill instructions..."`)
- `event: log` -> Execution diagnostic logs
- `event: file_created` -> Download links and file sizes
- `event: complete` -> Final result object and execution duration

---

## 🛠️ 3. Skills Engine API Reference (`/skills`)

Skills are instructional templates that tell the sandbox agent how to perform complex workflows.

### Endpoints:
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/skills` | List all available skills (built-in and custom) |
| `GET` | `/skills/{skill_id}` | Retrieve schema & instructions for a specific skill |
| `POST` | `/skills` | Register a new custom reusable skill |
| `DELETE` | `/skills/{skill_id}` | Remove a custom skill (built-ins are protected) |
| `POST` | `/skills/run` | Execute a skill synchronously |
| `POST` | `/skills/run/stream` | Execute a skill with real-time SSE streaming |

### Pre-Installed Core Skills:
1. `excel_kpi_dashboard`: Generates styled executive multi-tab KPI Excel workbook.
2. `word_executive_report`: Generates styled Word report with KPI cards, callouts & tables.
3. `word_goal_action_plan`: Generates milestone roadmaps & accountability documents.
4. `excel_financial_tracker`: Generates budget & expense tracker with variance formulas.
5. `data_clean_and_profile`: Automated profiling, outlier detection, and clean CSV.
6. `custom_instruction_execution`: Flexible runner accepting arbitrary natural language task instructions.

### Registering a Custom Skill Example:
```bash
POST /skills
Content-Type: application/json

{
  "id": "weekly_sprint_digest",
  "name": "Weekly Sprint Digest",
  "category": "word",
  "description": "Compiles sprint tasks into a formatted weekly executive digest Word doc.",
  "instructions": "1. Ingest task list.\n2. Calculate completed vs blocked tasks.\n3. Render Executive Word Document with KPI cards.\n4. Save to output/.",
  "parameters_schema": {
    "filename": {"type": "string"},
    "sprint_name": {"type": "string"}
  },
  "output_format": "word"
}
```

---

## 📊 4. Excel Tools API Reference (`/excel`)

### Endpoints:
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/excel/create` | Create styled multi-sheet Excel file (.xlsx) |
| `POST` | `/excel/inspect` | Inspect sheet names, dimensions, columns, and previews |
| `POST` | `/excel/analyze` | Statistical column profiling & IQR anomaly detection on sheets |
| `POST` | `/excel/convert-to-csv` | Extract a specific Excel sheet and save as CSV |

### Supported Themes:
`"corporate_blue"` (Navy/Blue), `"emerald"` (Deep Green), `"slate"` (Slate/Steel), `"violet"` (Purple/Violet), `"amber"` (Amber/Gold).

### Creating an Excel File Example:
```bash
POST /excel/create
Content-Type: application/json

{
  "filename": "Q3_Financial_Plan.xlsx",
  "document_title": "Quarterly Financial Analysis 2026",
  "theme": "emerald",
  "sheets": [
    {
      "title": "Revenue_Summary",
      "columns": ["Region", "Q1 Actual", "Q2 Actual", "Target", "Growth %"],
      "rows": [
        ["North America", 120000, 145000, 150000, 0.208],
        ["Europe", 85000, 92000, 95000, 0.082],
        ["Asia Pacific", 64000, 81000, 80000, 0.265]
      ],
      "column_formats": {
        "Q1 Actual": "currency_integer",
        "Q2 Actual": "currency_integer",
        "Target": "currency_integer",
        "Growth %": "percent"
      },
      "summary_row": {
        "Q1 Actual": "SUM",
        "Q2 Actual": "SUM",
        "Target": "SUM",
        "Growth %": "AVERAGE"
      },
      "zebra_stripes": true
    }
  ]
}
```

---

## 📄 5. Word Tools API Reference (`/word`)

### Endpoints:
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/word/create` | Create styled Microsoft Word (.docx) document |
| `POST` | `/word/inspect` | Extract headings, paragraph count, word count, tables |
| `POST` | `/word/read` | Extract full text and tables formatted as clean Markdown |
| `POST` | `/word/extract-tables` | Extract all embedded tables into structured JSON arrays |

### Creating a Word Document Example:
```bash
POST /word/create
Content-Type: application/json

{
  "filename": "Quarterly_Review.docx",
  "document_title": "Strategic Performance Briefing",
  "subtitle": "Q3 Engineering & Product Operations",
  "author": "Architecture Team",
  "theme": "corporate_blue",
  "sections": [
    {
      "heading": "Executive Summary",
      "level": 1,
      "paragraphs": ["All major milestones are tracking within normal parameters."],
      "kpis": [
        {"metric": "Sprint Completion", "value": "94%", "subtitle": "+4% vs Q2"},
        {"metric": "Open Blockers", "value": "0", "subtitle": "All risks resolved"}
      ],
      "callout": "Leadership Note: Phase 2 deployment is ahead of schedule."
    },
    {
      "heading": "Action Items",
      "level": 2,
      "numbered_list": [
        "Complete QA hardening of streaming SSE endpoints.",
        "Deploy Docker container update to staging environment."
      ]
    }
  ]
}
```

---

## 📥 6. File Management Updates

1. **Upload Support (`POST /files/upload`)**:
   - Supports: `.csv`, `.tsv`, `.xlsx`, `.xls`, `.docx`, `.doc`, `.json`, `.py`, `.txt`.
2. **Download MIME Types (`GET /files/download/{folder}/{filename}`)**:
   - `.xlsx`: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - `.xls`: `application/vnd.ms-excel`
   - `.docx`: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - `.doc`: `application/msword`
3. **Text Extraction (`GET /files/raw/{folder}/{filename}`)**:
   - For `.docx`: Automatically parses text into clean Markdown.
   - For `.xlsx`: Automatically extracts sheet tables into Markdown grids.

---

## 💻 7. Node.js / NestJS Backend Integration Snippet

If your orchestrator backend (e.g. port 3002) proxies streaming events from `sandbox-service` to the frontend:

```typescript
import { Response } from "express";

async function proxySandboxStream(reqPayload: any, clientRes: Response) {
  // Set standard SSE response headers
  clientRes.setHeader("Content-Type", "text/event-stream");
  clientRes.setHeader("Cache-Control", "no-cache");
  clientRes.setHeader("Connection", "keep-alive");
  clientRes.flushHeaders?.();

  const sandboxRes = await fetch("http://localhost:8001/agent/run/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqPayload),
  });

  if (!sandboxRes.body) {
    clientRes.status(502).end();
    return;
  }

  const reader = sandboxRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    clientRes.write(value);
    clientRes.flush?.();
  }
  clientRes.end();
}
```

---

## ✅ 8. Verification Checklist
- [x] Run unit test suite: `python -m unittest discover tests` (30/30 tests passing).
- [x] Verify Swagger UI is available at `http://localhost:8001/docs`.
- [x] Verify `/health` reports `skills_instruction_engine` and version `2.0.0`.
- [x] Test streaming endpoint with `curl` or `fetch`:
  ```bash
  curl -N -X POST http://localhost:8001/execute/stream \
    -H "Content-Type: application/json" \
    -d '{"code": "print(123)"}'
  ```

