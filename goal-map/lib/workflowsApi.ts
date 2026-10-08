export type WorkflowNodeType = "input" | "agent" | "tool" | "condition" | "output";
export type WorkflowPosition = { x: number; y: number };

export type WorkflowAgentType = "prompt_agent" | "function_call_agent" | "sandbox_agent";
export type WorkflowToolType =
  | "knowledge_base_search"
  | "knowledge_base_document_search"
  | "rag"
  | "http"
  | "mcp";

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

export type WorkflowNode = {
  name: string;
  type: WorkflowNodeType;
  position: WorkflowPosition;

  // Agent node fields
  agentType?: WorkflowAgentType | string;
  provider?: "groq" | "mistral" | string;
  model?: string;
  prompt?: string;
  tools?: string[];

  // Sandbox Agent fields
  action?: SandboxActionType | string;
  code?: string;
  parameters?: SandboxNodeParameters;

  // Tool node fields
  tool?: WorkflowToolType | string;
  input?: Record<string, unknown>;
  settings?: Record<string, unknown>;

  // Condition node field
  expression?: string;

  // Output node field
  value?: string;

  [key: string]: unknown;
};

export type WorkflowEdge = {
  from: string;
  to: string;
  when?: string;
};

export type Workflow = {
  workflowId: string;
  ownerId: string;
  name: string;
  description?: string;
  status: "draft" | "published";
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRegistry = {
  nodeTypes: { type: WorkflowNodeType; label: string; category: string }[];
  agentTypes: {
    type: WorkflowAgentType | string;
    description?: string;
    actions?: {
      action: SandboxActionType | string;
      description?: string;
      parameters?: Record<string, unknown>;
    }[];
  }[];
  toolTypes: {
    type: WorkflowToolType | string;
    kind: "built_in" | "planned" | "configured" | string;
    description?: string;
  }[];
};

export interface CreateWorkflowParams {
  name: string;
  ownerId?: string;
  description?: string;
  status?: "draft" | "published";
  version?: number;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export type NewWorkflow = CreateWorkflowParams;

export interface UpdateWorkflowParams {
  version?: number | string;
  name?: string;
  description?: string;
  status?: Workflow["status"];
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export type WorkflowUpdate = UpdateWorkflowParams;

export interface DeleteWorkflowResponse {
  message: string;
  workflowId: string;
  deletedWorkflow?: Workflow;
}

export type WorkflowChatRequest = {
  workflowName: string;
  workflowOwnerId?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  stream?: false;
};

export type WorkflowCitation = {
  documentId: string;
  title?: string;
  excerpt: string;
  score: number;
};

export type WorkflowTraceItem = {
  nodeName: string;
  nodeType: WorkflowNodeType;
  status: "completed" | string;
  durationMs: number;
  output: Record<string, unknown>;
};

export type WorkflowChatResponse = {
  workflow: {
    workflowId: string;
    name: string;
    version: number;
  };
  run: {
    runId: string;
    status: "completed" | string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  response: {
    message: string;
    finalNode: { name: string; type: string };
    outputs: Record<string, unknown>;
    citations: WorkflowCitation[];
  };
  trace: WorkflowTraceItem[];
};

const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
export const DEFAULT_OWNER_ID =
  process.env.NEXT_PUBLIC_KNOWLEDGE_BASE_OWNER_ID ?? "default-owner";

export class WorkflowApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "WorkflowApiError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function remapLegacyReferences(value: unknown, idToName: Map<string, string>): unknown {
  if (typeof value === "string") {
    let mapped = value;
    for (const [id, name] of idToName) mapped = mapped.split(`{{${id}.`).join(`{{${name}.`);
    return mapped;
  }
  if (Array.isArray(value)) return value.map((item) => remapLegacyReferences(item, idToName));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, remapLegacyReferences(item, idToName)])
    );
  }
  return value;
}

