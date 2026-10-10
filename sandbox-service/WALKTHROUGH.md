# Architectural Walkthrough & Code Changes 🧠💡

> **Purpose:** This document is written specifically for you to understand **what was built**, **why it was designed this way**, and **how it works under the hood**, keeping you 100% in the loop of your codebase.

---

## 🎯 1. The Big Picture: What We Solved

Previously, the **`sandbox-service`** was a synchronous tool primarily focused on CSV creation and isolated Python execution. However, in production and modern AI workflows:
1. **Long-running tasks timed out or hung without feedback**: When agents generate reports, crunch data, or run code, synchronous requests block for seconds or minutes with zero live visibility.
2. **Lack of instructional task templates ("Skills")**: Agents had to manually craft low-level code or payloads for every task instead of leveraging reusable, instruction-driven recipes.
3. **Restricted to CSV/Text**: Business and executive workflows rely on formatted **Excel spreadsheets (`.xlsx`)** and **Word documents (`.docx`)** with styling, tables, formulas, and KPI cards.

We upgraded the sandbox service to **v2.0.0**, equipping it with:
- **Real-Time Streaming (SSE)** for all long-running processes (Python, agent tools, and skills).
- An **Instructional Skills Engine** with 6 built-in skills and dynamic custom registration.
- Full **Excel (`.xlsx`, `.xls`)** reading, statistical analysis, and professional generation with formulas & palettes.
- Full **Word (`.docx`, `.doc`)** reading, table extraction, and executive document generation with KPI cards & callout boxes.
- Seamless frontend integration in **`goal-map`** with file format badges and streaming consumption helpers.

---

## 🏗️ 2. Architectural Blueprint

```
                      ┌───────────────────────────────────────┐
                      │    Goal-Map UI / Backend Agent        │
                      └───────┬───────────────────────┬───────┘
                              │ HTTP REST             │ SSE Stream (text/event-stream)
                              ▼                       ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │                      FastAPI Application (app/main.py)                 │
    │  Endpoints: /execute, /agent/run, /skills, /excel, /word, /files       │
    └───────┬──────────────┬───────────────┬────────────────┬────────────────┘
            │              │               │                │
            ▼              ▼               ▼                ▼
   ┌────────────────┐ ┌───────────────┐ ┌──────────────┐ ┌────────────────┐
   │ Sandbox Runner │ │ Skills Engine │ │  Excel Tool  │ │   Word Tool    │
   │ & StreamRunner │ │ (manager.py)  │ │(excel_tool.py│ │ (word_tool.py) │
   │ (Subprocess &  │ │(Instructions, │ │(openpyxl,    │ │ (python-docx,  │
   │  Pipes/Queues) │ │ Registry, SSE)│ │ formulas,    │ │ KPI cards,     │
   │                │ │               │ │ styling)     │ │ tables, md)    │
   └────────┬───────┘ └───────┬───────┘ └──────┬───────┘ └────────┬───────┘
            │                 │                │                  │
            └─────────────────┴────────┬───────┴──────────────────┘
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │ Safe Workspace (app/tools/...) │
                       │    /input/   and   /output/    │
                       └───────────────────────────────┘
```

---

## ⚡ 3. How Real-Time Streaming Works Under the Hood

### The Problem with Long-Running Tasks
If a task takes 10 to 60 seconds (like crunching statistical correlations or building a 5-tab workbook), a traditional HTTP request sits idle. Browsers, load balancers, or proxies (like Nginx, Cloudflare, or AWS ALB) will drop the connection after 15–30 seconds.

### The Solution: Non-Blocking Subprocess Pipes & Server-Sent Events (SSE)
Look at [`app/sandbox/stream_runner.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/sandbox/stream_runner.py):

1. **Subprocess Spawning**:
   The script is written to a temporary file (`_sandbox_run_{id}.py`) and executed with `subprocess.Popen` in unbuffered/line-buffered mode (`bufsize=1`).
2. **Dual-Thread Pipe Reading**:
   Two lightweight background threads are spawned:
   - `t_stdout` reads `process.stdout.readline` line-by-line.
   - `t_stderr` reads `process.stderr.readline` line-by-line.
   Both threads push incoming lines into a thread-safe `queue.Queue`.
3. **SSE Generator Loop**:
   The FastAPI `StreamingResponse` consumes from this queue with a non-blocking timeout (`0.15s`):
   - Whenever stdout or stderr appears, it formats a W3C-compliant SSE chunk:
     ```text
     event: stdout
     data: {"line": "Calculating summary statistics...", "timestamp_ms": 142.0}
     ```
   - If the queue is quiet for more than 3 seconds while the process is still computing, it emits a heartbeat comment:
     ```text
     : keep-alive 6.0s
     ```
     This keeps HTTP connections alive through any corporate firewall or proxy.
4. **File Tracking & Completion**:
   When the process exits, newly created files in `output/` are detected and emitted via `event: file_created`, followed by `event: complete`.

---

## 🧠 4. How the Skills Engine Works

### What is a "Skill"?
A **Skill** represents a structured, reusable recipe for a task. Instead of telling the agent "generate Python code to open openpyxl and make a table", you assign it a named skill or instructional prompt.

Look at [`app/skills/manager.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/skills/manager.py):
Each `SkillDefinition` contains:
- `id`: Unique identifier (e.g. `excel_kpi_dashboard`).
- `name`: Display title (e.g. "Excel KPI Dashboard Builder").
- `category`: Domain (`excel`, `word`, `data_analysis`, `python`, `custom`).
- `instructions`: Plain-text step-by-step rules guiding the execution.
- `parameters_schema`: JSON schema defining input arguments (e.g. filename, theme, row counts).
- `output_format`: Primary artifact created (`excel`, `word`, `csv`, `mixed`).

