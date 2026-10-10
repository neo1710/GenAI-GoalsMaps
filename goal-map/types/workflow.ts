/**
 * Workflow and Sandbox Agent TypeScript Types
 * Compatible with backend /workflows and /genAI/chat streaming APIs
 */

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
  | "list_files"
  | "create_excel"
  | "inspect_excel"
  | "analyze_excel"
  | "convert_excel_to_csv"
  | "create_word"
  | "inspect_word"
  | "read_word"
  | "extract_word_tables"
  | "run_skill"
  | "list_skills"
  | "get_skill"
  | "read_file_raw";

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

  // Excel & Word parameters
  document_title?: string;
  subtitle?: string;
  author?: string;
  theme?: string;
  sheet_name?: string;
  sheets?: Array<Record<string, unknown>>;
  tables?: Array<Record<string, unknown>>;

  // Skills parameters
  skill_id?: string;
  instructions?: string;

  [key: string]: unknown;
}

export interface WorkflowNode {
  name: string;
  type: WorkflowNodeType;
  position: WorkflowPosition;

  agentType?: WorkflowAgentType | string;
  provider?: "groq" | "mistral" | string;
  model?: string;
  prompt?: string;
  tools?: string[];

  // Sandbox Agent fields
  action?: SandboxActionType | string;
  code?: string;
  parameters?: SandboxNodeParameters | Record<string, unknown>;

  tool?: WorkflowToolType | string;
  input?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  expression?: string;
  value?: string;

  [key: string]: unknown;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  when?: string;
}

export interface Workflow {
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
}

export interface WorkflowRegistryAction {
  action: SandboxActionType | string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface WorkflowRegistry {
  nodeTypes: { type: WorkflowNodeType; label: string; category: string }[];
  agentTypes: {
    type: WorkflowAgentType | string;
    description?: string;
    actions?: WorkflowRegistryAction[];
  }[];
  toolTypes: {
    type: WorkflowToolType | string;
    kind: "built_in" | "planned" | "configured" | string;
    description?: string;
  }[];
}

export interface CreateWorkflowParams {
  name: string;
  ownerId?: string;
  description?: string;
  status?: "draft" | "published";
  version?: number;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export interface UpdateWorkflowParams {
  version?: number | string;
  name?: string;
  description?: string;
  status?: Workflow["status"];
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export interface DeleteWorkflowResponse {
  message: string;
  workflowId: string;
  deletedWorkflow?: Workflow;
}

export interface WorkflowChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface WorkflowChatRequest {
  workflowName: string;
  workflowOwnerId?: string;
  messages: WorkflowChatMessage[];
  stream?: boolean;
}

export interface WorkflowCitation {
  documentId: string;
  title?: string;
  excerpt: string;
  score: number;
}

export interface WorkflowTraceItem {
  nodeName: string;
  nodeType: WorkflowNodeType | string;
  status: "completed" | "running" | "error" | string;
  durationMs: number;
  output: Record<string, unknown>;
}

export interface WorkflowChatResponse {
  workflow: {
    workflowId: string;
    name: string;
    version: number;
  };
  run: {
    runId: string;
    status: "completed" | string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
  };
  response: {
    message: string;
    finalNode: { name: string; type: string };
    outputs: Record<string, unknown>;
    citations: WorkflowCitation[];
  };
  trace: WorkflowTraceItem[];
}

/**
 * Workflow Live SSE Streaming Event Types
 */
export type WorkflowStreamEventType =
  | "workflow_start"
  | "node_start"
  | "token"
  | "chunk"
  | "status"
  | "step"
  | "stdout"
  | "stderr"
  | "file_created"
  | "log"
  | "node_complete"
  | "workflow_complete"
  | "error";

export interface WorkflowStartEventData {
  workflow?: {
    workflowId: string;
    name: string;
    version?: number;
  };
  run?: {
    runId: string;
    startedAt?: string;
    status?: string;
  };
  [key: string]: unknown;
}

export interface NodeStartEventData {
  nodeName: string;
  nodeType: string;
  agentType?: string;
  [key: string]: unknown;
}

export interface NodeTokenEventData {
  nodeName?: string;
  token?: string;
  chunk?: string;
  content?: string;
  text?: string;
  delta?: { content?: string; text?: string };
  choices?: Array<{ delta?: { content?: string }; text?: string }>;
  [key: string]: unknown;
}

export interface SandboxLiveEventData {
  nodeName: string;
  message?: string;
  step?: string;
  status?: string;
  file_path?: string;
  filename?: string;
  files_created?: string[];
  stdout?: string;
  stderr?: string;
  log?: string;
  [key: string]: unknown;
}

export interface NodeCompleteEventData {
  nodeName: string;
  nodeType: string;
  durationMs?: number;
  output?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkflowStreamEvent {
  event: WorkflowStreamEventType | string;
  data:
    | WorkflowStartEventData
    | NodeStartEventData
    | NodeTokenEventData
    | SandboxLiveEventData
    | NodeCompleteEventData
    | WorkflowChatResponse
    | Record<string, unknown>
    | string;
}

