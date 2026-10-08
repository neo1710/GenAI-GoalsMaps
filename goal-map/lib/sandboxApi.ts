/**
 * Sandbox Agent API & Workspace Client
 * Connects to the isolated Python 3.12 sandbox environment
 */

export type SandboxActionType =
  | "execute_python"
  | "create_synthetic_csv"
  | "analyze_csv"
  | "query_csv"
  | "create_csv"
  | "list_files";

export type SyntheticTemplateType =
  | "goals_and_milestones"
  | "sales_performance"
  | "user_analytics"
  | "timeseries_metrics"
  | "project_tasks";

export interface SandboxNodeParameters {
  // execute_python
  code?: string;
  timeout_seconds?: number;

  // create_synthetic_csv
  filename?: string;
  template?: SyntheticTemplateType | string;
  row_count?: number;
  seed?: number;

  // analyze_csv
  generate_markdown_report?: boolean;
  top_correlations_count?: number;

  // query_csv
  filter_expression?: string;
  columns?: string[];
  sort_by?: string;
  ascending?: boolean;
  limit?: number;
  save_result_to?: string;

  // create_csv
  data?: Array<Record<string, unknown>>;
  delimiter?: string;
}

export interface SandboxAgentOutput {
  success?: boolean;
  action?: SandboxActionType | string;
  summary?: string;
  row_count?: number;
  column_count?: number;
  columns?: string[];
  markdown_report?: string;
  preview?: Array<Record<string, unknown>>;
  files_created?: string[];
  stdout?: string;
  stderr?: string;
  answer?: string;
  [key: string]: unknown;
}

export interface SandboxFileItem {
  name: string;
  size_bytes: number;
  modified_at?: number;
  last_modified?: string;
  folder: "input" | "output";
  relative_path?: string;
}

export interface SandboxFileListResponse {
  input: SandboxFileItem[];
  output: SandboxFileItem[];
  input_files?: SandboxFileItem[];
  output_files?: SandboxFileItem[];
  total_count?: number;
}

export interface SandboxUploadResponse {
  success: boolean;
  filename: string;
  folder: "input" | "output";
  relative_path: string;
  size_bytes: number;
}

export const SYNTHETIC_TEMPLATES_INFO: Record<
  SyntheticTemplateType,
  { label: string; description: string; columns: string }
> = {
  goals_and_milestones: {
    label: "Goals & Milestones",
    description: "Goal tracking with categories, priority, progress %, target dates, owners, and budget",
    columns: "goal_id, title, category, priority, status, progress_pct, target_date, assigned_owner, estimated_budget_usd",
  },
  sales_performance: {
    label: "Sales Performance",
    description: "Transactions, dates, customer names, regions, products, units, unit prices, discounts, and total revenue",
    columns: "transaction_id, date, customer_name, region, product, units_sold, unit_price_usd, discount_pct, total_revenue_usd",
  },
  user_analytics: {
    label: "User Analytics",
    description: "User profiles, signup dates, subscription tiers, session counts, total minutes, and churn risk scores",
    columns: "user_id, signup_date, subscription_plan, sessions_count, total_time_minutes, churn_risk_score",
  },
  timeseries_metrics: {
    label: "Timeseries Metrics",
    description: "Host system metrics: timestamps, host IDs, CPU %, memory %, disk I/O, and health statuses",
    columns: "timestamp, host_id, cpu_utilization_pct, memory_utilization_pct, disk_io_mbps, status",
  },
  project_tasks: {
    label: "Project Tasks",
    description: "Agile sprints, task types, story points, statuses, assigned developers, and hours spent",
    columns: "task_id, sprint_name, title, type, story_points, status, assigned_dev, hours_spent",
  },
};

export const SANDBOX_ACTIONS_INFO: Record<
  SandboxActionType,
  { label: string; icon: string; description: string }
> = {
  create_synthetic_csv: {
    label: "Create Synthetic CSV",
    icon: "✨",
    description: "Generate realistic CSV datasets instantly using built-in domain templates.",
  },
  analyze_csv: {
    label: "Analyze CSV",
    icon: "📊",
    description: "Statistical column profiling, IQR anomaly detection, correlations, and Markdown reports.",
  },
  query_csv: {
    label: "Query CSV",
    icon: "🔍",
    description: "SQL-like filtering, column projection, sorting, and optional saving to new CSV.",
  },
  execute_python: {
    label: "Execute Python Code",
    icon: "🐍",
    description: "Run arbitrary Python 3.12 scripts with pandas and numpy in an isolated sandbox.",
  },
  create_csv: {
    label: "Create CSV from JSON",
    icon: "📝",
    description: "Convert structured JSON record arrays into CSV files in workspace output.",
  },
  list_files: {
    label: "List Workspace Files",
    icon: "📁",
    description: "Inspect all files currently available in the sandbox input/ and output/ directories.",
  },
};