### Built-in Skills Shipped:
| Skill ID | What it Does | Target File |
|---|---|---|
| `excel_kpi_dashboard` | Executive KPI dashboard with colored banners, currency formatting & formulas | `.xlsx` |
| `word_executive_report` | Executive summary with KPI metric cards, callout highlight & workstream tables | `.docx` |
| `word_goal_action_plan` | Milestone roadmaps, deadlines, and risk mitigation callouts | `.docx` |
| `excel_financial_tracker` | Budget vs. Actual expense tracker with automatic variance & totals formulas | `.xlsx` |
| `data_clean_and_profile` | Statistical profiling, IQR anomaly detection & Markdown data health report | `.csv` / `.xlsx` |
| `custom_instruction_execution` | Dynamic execution of arbitrary natural language instructions | Any |

### Dynamic Custom Skills:
Users or backends can register new skills on the fly via `POST /skills` or pass inline definitions directly inside `POST /skills/run` and `POST /agent/run`.

---

## 📗 5. How Excel Processing & Creation Works

Look at [`app/tools/excel_tool.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/tools/excel_tool.py):

### 1. Ingestion & Sheet Inspection (`inspect_file`)
- Opens the workbook safely using `with pd.ExcelFile(path) as excel_file:` so file locks on Windows are immediately released.
- Automatically scans the first 10 rows to detect where the actual tabular header begins (smartly skipping title banners).
- Returns sheet names, row/col counts, column names, and a 10-row preview.

### 2. Sheet Profiling & Analysis (`analyze_sheet`)
- Can analyze any individual worksheet using the statistical profiling engine:
  - Numeric columns: min, median, mean, standard deviation, skewness, 25%/75% quantiles.
  - IQR Outlier Detection: flags anomalies outside `[Q1 - 1.5*IQR, Q3 + 1.5*IQR]`.
  - Correlation Matrix: computes Pearson correlations across columns.
  - LLM Markdown Report: generates a structured Markdown report ready for agent consumption.

### 3. Styled Generation (`create_excel`)
- Leverages `openpyxl`:
  - **Themes**: Corporate Blue (`#1E3A8A`), Emerald (`#065F46`), Slate (`#1E293B`), Violet (`#4C1D95`), Amber (`#78350F`).
  - **Header Row**: Filled with theme primary color, white bold text, centered, thin gray cell borders.
  - **Auto Column Widths**: Automatically loops through cell string lengths so column text is never clipped or truncated (`###`).
  - **Number Formatting**: Formats currency (`$#,##0`), percentages (`0.0%`), dates (`yyyy-mm-dd`), and integers (`#,##0`).
  - **Summary Formula Row**: Appends Excel formulas (e.g. `=SUM(D4:D18)`, `=AVERAGE(G4:G18)`) with double-bottom accounting underlines.
  - **Zebra Striping**: Alternates subtle light shading on even rows for maximum readability.

---

## 📘 6. How Word Processing & Creation Works

Look at [`app/tools/word_tool.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/tools/word_tool.py):

### 1. Ingestion, Table Extraction & Markdown (`inspect_file`, `read_text`)
- Opens `.docx` documents and extracts:
  - Document Title & Core Properties (Author, Creation Date).
  - Heading Hierarchy (Heading 1 -> `#`, Heading 2 -> `##`, Heading 3 -> `###`).
  - Paragraphs and bullet/numbered lists.
  - Tables: extracts all tables into structured JSON record arrays AND renders them into Markdown tables (`| Col1 | Col2 |`).
- Agents can read any Word document as clean Markdown text via `POST /word/read`.

### 2. Styled Document Generation (`create_word`)
- Leverages `python-docx` and XML node injection (`parse_xml`):
  - **Title Banner**: 24pt bold title in brand primary color with italic subtitle and author/date metadata line.
  - **KPI Metric Cards**: Renders side-by-side metric boxes with large 18pt bold numbers, subtle borders, and shaded backgrounds.
  - **Callout Highlight Boxes**: Executive takeaway box with thick left accent bar (`w:sz="24"`) and light tint background (`w:fill="EFF6FF"`).
  - **Styled Tables**: Colored header band, white text, subtle horizontal cell dividers, and alternating row zebra shading.

---

## 📂 7. File-by-File Changes Summary

| File | Status | Description |
|---|---|---|
| [`requirements.txt`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/requirements.txt) | **Modified** | Added `openpyxl>=3.1.2` and `python-docx>=1.1.0`. |
| [`app/schemas.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/schemas.py) | **Modified** | Added models for Excel (`CreateExcelRequest`, `ExcelSheetSpec`), Word (`CreateWordRequest`, `WordKpiCard`), Skills (`SkillDefinition`, `SkillRunRequest`), and updated `AgentActionType`. |
| [`app/tools/excel_tool.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/tools/excel_tool.py) | **Created** | Comprehensive tool for inspecting, analyzing, converting, and generating styled Excel spreadsheets. |
| [`app/tools/word_tool.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/tools/word_tool.py) | **Created** | Comprehensive tool for reading, inspecting, extracting tables, and generating executive Word documents. |
| [`app/sandbox/stream_runner.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/sandbox/stream_runner.py) | **Created** | Subprocess pipe reader with background reader threads and W3C SSE generator for real-time Python streaming. |
| [`app/skills/manager.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/skills/manager.py) | **Created** | Skill registry, 6 core built-in skills, custom registration, and synchronous + SSE streaming execution. |
| [`app/skills/__init__.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/skills/__init__.py) | **Created** | Skills module exports. |
| [`app/agent/dispatcher.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/agent/dispatcher.py) | **Modified** | Added actions for Excel, Word, and Skills, plus `dispatch_stream` for live agent event streaming. |
| [`app/tools/file_manager.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/tools/file_manager.py) | **Modified** | Enhanced `read_file` to automatically extract readable Markdown from `.docx` and `.xlsx` files. |
| [`app/main.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/app/main.py) | **Modified** | Exposed 12+ new endpoints for streaming, skills, Excel, Word, and updated file download MIME types. |
| [`tests/test_excel_tool.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/tests/test_excel_tool.py) | **Created** | Unit tests for Excel creation, inspection, profiling, formulas, and conversion. |
| [`tests/test_word_tool.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/tests/test_word_tool.py) | **Created** | Unit tests for Word creation, headings, KPI cards, tables, inspection, and markdown extraction. |
| [`tests/test_skills.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/tests/test_skills.py) | **Created** | Unit tests for listing skills, registering custom skills, running skills sync and streaming. |
| [`tests/test_streaming.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/tests/test_streaming.py) | **Created** | Unit tests for Python code execution streaming and agent dispatcher streaming. |
| [`tests/test_api.py`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/sandbox-service/tests/test_api.py) | **Modified** | End-to-end integration tests verifying all new REST & SSE streaming endpoints. |
| [`goal-map/lib/sandboxApi.ts`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/goal-map/lib/sandboxApi.ts) | **Modified** | Extended `SandboxActionType`, added `streamSandboxExecution`, `streamSandboxAgent`, and `listSandboxSkills`. |
| [`goal-map/components/ChatInput.tsx`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/goal-map/components/ChatInput.tsx) | **Modified** | Added `.docx`, `.doc`, `.xlsx`, and `.xls` to file upload accept list. |
| [`goal-map/components/ChatMessage.tsx`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/goal-map/components/ChatMessage.tsx) | **Modified** | Added visual file badges (`EXCEL`, `WORD`, `CSV/DATA`) with matching theme colors. |
| [`goal-map/lib/workflowsApi.ts`](file:///c:/Users/Neeraj/Desktop/GenAI-GoalsMaps/goal-map/lib/workflowsApi.ts) | **Modified** | Extended workflow node action types and parameters for Office & Skills. |

---

## 🧪 8. Test Suite Verification

Run the test suite at any time from `sandbox-service/`:
```bash
python -m unittest discover tests
```

### Result:
```text
Ran 30 tests in 6.343s
OK
```
All 30 unit and integration tests execute and pass cleanly on Windows and Linux!

---

## 🚀 9. Quick Hands-On Examples to Try Right Now

### Test 1: Generate an Excel KPI Dashboard
```bash
curl -X POST http://localhost:8001/excel/create \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "My_First_Dashboard.xlsx",
    "document_title": "Executive Milestone Scorecard",
    "template": "kpi_dashboard",
    "theme": "emerald"
  }'
```
Then download and open it in Microsoft Excel or Google Sheets:
`http://localhost:8001/files/download/output/My_First_Dashboard.xlsx`

---

### Test 2: Generate an Executive Word Report
```bash
curl -X POST http://localhost:8001/word/create \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "My_First_Report.docx",
    "document_title": "Strategic Operational Brief",
    "template": "executive_summary",
    "theme": "corporate_blue"
  }'
```
Download and open in Microsoft Word:
`http://localhost:8001/files/download/output/My_First_Report.docx`

---

### Test 3: Watch Real-Time Python Streaming
```bash
curl -N -X POST http://localhost:8001/execute/stream \
  -H "Content-Type: application/json" \
  -d '{
    "code": "import time\nfor i in range(1, 4):\n    print(f\"Processing step {i}/3...\")\n    time.sleep(1)\nprint(\"Complete!\")"
  }'
```
You will see the events stream into your console in real time as each step executes!