export function normalizeWorkflow(value: unknown): Workflow {
  const raw = asRecord(value);
  const legacyDefinition = asRecord(raw.definition);
  const sourceNodes = Array.isArray(raw.nodes)
    ? raw.nodes
    : Array.isArray(legacyDefinition.nodes)
    ? legacyDefinition.nodes
    : [];

  const idToName = new Map<string, string>();
  for (const [index, val] of sourceNodes.entries()) {
    const node = asRecord(val);
    const name =
      typeof node.name === "string" && node.name.trim()
        ? node.name.trim()
        : typeof node.id === "string" && node.id
        ? node.id
        : `Node ${index + 1}`;
    if (typeof node.id === "string") idToName.set(node.id, name);
  }

  const nodes: WorkflowNode[] = sourceNodes.map((val, index) => {
    const node = asRecord(val);
    const oldConfig = asRecord(node.config);
    const config = Object.keys(oldConfig).length ? oldConfig : node;
    const type = ["input", "agent", "tool", "condition", "output"].includes(String(node.type))
      ? (node.type as WorkflowNodeType)
      : "tool";
    const position = asRecord(node.position);
    const oldPosition = asRecord(oldConfig.__position);

    const fields: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(config)) {
      if (["id", "name", "type", "position", "config", "__position"].includes(key)) continue;
      if (key === "toolType") fields.tool = field;
      else fields[key] = field;
    }

    if (
      type === "agent" &&
      typeof fields.agentType === "string" &&
      !["prompt_agent", "function_call_agent", "sandbox_agent"].includes(fields.agentType)
    ) {
      fields.agentType = "prompt_agent";
    }

    const name =
      typeof node.name === "string" && node.name.trim()
        ? node.name.trim()
        : typeof node.id === "string" && node.id
        ? node.id
        : `Node ${index + 1}`;

    return {
      ...(remapLegacyReferences(fields, idToName) as Record<string, unknown>),
      name,
      type,
      position: {
        x:
          typeof position.x === "number"
            ? position.x
            : typeof oldPosition.x === "number"
            ? oldPosition.x
            : index * 280 + 100,
        y:
          typeof position.y === "number"
            ? position.y
            : typeof oldPosition.y === "number"
            ? oldPosition.y
            : 180,
      },
    } as WorkflowNode;
  });

  const sourceEdges = Array.isArray(raw.edges)
    ? raw.edges
    : Array.isArray(legacyDefinition.edges)
    ? legacyDefinition.edges
    : [];

  const edges: WorkflowEdge[] = sourceEdges.map((val) => {
    const edge = asRecord(val);
    const from = String(edge.from ?? "");
    const to = String(edge.to ?? "");
    return {
      from: idToName.get(from) || from,
      to: idToName.get(to) || to,
      ...(typeof edge.when === "string" ? { when: edge.when } : {}),
    };
  });

  return {
    workflowId: String(raw.workflowId || ""),
    ownerId: String(raw.ownerId || DEFAULT_OWNER_ID),
    name: String(raw.name || "Untitled workflow"),
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    status: raw.status === "published" ? "published" : "draft",
    version: typeof raw.version === "number" ? raw.version : 1,
    nodes,
    edges,
    createdAt: String(raw.createdAt || ""),
    updatedAt: String(raw.updatedAt || ""),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API) {
    throw new WorkflowApiError("Add NEXT_PUBLIC_API_URL to connect to the workflow API.", 0);
  }
  const response = await fetch(`${API}${path}`, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    const body = await response.text();
    if (body) {
      try {
        const data = JSON.parse(body) as { message?: string | string[]; error?: string };
        message = data.message
          ? Array.isArray(data.message)
            ? data.message.join(" · ")
            : data.message
          : data.error || body;
      } catch {
        message = body;
      }
    }
    throw new WorkflowApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export const workflowsApi = {
  list: async (params?: { ownerId?: string; skip?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.ownerId) searchParams.set("ownerId", params.ownerId);
    if (typeof params?.skip === "number") searchParams.set("skip", String(params.skip));
    if (typeof params?.limit === "number") searchParams.set("limit", String(params.limit));

    const qs = searchParams.toString();
    const endpoint = `/workflows${qs ? `?${qs}` : ""}`;
    const result = await request<unknown>(endpoint);
    return Array.isArray(result) ? result.map(normalizeWorkflow) : [];
  },

  registry: () => request<WorkflowRegistry>("/workflows/registry"),

  get: async (id: string) =>
    normalizeWorkflow(await request<unknown>(`/workflows/${encodeURIComponent(id)}`)),

  create: async (payload: CreateWorkflowParams, owner?: string) =>
    normalizeWorkflow(
      await request<unknown>("/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: payload.ownerId || owner || DEFAULT_OWNER_ID,
          status: payload.status || "draft",
          nodes: payload.nodes || [],
          edges: payload.edges || [],
          ...payload,
        }),
      })
    ),

  update: async (id: string, payload: UpdateWorkflowParams) =>
    normalizeWorkflow(
      await request<unknown>(`/workflows/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    ),

  delete: async (id: string): Promise<DeleteWorkflowResponse> => {
    const res = await request<{ message: string; workflowId: string; deletedWorkflow?: unknown }>(
      `/workflows/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    return {
      message: res.message,
      workflowId: res.workflowId,
      deletedWorkflow: res.deletedWorkflow ? normalizeWorkflow(res.deletedWorkflow) : undefined,
    };
  },

  runChat: async (payload: WorkflowChatRequest): Promise<WorkflowChatResponse> =>
    request<WorkflowChatResponse>("/genAI/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        stream: false,
      }),
    }),
};