export const PYTHON_CODE_PRESETS = [
  {
    name: "Read CSV & Group Summary",
    code: `import pandas as pd

# Read a dataset from workspace input or output
df = pd.read_csv('output/q3_goals.csv')
print("Dataset Shape:", df.shape)

# Calculate summary by status
summary = df.groupby('status')['progress_pct'].agg(['count', 'mean', 'min', 'max'])
print("\\nProgress Summary by Status:\\n", summary)

# Save result for downstream workflow steps
summary.to_csv('output/status_summary.csv')
print("\\nSaved output/status_summary.csv")`,
  },
  {
    name: "Detect High-Risk Goals",
    code: `import pandas as pd

df = pd.read_csv('output/q3_goals.csv')

# Find goals with progress < 30% that are Critical or High priority
critical = df[(df['progress_pct'] < 30) & (df['priority'].isin(['Critical', 'High']))]

print(f"Found {len(critical)} high-risk goals:")
for _, row in critical.iterrows():
    print(f"- [{row['priority']}] {row['title']} ({row['progress_pct']}% - Owner: {row['assigned_owner']})")

critical.to_csv('output/high_risk_goals.csv', index=False)
print("\\nSaved output/high_risk_goals.csv")`,
  },
  {
    name: "Custom Data Transformation",
    code: `import pandas as pd
import numpy as np

# Load data and add calculated columns
df = pd.read_csv('output/q3_goals.csv')
df['days_remaining'] = np.random.randint(5, 60, size=len(df))
df['is_on_track'] = df['progress_pct'] >= 50

print(df[['title', 'progress_pct', 'days_remaining', 'is_on_track']].head(10))
df.to_csv('output/transformed_goals.csv', index=False)`,
  },
];

/**
 * Returns the base URL for the Sandbox service.
 * Supports NEXT_PUBLIC_SANDBOX_URL, falling back to port 8001 or 8002.
 */
export function getSandboxBaseUrl(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SANDBOX_URL) {
    return process.env.NEXT_PUBLIC_SANDBOX_URL.replace(/\/$/, "");
  }
  // Default to port 8001 as specified in the guide (or fallback)
  return "http://localhost:8001";
}

/**
 * Generates direct download URL for a file in the sandbox environment.
 * Accepts e.g. "output/q3_goals.csv", "input/data.csv", or ("output", "q3_goals.csv")
 */
export function getSandboxDownloadUrl(pathOrFolder: string, filename?: string): string {
  const base = getSandboxBaseUrl();
  let folder = "output";
  let file = pathOrFolder;

  if (filename) {
    folder = pathOrFolder.replace(/^\/+|\/+$/g, "");
    file = filename.replace(/^\/+|\/+$/g, "");
  } else {
    const cleaned = pathOrFolder.replace(/^\/+/, "");
    if (cleaned.startsWith("input/")) {
      folder = "input";
      file = cleaned.replace(/^input\//, "");
    } else if (cleaned.startsWith("output/")) {
      folder = "output";
      file = cleaned.replace(/^output\//, "");
    } else {
      file = cleaned;
    }
  }

  return `${base}/files/download/${folder}/${encodeURIComponent(file)}`;
}

/**
 * Uploads a file to the sandbox service input/ or output/ folder.
 */
export async function uploadSandboxFile(
  file: File,
  folder: "input" | "output" = "input"
): Promise<SandboxUploadResponse> {
  const base = getSandboxBaseUrl();
  const formData = new FormData();
  formData.append("file", file);

  const url = `${base}/files/upload?folder=${encodeURIComponent(folder)}`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let msg = `File upload failed (${response.status})`;
    try {
      const err = await response.json();
      msg = err.detail || err.message || msg;
    } catch {
      msg = await response.text();
    }
    throw new Error(msg);
  }

  return response.json() as Promise<SandboxUploadResponse>;
}

/**
 * Lists all available files in the sandbox workspace.
 */
export async function listSandboxFiles(): Promise<SandboxFileListResponse> {
  const base = getSandboxBaseUrl();
  const response = await fetch(`${base}/files`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to list sandbox files (${response.status})`);
  }

  const raw = await response.json();
  const rawInput = Array.isArray(raw?.input_files)
    ? raw.input_files
    : Array.isArray(raw?.input)
    ? raw.input
    : [];
  const rawOutput = Array.isArray(raw?.output_files)
    ? raw.output_files
    : Array.isArray(raw?.output)
    ? raw.output
    : [];

  const input: SandboxFileItem[] = rawInput.map((f: Record<string, unknown>) => ({
    name: String(f.name || ""),
    size_bytes: Number(f.size_bytes ?? 0),
    modified_at: typeof f.modified_at === "number" ? f.modified_at : 0,
    last_modified: typeof f.last_modified === "string" ? f.last_modified : "",
    folder: "input" as const,
    relative_path: typeof f.relative_path === "string" ? f.relative_path : `input/${f.name}`,
  }));

  const output: SandboxFileItem[] = rawOutput.map((f: Record<string, unknown>) => ({
    name: String(f.name || ""),
    size_bytes: Number(f.size_bytes ?? 0),
    modified_at: typeof f.modified_at === "number" ? f.modified_at : 0,
    last_modified: typeof f.last_modified === "string" ? f.last_modified : "",
    folder: "output" as const,
    relative_path: typeof f.relative_path === "string" ? f.relative_path : `output/${f.name}`,
  }));

  return {
    input,
    output,
    input_files: input,
    output_files: output,
    total_count: typeof raw?.total_count === "number" ? raw.total_count : input.length + output.length,
  };
}

/**
 * Checks if the Sandbox service is reachable.
 */
export async function checkSandboxHealth(): Promise<{ status: string; workspace?: string } | null> {
  try {
    const base = getSandboxBaseUrl();
    const res = await fetch(`${base}/health`, { method: "GET", signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      return (await res.json()) as { status: string; workspace?: string };
    }
    return null;
  } catch {
    return null;
  }
}

