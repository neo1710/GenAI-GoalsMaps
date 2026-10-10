export * from "@/types/workflow";
import type {
  WorkflowNodeType,
  WorkflowPosition,
  WorkflowAgentType,
  WorkflowToolType,
  SandboxActionType,
  SyntheticTemplateType,
  SandboxNodeParameters,
  WorkflowNode,
  WorkflowEdge,
  Workflow,
  WorkflowRegistry,
  CreateWorkflowParams,
  UpdateWorkflowParams,
  DeleteWorkflowResponse,
  WorkflowChatRequest,
  WorkflowCitation,
  WorkflowTraceItem,
  WorkflowChatResponse,
  WorkflowStreamEvent,
} from "@/types/workflow";


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

  runChatStream: async (
    payload: WorkflowChatRequest,
    onEvent: (event: WorkflowStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<WorkflowChatResponse> =>
    streamWorkflowChat(API, payload, onEvent, signal),
};

/**
 * Executes a workflow with real-time Server-Sent Events (SSE) streaming.
 * Handles node-by-node live events:
 * - workflow_start: metadata and runId
 * - node_start: nodeName and nodeType
 * - token / chunk: LLM response tokens
 * - status, step, stdout, stderr, file_created, log: Sandbox agent real-time updates
 * - node_complete: node finish with output and duration
 * - workflow_complete: final payload with response, trace, citations
 * - data: [DONE]: End-of-stream signal
 */
export async function streamWorkflowChat(
  apiUrl: string,
  requestBody: WorkflowChatRequest,
  onEvent: (event: WorkflowStreamEvent) => void,
  signal?: AbortSignal
): Promise<WorkflowChatResponse> {
  const base = apiUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/genAI/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      ...requestBody,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    let msg = `Workflow streaming request failed (${response.status})`;
    try {
      const err = await response.json();
      msg = err.message
        ? Array.isArray(err.message)
          ? err.message.join(" · ")
          : err.message
        : err.error || msg;
    } catch {
      try {
        const txt = await response.text();
        if (txt) msg = txt;
      } catch {}
    }
    throw new WorkflowApiError(msg, response.status);
  }

  if (!response.body) {
    throw new WorkflowApiError("Workflow stream response body is null", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  let finalResponse: WorkflowChatResponse | null = null;
  const accumulatedTrace: WorkflowTraceItem[] = [];
  const accumulatedOutputs: Record<string, unknown> = {};
  let accumulatedMessage = "";
  let lastNode: { name: string; type: string } = { name: "", type: "" };
  let workflowMeta = { workflowId: "", name: requestBody.workflowName, version: 1 };
  let runMeta = { runId: "", status: "completed", durationMs: 0, startedAt: "", completedAt: "" };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (!part.trim() || part.startsWith(":")) continue;

        const lines = part.split("\n");
        let eventType = "";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const val = line.slice(6).trim();
            dataStr = dataStr ? `${dataStr}\n${val}` : val;
          }
        }

        if (dataStr === "[DONE]") {
          continue;
        }

        if (dataStr) {
          let parsedData: any = dataStr;
          try {
            parsedData = JSON.parse(dataStr);
          } catch {
            // Keep raw string if non-JSON
          }

          // If no event: header was supplied, detect event type from payload
          if (!eventType) {
            if (
              parsedData?.choices ||
              parsedData?.delta ||
              typeof parsedData?.token === "string" ||
              typeof parsedData?.chunk === "string"
            ) {
              eventType = "token";
            } else if (parsedData?.workflow && parsedData?.run && parsedData?.response) {
              eventType = "workflow_complete";
            } else if (parsedData?.nodeName && parsedData?.nodeType && parsedData?.output) {
              eventType = "node_complete";
            } else if (parsedData?.nodeName && parsedData?.nodeType) {
              eventType = "node_start";
            } else {
              eventType = "message";
            }
          }

          // Process state tracking
          if (eventType === "workflow_start") {
            if (parsedData?.workflow) workflowMeta = { ...workflowMeta, ...parsedData.workflow };
            if (parsedData?.run) runMeta = { ...runMeta, ...parsedData.run };
          } else if (eventType === "node_start") {
            if (parsedData?.nodeName) {
              lastNode = { name: parsedData.nodeName, type: parsedData.nodeType || "agent" };
            }
          } else if (eventType === "token" || eventType === "chunk") {
            const tokenText =
              parsedData?.content ??
              parsedData?.token ??
              parsedData?.chunk ??
              parsedData?.delta?.content ??
              parsedData?.choices?.[0]?.delta?.content ??
              parsedData?.choices?.[0]?.text ??
              (typeof parsedData === "string" ? parsedData : "");
            if (tokenText) {
              accumulatedMessage += tokenText;
            }
          } else if (eventType === "node_complete") {
            if (parsedData?.nodeName) {
              lastNode = { name: parsedData.nodeName, type: parsedData.nodeType || "agent" };
              accumulatedTrace.push({
                nodeName: parsedData.nodeName,
                nodeType: parsedData.nodeType || "agent",
                status: parsedData.status || "completed",
                durationMs: Number(parsedData.durationMs ?? 0),
                output: (parsedData.output as Record<string, unknown>) || {},
              });
              if (parsedData.output) {
                accumulatedOutputs[parsedData.nodeName] = parsedData.output;
                // If output contains message or answer and accumulatedMessage is empty, grab it
                if (!accumulatedMessage && typeof parsedData.output.message === "string") {
                  accumulatedMessage = parsedData.output.message;
                } else if (!accumulatedMessage && typeof parsedData.output.answer === "string") {
                  accumulatedMessage = parsedData.output.answer;
                }
              }
            }
          } else if (eventType === "workflow_complete") {
            finalResponse = parsedData as WorkflowChatResponse;
          }

          onEvent({ event: eventType, data: parsedData });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (finalResponse) {
    return finalResponse;
  }

  // Fallback synthesized response if server closed connection cleanly without explicit workflow_complete
  return {
    workflow: workflowMeta,
    run: {
      ...runMeta,
      runId: runMeta.runId || `run-${Date.now()}`,
      status: "completed",
      startedAt: runMeta.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: runMeta.durationMs || 0,
    },
    response: {
      message: accumulatedMessage,
      finalNode: lastNode.name ? lastNode : { name: "Workflow", type: "agent" },
      outputs: accumulatedOutputs,
      citations: [],
    },
    trace: accumulatedTrace,
  };
}

