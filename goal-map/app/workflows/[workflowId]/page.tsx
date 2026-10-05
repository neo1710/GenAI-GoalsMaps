"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useSelector } from "react-redux";
import toast, { Toaster } from "react-hot-toast";
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiDatabase,
  FiExternalLink,
  FiGitBranch,
  FiInfo,
  FiLayers,
  FiLoader,
  FiPlay,
  FiPlus,
  FiSave,
  FiSettings,
  FiShare2,
  FiTerminal,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import ThemeToggle from "@/components/ThemeToggle";
import Markdown from "@/components/Markdown";
import { RootState } from "@/store";
import {
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowRegistry,
  WorkflowApiError,
  WorkflowChatResponse,
  workflowsApi,
} from "@/lib/workflowsApi";
import type { ChatModel } from "@/components/ChatInput";

type FlowData = {
  title: string;
  kind: WorkflowNodeType;
  fields: Record<string, unknown>;
  dark: boolean;
};
type FlowNode = Node<FlowData, "workflow">;
type FlowEdge = Edge<{ when?: string }>;

const visuals: Record<WorkflowNodeType, { color: string; icon: string; label: string }> = {
  input: { color: "#0ea5e9", icon: "↳", label: "TRIGGER" },
  agent: { color: "#8b5cf6", icon: "✳", label: "AI AGENT" },
  tool: { color: "#14b8a6", icon: "⌘", label: "TOOL" },
  condition: { color: "#f59e0b", icon: "◇", label: "CONDITION" },
  output: { color: "#10b981", icon: "↗", label: "RESPONSE" },
};

const reservedFields = new Set(["name", "type", "position"]);
function nodeFields(node: WorkflowNode): Record<string, unknown> {
  return Object.fromEntries(Object.entries(node).filter(([key]) => !reservedFields.has(key)));
}

function getNodeRuntimeBadge(kind: WorkflowNodeType, fields: Record<string, unknown>) {
  if (kind === "input") return { label: "Entry point", ready: true };
  if (kind === "agent") {
    const at = String(fields.agentType || "prompt_agent");
    if (at === "prompt_agent") return { label: "Ready", ready: true };
    if (at === "function_call_agent") return { label: "Prompt ready · Tools reserved", ready: true, warning: true };
    if (at === "sandbox_agent") return { label: "501 Planned", ready: false };
    return { label: "Custom agent", ready: true };
  }
  if (kind === "tool") {
    const t = String(fields.tool || "");
    if (t === "knowledge_base_search") return { label: "Ready", ready: true };
    if (t === "knowledge_base_document_search") return { label: "501 Planned", ready: false };
    if (["mcp", "http", "rag"].includes(t)) return { label: "501 Reserved", ready: false };
    return { label: "Tool", ready: false };
  }
  if (kind === "condition") return { label: "501 Planned", ready: false };
  if (kind === "output") return { label: "Optional override", ready: true };
  return { label: "", ready: true };
}

function FlowNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const visual = visuals[data.kind];
  const runtime = getNodeRuntimeBadge(data.kind, data.fields);
  const typeLabel =
    data.kind === "agent"
      ? String(data.fields.agentType || "prompt_agent").replaceAll("_", " ")
      : data.kind === "tool"
      ? String(data.fields.tool || "Choose tool").replaceAll("_", " ")
      : data.kind === "condition"
      ? String(data.fields.expression || "Set an expression")
      : data.kind === "output"
      ? String(data.fields.value || "Terminal override")
      : "Message & conversation context";

  return (
    <div
      className={`min-w-[215px] overflow-hidden rounded-2xl border shadow-lg transition ${
        selected ? "ring-2 ring-blue-500/50" : ""
      } ${
        data.dark
          ? "border-slate-700 bg-slate-900 shadow-black/20"
          : "border-slate-200 bg-white shadow-slate-300/30"
      }`}
    >
      {data.kind !== "input" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
        />
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          style={{ backgroundColor: `${visual.color}18`, color: visual.color }}
          className="grid h-9 w-9 place-items-center rounded-xl text-lg font-bold"
        >
          {visual.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p style={{ color: visual.color }} className="text-[9px] font-extrabold tracking-[.16em]">
              {visual.label}
            </p>
            <span
              className={`rounded px-1.5 py-0.2 text-[8px] font-bold ${
                runtime.ready
                  ? runtime.warning
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-slate-500/15 text-slate-500 dark:text-slate-400"
              }`}
            >
              {runtime.label}
            </span>
          </div>
          <p
            className={`truncate text-sm font-bold ${
              data.dark ? "text-slate-100" : "text-slate-800"
            }`}
          >
            {data.title}
          </p>
        </div>
      </div>
      <div
        className={`flex items-center justify-between border-t px-4 py-2 text-[10px] ${
          data.dark ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-500"
        }`}
      >
        <span className="truncate">{typeLabel}</span>
        {data.kind === "agent" && data.fields.model ? (
          <span className="ml-2 font-mono text-[9px] opacity-70">
            {String(data.fields.model).slice(0, 14)}
          </span>
        ) : null}
      </div>
      {data.kind !== "output" && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
        />
      )}
    </div>
  );
}
const nodeTypes = { workflow: FlowNodeCard };

function toFlow(workflow: Workflow, dark: boolean): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return {
    nodes: workflow.nodes.map((node) => ({
      id: node.name,
      type: "workflow",
      position: node.position,
      data: {
        title: node.name,
        kind: node.type,
        fields: nodeFields(node),
        dark,
      },
    })),
    edges: workflow.edges.map((edge, index) => ({
      id: `edge-${index}-${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      label: edge.when,
      type: "smoothstep",
      style: { stroke: "#8b9bb0", strokeWidth: 2 },
      labelStyle: { fill: "#64748b", fontSize: 11, fontWeight: 700 },
      labelBgStyle: { fill: dark ? "#0f172a" : "#ffffff", fillOpacity: 0.95 },
      data: { when: edge.when },
    })),
  };
}

function fromFlow(nodes: FlowNode[], edges: FlowEdge[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const names = new Map(nodes.map((node) => [node.id, node.data.title.trim()]));
  return {
    nodes: nodes.map((node) => ({
      ...node.data.fields,
      name: node.data.title.trim(),
      type: node.data.kind,
      position: { x: node.position.x, y: node.position.y },
    } as WorkflowNode)),
    edges: edges.map((edge) => ({
      from: names.get(edge.source) || edge.source,
      to: names.get(edge.target) || edge.target,
      ...(typeof edge.data?.when === "string" && edge.data.when
        ? { when: edge.data.when }
        : typeof edge.label === "string" && edge.label
        ? { when: edge.label }
        : {}),
    })),
  };
}

function reachable(start: string, adjacency: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(adjacency.get(current) || []));
  }
  return visited;
}

/**
 * Validates the graph matching the Backend API Specification:
 * - Draft mode (isPublishing = false):
 *   Allows in-progress state, single node or empty graph, and disconnected nodes while designing.
 *   Enforces node name uniqueness, valid types, numeric positions, and DAG acyclicity.
 * - Published mode (isPublishing = true):
 *   Enforces full executable graph rules: exactly 1 input node, at least 1 node following input,
 *   all nodes connected and reachable from input, no incoming input edges, no outgoing output edges.
 */
function validateGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  registry: WorkflowRegistry | null,
  isPublishing = false
): string | null {
  if (!nodes.length) {
    return isPublishing ? "Add workflow nodes before publishing." : null;
  }

  const names = nodes.map((node) => node.data.title.trim());
  if (names.some((name) => !name)) return "Every node needs a non-empty name.";
  if (new Set(names).size !== names.length) return "Node names must be unique.";

  for (const node of nodes) {
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
      return `${node.data.title} needs a valid numeric canvas position.`;
    }
    const fields = node.data.fields;
    if (node.data.kind === "agent") {
      if (!fields.agentType) return `${node.data.title} requires an agentType.`;
      if (
        registry?.agentTypes.length &&
        !registry.agentTypes.some((item) => item.type === fields.agentType)
      ) {
        return `${node.data.title} has an unsupported agentType: "${String(fields.agentType)}".`;
      }
    }
    if (node.data.kind === "tool") {
      if (!fields.tool) return `${node.data.title} requires a tool type.`;
      if (
        registry?.toolTypes.length &&
        !registry.toolTypes.some((item) => item.type === fields.tool)
      ) {
        return `${node.data.title} has an unsupported tool type: "${String(fields.tool)}".`;
      }
    }
    if (
      isPublishing &&
      node.data.kind === "condition" &&
      !(typeof fields.expression === "string" && fields.expression.trim())
    ) {
      return `${node.data.title} requires an expression to publish.`;
    }
    if (
      isPublishing &&
      node.data.kind === "output" &&
      !(typeof fields.value === "string" && fields.value.trim())
    ) {
      return `${node.data.title} requires a response value to publish.`;
    }
  }

  const ids = new Set(nodes.map((node) => node.id));
  const pairs = new Set<string>();
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      return "A connection references a missing node.";
    }
    if (edge.source === edge.target) return "A node cannot connect to itself.";
    const pair = `${edge.source}\u0000${edge.target}`;
    if (pairs.has(pair)) return "Duplicate connections are not allowed.";
    pairs.add(pair);

    const source = nodes.find((node) => node.id === edge.source)!;
    const target = nodes.find((node) => node.id === edge.target)!;
    if (source.data.kind === "output") return "Output nodes cannot have outgoing connections.";
    if (target.data.kind === "input") return "Input nodes cannot have incoming connections.";

    adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target]);
  }

  // Cycle check: topological sort (enforced for both draft and publish)
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }
  const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id);
  let visitedCount = 0;
  while (queue.length) {
    const current = queue.shift()!;
    visitedCount++;
    for (const next of adjacency.get(current) || []) {
      const count = (indegree.get(next) || 0) - 1;
      indegree.set(next, count);
      if (count === 0) queue.push(next);
    }
  }
  if (visitedCount !== nodes.length) {
    return "Cycles are not allowed in a workflow (must be a DAG).";
  }

  // Full executable graph validation only required on publish
  if (isPublishing) {
    const inputNodes = nodes.filter((node) => node.data.kind === "input");
    if (inputNodes.length !== 1) return "A published workflow must have exactly one input node.";
    if (nodes.length < 2) return "A published workflow must have at least one node after the input node.";

    const inputId = inputNodes[0].id;
    const inputOutgoing = adjacency.get(inputId) || [];
    if (inputOutgoing.length === 0) {
      return "The input node must connect to at least one downstream node.";
    }

    const fromInput = reachable(inputId, adjacency);
    if (fromInput.size !== nodes.length) {
      const unreached = nodes.find((n) => !fromInput.has(n.id));
      return `Node "${unreached?.data.title}" is disconnected from the workflow input. All nodes must be connected to publish.`;
    }
  }

  return null;
}

function replaceVariableRefs(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value.split(`{{${from}.`).join(`{{${to}.`);
  if (Array.isArray(value)) return value.map((item) => replaceVariableRefs(item, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceVariableRefs(item, from, to)])
    );
  }
  return value;
}

function WorkflowCanvas({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const dark = useSelector((state: RootState) => state.theme.mode === "dark");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ name: string; description: string } | null>(null);
  const [registry, setRegistry] = useState<WorkflowRegistry | null>(null);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [graphDirty, setGraphDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [sideTab, setSideTab] = useState<"config" | "connections">("config");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState("");

  const [testRunOpen, setTestRunOpen] = useState(false);
  const [testQuery, setTestQuery] = useState("What is our remote work policy?");
  const [testRunning, setTestRunning] = useState(false);
  const [testResponse, setTestResponse] = useState<WorkflowChatResponse | null>(null);
  const [testError, setTestError] = useState<{ status?: number; message: string } | null>(null);
  const [activeTraceNode, setActiveTraceNode] = useState<string | null>(null);

  const { screenToFlowPosition, fitView } = useReactFlow();
  const selected = nodes.find((node) => node.id === selectedId) || null;

  const panel = dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white";
  const card = dark ? "border-slate-800 bg-slate-900" : "border-blue-100 bg-white";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const field = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${
    dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-800"
  }`;
  const connectedEdges = selected
    ? edges.filter((edge) => edge.source === selected.id || edge.target === selected.id)
    : [];

  const loadWorkflow = useCallback(async () => {
    setLoading(true);
    try {
      const [item, choices] = await Promise.all([
        workflowsApi.get(workflowId),
        workflowsApi.registry(),
      ]);
      setWorkflow(item);
      setSavedMeta({ name: item.name, description: item.description || "" });
      setRegistry(choices);
      const flow = toFlow(item, dark);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setSelectedId(null);
      setConflict(false);
      setDirty(false);
      setGraphDirty(false);
      setFieldError("");
    } catch (error) {
      if (error instanceof WorkflowApiError && error.status === 404) {
        toast.error("Workflow not found. Returning to your workflow list.");
        router.replace("/workflows");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not open this workflow");
      }
    } finally {
      setLoading(false);
    }
  }, [workflowId, router, setNodes, setEdges, dark]);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
    if (!api) return;
    fetch(`${api}/genAI/models`)
      .then((response) => (response.ok ? (response.json() as Promise<{ models?: ChatModel[] }>) : null))
      .then((data) => {
        if (Array.isArray(data?.models)) {
          setModels(data.models.filter((model) => model?.id));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selected) {
      setJsonDraft(JSON.stringify(selected.data.fields, null, 2));
      setJsonError("");
    } else {
      setJsonDraft("");
      setJsonError("");
    }
  }, [selectedId, selected]);

  const updateNode = (id: string, patch: Partial<FlowData>) => {
    setNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node))
    );
    setGraphDirty(true);
    setDirty(true);
    setFieldError("");
  };

  const updateFields = (id: string, patch: Record<string, unknown>) => {
    const current = nodes.find((node) => node.id === id);
    if (current) updateNode(id, { fields: { ...current.data.fields, ...patch } });
  };

  const renameNode = (node: FlowNode, newName: string) => {
    const oldName = node.data.title;
    setNodes((current) =>
      current.map((item) => {
        if (item.id === node.id) return { ...item, data: { ...item.data, title: newName } };
        const fields = replaceVariableRefs(item.data.fields, oldName, newName) as Record<string, unknown>;
        if (
          node.data.kind === "tool" &&
          item.data.kind === "agent" &&
          Array.isArray(item.data.fields.tools)
        ) {
          fields.tools = (item.data.fields.tools as unknown[]).map((toolName) =>
            toolName === oldName ? newName : toolName
          );
        }
        return { ...item, data: { ...item.data, fields } };
      })
    );
    setGraphDirty(true);
    setDirty(true);
    setFieldError("");
  };

  const addNode = (type: WorkflowNodeType) => {
    const registryNode = registry?.nodeTypes.find((item) => item.type === type);
    if (!registryNode) return;
    if (type === "input" && nodes.some((node) => node.data.kind === "input")) {
      toast.error("A workflow can have only one input node.");
      return;
    }
    const count = nodes.filter((node) => node.data.kind === type).length + 1;
    const name =
      type === "input"
        ? registryNode.label
        : count === 1
        ? registryNode.label
        : `${registryNode.label} ${count}`;

    const defaultAgent = registry?.agentTypes[0]?.type || "prompt_agent";
    const defaultTool = registry?.toolTypes[0]?.type || "knowledge_base_search";

    const fields: Record<string, unknown> =
      type === "agent"
        ? { agentType: defaultAgent, prompt: "" }
        : type === "tool"
        ? {
            tool: defaultTool,
            input: { query: "{{Question.output.message}}", topK: 5 },
          }
        : type === "condition"
        ? { expression: "" }
        : type === "output"
        ? { value: "" }
        : {};

    const node: FlowNode = {
      id: `node-${crypto.randomUUID()}`,
      type: "workflow",
      position: screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
      data: { title: name, kind: type, fields, dark },
    };
    setNodes((current) => [...current, node]);
    setSelectedId(node.id);
    setGraphDirty(true);
    setDirty(true);
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      if (!source || !target) return;
      if (source.id === target.id) return toast.error("A node cannot connect to itself.");
      if (source.data.kind === "output") return toast.error("Output nodes cannot have outgoing connections.");
      if (target.data.kind === "input") return toast.error("Input nodes cannot have incoming connections.");
      if (edges.some((edge) => edge.source === source.id && edge.target === target.id)) {
        return toast.error("That connection already exists.");
      }
      const adjacency = new Map<string, string[]>();
      for (const edge of edges) {
        adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target]);
      }
      if (reachable(target.id, adjacency).has(source.id)) {
        return toast.error("That connection would create a cycle (must be a DAG).");
      }
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            style: { stroke: "#64748b", strokeWidth: 2 },
          },
          current
        )
      );
      setDirty(true);
      setGraphDirty(true);
      setFieldError("");
    },
    [edges, nodes, setEdges]
  );

  const save = useCallback(
    async (status?: Workflow["status"]) => {
      if (!workflow || conflict || saving) return;
      const targetStatus = status || workflow.status;
      const isPublishing = targetStatus === "published";

      const changedName = workflow.name !== (savedMeta?.name || workflow.name);
      const changedDescription =
        (workflow.description || "") !== (savedMeta?.description || "");
      const changes: Parameters<typeof workflowsApi.update>[1] = {
        version: workflow.version,
      };
      if (changedName) changes.name = workflow.name;
      if (changedDescription) changes.description = workflow.description || "";
      if (status) changes.status = status;

      let graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null = null;
      if (graphDirty) {
        const problem = validateGraph(nodes, edges, registry, isPublishing);
        if (problem) {
          setFieldError(problem);
          toast.error(problem);
          const namedNode = nodes.find(
            (node) => problem.includes(node.data.title) && node.data.kind !== "input"
          );
          if (namedNode) setSelectedId(namedNode.id);
          return;
        }
        graph = fromFlow(nodes, edges);
        changes.nodes = graph.nodes;
        changes.edges = graph.edges;
      }
      if (Object.keys(changes).length === 1) {
        toast("Everything is up to date.");
        return;
      }
      setSaving(true);
      setFieldError("");
      try {
        const updated = await workflowsApi.update(workflow.workflowId, changes);
        setWorkflow(updated);
        setSavedMeta({ name: updated.name, description: updated.description || "" });
        if (graphDirty) {
          const flow = toFlow(updated, dark);
          setNodes(flow.nodes);
          setEdges(flow.edges);
        }
        setDirty(false);
        setGraphDirty(false);
        toast.success(
          status === "published"
            ? "Workflow published"
            : status === "draft" && workflow.status === "published"
            ? "Workflow moved to draft"
            : "Workflow saved"
        );
      } catch (error) {
        if (error instanceof WorkflowApiError && error.status === 409) {
          setConflict(true);
          const reload = window.confirm(
            "This workflow was modified elsewhere. Would you like to reload the latest version?"
          );
          if (reload) {
            void loadWorkflow();
          } else {
            toast.error("This workflow changed elsewhere. Reload the latest version before saving.");
          }
        } else if (error instanceof WorkflowApiError && error.status === 404) {
          toast.error("Workflow not found. Returning to your workflow list.");
          router.replace("/workflows");
        } else {
          const message = error instanceof Error ? error.message : "Could not save workflow";
          setFieldError(message);
          toast.error(message);
          const namedNode = nodes.find((node) => message.includes(node.data.title));
          if (namedNode) setSelectedId(namedNode.id);
        }
      } finally {
        setSaving(false);
      }
    },
    [workflow, conflict, saving, savedMeta, graphDirty, nodes, edges, registry, dark, setNodes, setEdges, router, loadWorkflow]
  );

  const handleDeleteWorkflow = async () => {
    if (!workflow || deleting) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete "${workflow.name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await workflowsApi.delete(workflow.workflowId);
      toast.success("Workflow deleted successfully");
      router.replace("/workflows");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete workflow");
      setDeleting(false);
    }
  };

  const removeSelected = () => {
    if (!selected) return;
    setNodes((current) => current.filter((node) => node.id !== selected.id));
    setEdges((current) =>
      current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id)
    );
    setSelectedId(null);
    setDirty(true);
    setGraphDirty(true);
  };

  const applyFieldsJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Node fields must be an object.");
      }
      if (selected) updateNode(selected.id, { fields: parsed as Record<string, unknown> });
      setJsonError("");
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON");
    }
  };

  const updateEdgeLabel = (edge: FlowEdge, when: string) => {
    setEdges((current) =>
      current.map((item) =>
        item.id === edge.id
          ? { ...item, label: when || undefined, data: { ...item.data, when: when || undefined } }
          : item
      )
    );
    setDirty(true);
    setGraphDirty(true);
  };

  const upstreamNodes = useMemo(() => {
    if (!selected) return [];
    const incomingIds = new Set<string>();
    const stack = [selected.id];
    while (stack.length) {
      const curr = stack.pop()!;
      for (const e of edges) {
        if (e.target === curr && !incomingIds.has(e.source)) {
          incomingIds.add(e.source);
          stack.push(e.source);
        }
      }
    }
    return nodes.filter((n) => incomingIds.has(n.id));
  }, [selected, edges, nodes]);

  const toolNodes = useMemo(() => nodes.filter((node) => node.data.kind === "tool"), [nodes]);

  const handleTestRun = async () => {
    if (!workflow || testRunning) return;
    if (graphDirty || dirty) {
      const problem = validateGraph(nodes, edges, registry, false);
      if (problem) {
        toast.error(`Please fix graph validation before testing: ${problem}`);
        return;
      }
      toast("Saving graph before test run…");
      await save();
    }
    setTestRunning(true);
    setTestError(null);
    setTestResponse(null);
    try {
      const res = await workflowsApi.runChat({
        workflowName: workflow.name,
        workflowOwnerId: workflow.ownerId,
        messages: [{ role: "user", content: testQuery.trim() }],
      });
      setTestResponse(res);
      if (res.trace.length) {
        setActiveTraceNode(res.trace[0].nodeName);
      }
    } catch (err) {
      if (err instanceof WorkflowApiError) {
        setTestError({ status: err.status, message: err.message });
      } else {
        setTestError({ message: err instanceof Error ? err.message : "Workflow test execution failed" });
      }
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <main
      className={`flex h-screen min-h-[620px] flex-col overflow-hidden ${
        dark ? "bg-slate-950 text-slate-100" : "bg-[#f7faff] text-slate-900"
      }`}
    >
      <Toaster position="top-right" />

      {/* Header */}
      <header className={`z-20 flex h-[68px] shrink-0 items-center justify-between border-b px-4 sm:px-6 ${panel}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/workflows"
            aria-label="Back to workflows"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              dark ? "hover:bg-slate-800" : "hover:bg-blue-50"
            }`}
          >
            <FiArrowLeft />
          </Link>
          <div className={`h-7 w-px ${dark ? "bg-slate-800" : "bg-slate-200"}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <input
                value={workflow?.name || "Loading workflow"}
                onChange={(event) => {
                  setWorkflow((current) =>
                    current ? { ...current, name: event.target.value } : current
                  );
                  setDirty(true);
                }}
                className="w-44 truncate bg-transparent text-sm font-bold outline-none focus:text-blue-500 sm:w-64"
                aria-label="Workflow name"
              />
              <FiChevronDown className={`text-xs ${muted}`} />
            </div>
            <div className={`mt-0.5 flex items-center gap-1.5 text-[10px] ${muted}`}>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  workflow?.status === "published" ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {workflow?.status === "published" ? "Published" : "Draft"}
              {workflow && (
                <>
                  <span>·</span>
                  <span>v{workflow.version}</span>
                </>
              )}
              {dirty && (
                <>
                  <span>·</span>
                  <span className="text-amber-500">Unsaved changes</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {conflict && (
            <button
              onClick={() => void loadWorkflow()}
              className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-600"
            >
              Reload latest
            </button>
          )}

          {/* Test Run button */}
          <button
            onClick={() => setTestRunOpen((v) => !v)}
            title="Test run workflow"
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
              testRunOpen
                ? "border-blue-500 bg-blue-500 text-white shadow-md shadow-blue-500/20"
                : dark
                ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-blue-50"
            }`}
          >
            <FiPlay className="text-xs" />
            <span className="hidden sm:inline">Test run</span>
          </button>

          {/* Quick Delete button */}
          <button
            onClick={handleDeleteWorkflow}
            disabled={deleting}
            title="Delete this workflow"
            className={`hidden rounded-xl p-2.5 sm:block transition ${
              dark
                ? "text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                : "text-slate-500 hover:bg-rose-50 hover:text-rose-600"
            }`}
            aria-label="Delete workflow"
          >
            <FiTrash2 />
          </button>

          <button
            onClick={() => setSettingsOpen((value) => !value)}
            title="Workflow settings"
            className={`hidden rounded-xl p-2.5 ${muted} sm:block hover:bg-slate-100 dark:hover:bg-slate-800`}
          >
            <FiSettings />
          </button>

          <button
            onClick={() => void save()}
            disabled={saving || loading || conflict}
            className={`hidden items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold sm:flex ${
              dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-blue-50"
            }`}
          >
            {saving ? <FiLoader className="animate-spin" /> : <FiSave />} Save
          </button>

          {workflow?.status === "published" ? (
            <button
              onClick={() => void save("draft")}
              disabled={saving || conflict}
              className={`rounded-xl border px-3.5 py-2 text-xs font-bold ${
                dark ? "border-slate-700" : "border-slate-200"
              }`}
            >
              Unpublish
            </button>
          ) : (
            <button
              onClick={() => void save("published")}
              disabled={saving || loading || conflict}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50"
            >
              <FiShare2 /> Publish
            </button>
          )}

          <ThemeToggle />
        </div>
      </header>

      {/* Settings Dialog */}
      {settingsOpen && workflow && (
        <div
          className={`absolute right-52 top-[62px] z-30 w-80 rounded-2xl border p-5 shadow-2xl ${card}`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">Workflow settings</h3>
            <button onClick={() => setSettingsOpen(false)} className={muted}>
              ×
            </button>
          </div>
          <label className={`mb-1 block text-xs font-bold ${muted}`}>Description</label>
          <textarea
            value={workflow.description || ""}
            onChange={(event) => {
              setWorkflow({ ...workflow, description: event.target.value });
              setDirty(true);
            }}
            rows={3}
            className={field}
            placeholder="What does this workflow do?"
          />
          <div className="mt-4 border-t pt-4 border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleDeleteWorkflow}
              disabled={deleting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 py-2.5 text-xs font-bold text-rose-500 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              <FiTrash2 /> Delete workflow
            </button>
          </div>
        </div>
      )}

      {/* Main workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Left Palette */}
        <aside
          className={`z-10 flex w-[68px] shrink-0 flex-col items-center gap-2 border-r py-4 sm:w-[222px] sm:items-stretch sm:px-3 ${panel}`}
        >
          <div className="mb-2 hidden px-2 text-[10px] font-extrabold uppercase tracking-[.18em] text-slate-400 sm:block">
            Add to canvas
          </div>
          {registry?.nodeTypes.map((item) => {
            const visual = visuals[item.type];
            const disabled = item.type === "input" && nodes.some((node) => node.data.kind === "input");
            return (
              <button
                key={item.type}
                onClick={() => addNode(item.type)}
                disabled={disabled}
                title={disabled ? "A workflow can have only one input node" : `Add ${item.label}`}
                className={`group flex h-11 w-11 items-center justify-center gap-3 rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:w-auto sm:justify-start sm:px-3 sm:py-2.5 ${
                  dark
                    ? "border-transparent hover:border-slate-700 hover:bg-slate-900"
                    : "border-transparent hover:border-blue-100 hover:bg-blue-50"
                }`}
              >
                <span
                  style={{ backgroundColor: `${visual.color}18`, color: visual.color }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base font-bold"
                >
                  {visual.icon}
                </span>
                <span className="hidden min-w-0 flex-1 text-left sm:block">
                  <span className="block text-xs font-bold">{item.label}</span>
                  <span className={`block text-[10px] capitalize ${muted}`}>{item.category}</span>
                </span>
                <FiPlus className={`hidden text-xs ${muted} sm:block`} />
              </button>
            );
          })}

          <div
            className={`mx-2 my-3 hidden border-t sm:block ${
              dark ? "border-slate-800" : "border-slate-100"
            }`}
          />
          <div className={`hidden px-2 text-[10px] leading-5 ${muted} sm:block`}>
            <p className="font-semibold text-slate-700 dark:text-slate-300">Design freedom:</p>
            <p>• Save drafts anytime.</p>
            <p>• Output nodes optional.</p>
            <p>• Connect into a DAG to publish.</p>
          </div>
          <span className={`mt-auto hidden items-center gap-2 px-2 text-[10px] ${muted} sm:flex`}>
            <FiGitBranch className="text-blue-500" /> DAG · continuous save
          </span>
        </aside>

        {/* Center Canvas */}
        <section className={`relative min-w-0 flex-1 ${dark ? "bg-[#080f1e]" : "bg-[#f8fafc]"}`}>
          {loading ? (
            <div className="grid h-full place-items-center">
              <FiLoader className="animate-spin text-2xl text-blue-500" />
            </div>
          ) : !workflow ? (
            <div className="grid h-full place-items-center text-sm text-slate-500">
              Workflow could not be opened.
            </div>
          ) : (
            <>
              {/* Flow stats */}
              <div
                className={`absolute left-5 top-5 z-10 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm ${card}`}
              >
                <span className="text-blue-500">{nodes.length}</span> nodes{" "}
                <span className="mx-2 opacity-40">·</span>
                <span className="text-blue-500">{edges.length}</span> connections
              </div>

              {/* View tools */}
              <div className={`absolute right-5 top-5 z-10 flex gap-1 rounded-xl border p-1 shadow-sm ${card}`}>
                <button
                  onClick={() => fitView({ padding: 0.25, duration: 350 })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${muted}`}
                >
                  Fit view
                </button>
                <button
                  onClick={() => addNode("agent")}
                  title="Add an agent"
                  className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white"
                >
                  <FiPlus />
                </button>
              </div>

              {/* Validation alert banner */}
              {fieldError && (
                <div
                  role="alert"
                  className="absolute bottom-5 left-16 right-16 z-10 flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-500 shadow-lg sm:left-20"
                >
                  <span className="flex items-center gap-2">
                    <FiAlertCircle className="shrink-0 text-sm" />
                    {fieldError}
                  </span>
                  <button onClick={() => setFieldError("")} className="text-rose-500 hover:opacity-80">
                    <FiX />
                  </button>
                </div>
              )}

              {/* ReactFlow graph canvas */}
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={(changes) => {
                  onNodesChange(changes);
                  if (changes.some((c) => c.type === "position" || c.type === "remove")) {
                    setDirty(true);
                    setGraphDirty(true);
                  }
                }}
                onEdgesChange={(changes) => {
                  onEdgesChange(changes);
                  if (changes.length) {
                    setDirty(true);
                    setGraphDirty(true);
                  }
                }}
                onConnect={onConnect}
                onNodeClick={(_, node) => {
                  setSelectedId(node.id);
                  setFieldError("");
                }}
                onPaneClick={() => setSelectedId(null)}
                onEdgesDelete={() => {
                  setDirty(true);
                  setGraphDirty(true);
                }}
                onNodesDelete={() => {
                  setDirty(true);
                  setGraphDirty(true);
                }}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                deleteKeyCode={null}
                defaultEdgeOptions={{ type: "smoothstep" }}
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={22}
                  size={1}
                  color={dark ? "#243047" : "#ccd7e6"}
                />
                <Controls position="bottom-left" showInteractive={false} />
                <MiniMap
                  position="bottom-right"
                  nodeColor={(node) => visuals[(node.data as FlowData).kind]?.color || "#94a3b8"}
                  maskColor={dark ? "rgba(2,6,23,.65)" : "rgba(248,250,252,.75)"}
                  className={`!rounded-xl !border ${
                    dark ? "!border-slate-700 !bg-slate-900" : "!border-slate-200 !bg-white"
                  }`}
                />
              </ReactFlow>
            </>
          )}
        </section>

        {/* Right Node Inspector */}
        {selected && (
          <aside className={`z-10 flex w-[360px] shrink-0 flex-col border-l ${panel}`}>
            <div className="flex items-start justify-between border-b border-inherit p-5">
              <div className="flex min-w-0 gap-3">
                <span
                  style={{
                    backgroundColor: `${visuals[selected.data.kind].color}18`,
                    color: visuals[selected.data.kind].color,
                  }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg font-bold"
                >
                  {visuals[selected.data.kind].icon}
                </span>
                <div className="min-w-0">
                  <p
                    className="text-[9px] font-extrabold tracking-[.16em]"
                    style={{ color: visuals[selected.data.kind].color }}
                  >
                    {visuals[selected.data.kind].label}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-bold">
                    {selected.data.title || "Unnamed node"}
                  </p>
                </div>
              </div>
              <button
                onClick={removeSelected}
                title="Delete node"
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
              >
                <FiTrash2 />
              </button>
            </div>

            <div className={`flex border-b px-5 ${dark ? "border-slate-800" : "border-slate-100"}`}>
              <button
                onClick={() => setSideTab("config")}
                className={`border-b-2 px-1 py-3 text-xs font-bold ${
                  sideTab === "config"
                    ? "border-blue-500 text-blue-500"
                    : `border-transparent ${muted}`
                }`}
              >
                Configuration
              </button>
              <button
                onClick={() => setSideTab("connections")}
                className={`ml-5 border-b-2 px-1 py-3 text-xs font-bold ${
                  sideTab === "connections"
                    ? "border-blue-500 text-blue-500"
                    : `border-transparent ${muted}`
                }`}
              >
                Connections{" "}
                <span className="ml-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-500">
                  {connectedEdges.length}
                </span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {sideTab === "config" ? (
                <div className="space-y-5">
                  {/* Node Name */}
                  <div>
                    <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                      Node name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={selected.data.title}
                      onChange={(event) => renameNode(selected, event.target.value)}
                      className={field}
                      placeholder="Unique node name"
                    />
                    <p className={`mt-1.5 text-[10px] ${muted}`}>
                      Reference in templates via{" "}
                      <code className="text-blue-500">
                        {`{{${selected.data.title || "Node"}.output}}`}
                      </code>
                    </p>
                  </div>

                  {/* Upstream variable suggestion chips */}
                  {upstreamNodes.length > 0 && (
                    <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 text-[10px]">
                      <p className="font-bold text-blue-500 mb-1.5 flex items-center gap-1">
                        <FiInfo /> Upstream variables:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {upstreamNodes.map((n) => {
                          const varName =
                            n.data.kind === "input"
                              ? `{{${n.data.title}.output.message}}`
                              : n.data.kind === "tool"
                              ? `{{${n.data.title}.output.results}}`
                              : `{{${n.data.title}.output.answer}}`;
                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(varName);
                                toast.success(`Copied ${varName} to clipboard`);
                              }}
                              title="Click to copy variable"
                              className="rounded bg-white px-1.5 py-0.5 font-mono text-[9px] shadow-sm hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700"
                            >
                              {varName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Agent Configuration */}
                  {selected.data.kind === "agent" && (
                    <>
                      <div>
                        <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                          Agent operation <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={String(selected.data.fields.agentType || "prompt_agent")}
                          onChange={(event) =>
                            updateFields(selected.id, { agentType: event.target.value })
                          }
                          className={field}
                        >
                          <option value="prompt_agent">prompt_agent (Prompt execution)</option>
                          <option value="function_call_agent">function_call_agent (Tool caller)</option>
                          <option value="sandbox_agent">sandbox_agent (Isolated code runner)</option>
                        </select>
                        <p className={`mt-1.5 text-[10px] leading-5 ${muted}`}>
                          {registry?.agentTypes.find((item) => item.type === selected.data.fields.agentType)?.description ||
                            "Agent type determines how reasoning and tools are executed."}
                        </p>
                      </div>

                      {selected.data.fields.agentType === "sandbox_agent" && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-600 dark:text-amber-400">
                          <span className="font-bold">501 Not Implemented:</span> Sandbox agents can be
                          saved in workflow JSON today, but will return 501 during test runs until dedicated
                          runtime execution is added.
                        </div>
                      )}

                      {selected.data.fields.agentType === "function_call_agent" && (
                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-[11px] leading-5 text-blue-600 dark:text-blue-400">
                          <span className="font-bold">Notice:</span> Executes as a model node. Autonomous
                          tool calls will be enabled in a future runtime update; connect explicit tool nodes
                          in your DAG for now.
                        </div>
                      )}

                      {/* Provider & Model Selectors */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                            Provider
                          </label>
                          <select
                            value={String(selected.data.fields.provider || "")}
                            onChange={(event) =>
                              updateFields(selected.id, { provider: event.target.value || undefined })
                            }
                            className={field}
                          >
                            <option value="">Default</option>
                            <option value="groq">Groq</option>
                            <option value="mistral">Mistral</option>
                          </select>
                        </div>
                        <div>
                          <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                            Model
                          </label>
                          <select
                            value={String(selected.data.fields.model || "")}
                            onChange={(event) => {
                              const chosen = models.find((m) => m.id === event.target.value);
                              updateFields(selected.id, {
                                model: event.target.value || undefined,
                                ...(chosen?.provider && { provider: chosen.provider }),
                              });
                            }}
                            className={field}
                          >
                            <option value="">Default</option>
                            {models.map((model) => (
                              <option key={`${model.provider || "m"}-${model.id}`} value={model.id}>
                                {model.id} {model.provider ? `(${model.provider})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Prompt */}
                      <div>
                        <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                          Prompt template
                        </label>
                        <textarea
                          value={String(selected.data.fields.prompt || "")}
                          onChange={(event) =>
                            updateFields(selected.id, { prompt: event.target.value })
                          }
                          rows={6}
                          className={field}
                          placeholder={
                            'Rewrite the user\'s question as a short search query:\n\nQuestion: {{Question.output.message}}'
                          }
                        />
                      </div>

                      {/* Allowed tools for function_call_agent */}
                      {selected.data.fields.agentType === "function_call_agent" && (
                        <div>
                          <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                            Allowed tool nodes
                          </label>
                          <select
                            multiple
                            value={
                              Array.isArray(selected.data.fields.tools)
                                ? (selected.data.fields.tools as string[])
                                : []
                            }
                            onChange={(event) =>
                              updateFields(selected.id, {
                                tools: Array.from(event.target.selectedOptions, (option) => option.value),
                              })
                            }
                            className={`${field} min-h-24`}
                          >
                            {toolNodes.map((node) => (
                              <option key={node.id} value={node.data.title}>
                                {node.data.title} ({String(node.data.fields.tool)})
                              </option>
                            ))}
                          </select>
                          <p className={`mt-1.5 text-[10px] ${muted}`}>
                            Only the tool node names selected here will be exposed to this agent.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Tool Configuration */}
                  {selected.data.kind === "tool" && (
                    <>
                      <div>
                        <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                          Tool type <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={String(selected.data.fields.tool || "")}
                          onChange={(event) => {
                            const val = event.target.value;
                            const patch: Record<string, unknown> = { tool: val };
                            if (val === "knowledge_base_search" && !selected.data.fields.input) {
                              patch.input = { query: "{{Question.output.message}}", topK: 5 };
                            } else if (val === "mcp" && !selected.data.fields.settings) {
                              patch.settings = { connectionId: "", toolName: "" };
                            } else if (val === "http" && !selected.data.fields.settings) {
                              patch.settings = { connectionId: "", operationId: "" };
                            }
                            updateFields(selected.id, patch);
                          }}
                          className={field}
                        >
                          <option value="">Select a tool</option>
                          <option value="knowledge_base_search">
                            knowledge_base_search · Built-in (Active)
                          </option>
                          <option value="knowledge_base_document_search">
                            knowledge_base_document_search · Built-in (Planned)
                          </option>
                          <option value="rag">rag · Planned</option>
                          <option value="http">http · Configured (Planned)</option>
                          <option value="mcp">mcp · Configured (Planned)</option>
                        </select>
                      </div>

                      {/* Runtime Notice for Planned/Reserved Tools */}
                      {["knowledge_base_document_search", "rag", "http", "mcp"].includes(
                        String(selected.data.fields.tool)
                      ) && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-600 dark:text-amber-400">
                          <span className="font-bold">501 Not Implemented:</span> This tool type can be
                          saved in workflow JSON today, but is intentionally unavailable for test runs until
                          its dedicated runtime executor is added.
                        </div>
                      )}

                      {/* Tool Input Configuration */}
                      <div>
                        <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                          Input mapping (JSON)
                        </label>
                        <textarea
                          value={JSON.stringify(selected.data.fields.input || {}, null, 2)}
                          onChange={(event) => {
                            try {
                              updateFields(selected.id, { input: JSON.parse(event.target.value) });
                            } catch {
                              // Retain text until valid
                            }
                          }}
                          rows={5}
                          className={`${field} font-mono text-xs`}
                          placeholder={
                            '{\n  "query": "{{Rewrite question.output.query}}",\n  "topK": 5\n}'
                          }
                        />
                        <p className={`mt-1.5 text-[10px] ${muted}`}>
                          Pass variable references like{" "}
                          <code>{`{{Question.output.message}}`}</code>
                        </p>
                      </div>

                      {/* Settings for MCP / HTTP */}
                      {["mcp", "http"].includes(String(selected.data.fields.tool)) && (
                        <div>
                          <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                            Settings (Server connection reference)
                          </label>
                          <textarea
                            value={JSON.stringify(selected.data.fields.settings || {}, null, 2)}
                            onChange={(event) => {
                              try {
                                updateFields(selected.id, { settings: JSON.parse(event.target.value) });
                              } catch {
                                // Retain text
                              }
                            }}
                            rows={4}
                            className={`${field} font-mono text-xs`}
                            placeholder={
                              selected.data.fields.tool === "mcp"
                                ? '{\n  "connectionId": "crm-production",\n  "toolName": "find_customer"\n}'
                                : '{\n  "connectionId": "crm-production",\n  "operationId": "getTicket"\n}'
                            }
                          />
                          <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <FiAlertTriangle /> Never put credentials, tokens, or URLs here. Use server
                            connection IDs only.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Condition Configuration */}
                  {selected.data.kind === "condition" && (
                    <div>
                      <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                        Expression <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        value={String(selected.data.fields.expression || "")}
                        onChange={(event) =>
                          updateFields(selected.id, { expression: event.target.value })
                        }
                        rows={3}
                        className={`${field} font-mono text-xs`}
                        placeholder={`{{${selected.data.title || "Search"}.output.results.length}} > 0`}
                      />
                      <div className="mt-2 rounded-xl bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-600 dark:text-amber-400">
                        Condition execution returns 501 until dedicated runtime branching is implemented.
                      </div>
                    </div>
                  )}

                  {/* Output Configuration */}
                  {selected.data.kind === "output" && (
                    <div>
                      <label className={`mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                        Response value template <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        value={String(selected.data.fields.value || "")}
                        onChange={(event) =>
                          updateFields(selected.id, { value: event.target.value })
                        }
                        rows={4}
                        className={`${field} font-mono text-xs`}
                        placeholder={`{{${selected.data.title || "Agent"}.output.answer}}`}
                      />
                      <p className={`mt-2 text-[10px] leading-5 ${muted}`}>
                        Output nodes are optional. Without an Output node, the server automatically selects
                        the terminal agent response.
                      </p>
                    </div>
                  )}

                  {/* Advanced JSON Editor */}
                  <details className={`rounded-xl border ${dark ? "border-slate-800" : "border-slate-200"}`}>
                    <summary className={`cursor-pointer px-3 py-2.5 text-xs font-bold ${muted}`}>
                      Advanced node JSON fields
                    </summary>
                    <div className="p-3 pt-0">
                      <textarea
                        value={jsonDraft}
                        onChange={(event) => setJsonDraft(event.target.value)}
                        rows={7}
                        className={`${field} font-mono text-[11px]`}
                      />
                      <button
                        onClick={applyFieldsJson}
                        className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        Apply JSON
                      </button>
                      {jsonError && <p className="mt-2 text-xs text-rose-500">{jsonError}</p>}
                    </div>
                  </details>
                </div>
              ) : (
                /* Connections tab */
                <div className="space-y-3">
                  {connectedEdges.length === 0 ? (
                    <p className={`rounded-xl p-4 text-xs ${muted}`}>
                      No connections yet. Drag a handle to connect this node to another.
                    </p>
                  ) : (
                    connectedEdges.map((edge) => (
                      <div
                        key={edge.id}
                        className={`rounded-xl border p-3 ${
                          dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <p className={`mb-2 text-[10px] font-bold ${muted}`}>
                          {edge.source === selected.id
                            ? `Outgoing to: ${
                                nodes.find((node) => node.id === edge.target)?.data.title || edge.target
                              }`
                            : `Incoming from: ${
                                nodes.find((node) => node.id === edge.source)?.data.title || edge.source
                              }`}
                        </p>
                        {nodes.find((node) => node.id === selected.id)?.data.kind === "condition" &&
                          edge.source === selected.id && (
                            <input
                              value={String(edge.data?.when || edge.label || "")}
                              onChange={(event) => updateEdgeLabel(edge, event.target.value)}
                              className={field}
                              placeholder="Branch label (e.g. true / false)"
                            />
                          )}
                      </div>
                    ))
                  )}
                  <p className={`text-[10px] leading-5 ${muted}`}>
                    Connections define execution order in the DAG. Data is referenced via node names.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div
              className={`flex items-center justify-between border-t p-4 ${
                dark ? "border-slate-800" : "border-slate-100"
              }`}
            >
              <span className={`text-[10px] ${muted}`}>
                v{workflow?.version ?? "—"} · Version-checked saves
              </span>
              <button
                onClick={() => void save()}
                disabled={saving || conflict}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? <FiLoader className="animate-spin" /> : <FiCheck />} Apply
              </button>
            </div>
          </aside>
        )}

        {/* Developer / Test-Run Panel (Right Drawer) */}
        {testRunOpen && (
          <aside className={`z-20 flex w-[420px] shrink-0 flex-col border-l shadow-2xl ${panel}`}>
            <div className="flex items-center justify-between border-b border-inherit px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-500/10 text-blue-500 font-bold">
                  <FiTerminal />
                </span>
                <div>
                  <h3 className="text-sm font-bold">Developer Test Panel</h3>
                  <p className={`text-[10px] ${muted}`}>Execute DAG against POST /genAI/chat</p>
                </div>
              </div>
              <button
                onClick={() => setTestRunOpen(false)}
                className={`rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${muted}`}
              >
                <FiX />
              </button>
            </div>

            {/* Test Input form */}
            <div className="border-b border-inherit p-4">
              <label className={`mb-1 block text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                Test input question
              </label>
              <div className="flex gap-2">
                <input
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !testRunning && handleTestRun()}
                  placeholder="e.g. What is our remote work policy?"
                  className={field}
                />
                <button
                  onClick={handleTestRun}
                  disabled={testRunning || !testQuery.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50"
                >
                  {testRunning ? <FiLoader className="animate-spin" /> : <FiPlay />}
                  <span>Run</span>
                </button>
              </div>
            </div>

            {/* Test Output & Trace */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
              {testRunning && (
                <div className="grid place-items-center py-16 text-center">
                  <FiLoader className="animate-spin text-3xl text-blue-500 mb-3" />
                  <p className="text-sm font-semibold">Executing workflow graph…</p>
                  <p className={`text-xs ${muted} mt-1`}>Resolving prompt agents & search tools</p>
                </div>
              )}

              {testError && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-500 space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <FiAlertCircle className="text-base" />
                    <span>
                      {testError.status === 501
                        ? "501 Not Implemented: Runtime unavailable"
                        : testError.status === 409
                        ? "409 Workflow Name Conflict"
                        : testError.status === 400
                        ? "400 Invalid Workflow Graph"
                        : "Workflow Execution Error"}
                    </span>
                  </div>
                  <p className="leading-5">{testError.message}</p>
                  {testError.status === 501 && (
                    <p className="text-[11px] opacity-80 border-t border-rose-500/20 pt-2">
                      The initial runtime executes prompt_agent nodes and knowledge_base_search tools.
                      MCP, HTTP, conditions, sandbox agents, and autonomous function calls remain
                      unavailable until their executors are added.
                    </p>
                  )}
                </div>
              )}

              {testResponse && (
                <div className="space-y-4">
                  {/* Run Metadata */}
                  <div className={`rounded-xl border p-3 text-xs flex items-center justify-between ${card}`}>
                    <div>
                      <span className="font-bold text-emerald-500 flex items-center gap-1">
                        <FiCheck /> Run completed
                      </span>
                      <p className={`text-[10px] ${muted} mt-0.5`}>
                        Duration: {testResponse.run.durationMs}ms
                      </p>
                    </div>
                    <span className="font-mono text-[10px] opacity-60">
                      {testResponse.run.runId.slice(0, 8)}
                    </span>
                  </div>

                  {/* Terminal Response */}
                  <div className={`rounded-2xl border p-4 space-y-2 ${card}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">
                        Final Response
                      </span>
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold text-blue-500">
                        {testResponse.response.finalNode?.name || "Terminal"} (
                        {testResponse.response.finalNode?.type})
                      </span>
                    </div>
                    <div className="text-sm leading-relaxed">
                      <Markdown content={testResponse.response.message} />
                    </div>
                  </div>

                  {/* Citations if available */}
                  {testResponse.response.citations && testResponse.response.citations.length > 0 && (
                    <div className="space-y-2">
                      <p className={`text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                        Citations ({testResponse.response.citations.length})
                      </p>
                      <div className="space-y-2">
                        {testResponse.response.citations.map((c, i) => (
                          <div
                            key={`${c.documentId}-${i}`}
                            className={`rounded-xl border p-3 text-xs space-y-1 ${card}`}
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span className="text-blue-500 truncate flex items-center gap-1">
                                <FiDatabase className="shrink-0" />
                                {c.title || c.documentId}
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                {Math.round(c.score * 100)}% match
                              </span>
                            </div>
                            <p className={`line-clamp-3 text-[11px] leading-4 ${muted}`}>
                              {c.excerpt}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Execution Trace */}
                  <div className="space-y-2">
                    <p className={`text-[10px] font-extrabold uppercase tracking-wider ${muted}`}>
                      Execution Trace ({testResponse.trace.length} steps)
                    </p>
                    <div className="space-y-2">
                      {testResponse.trace.map((step, idx) => {
                        const isExpanded = activeTraceNode === step.nodeName;
                        return (
                          <div
                            key={`${step.nodeName}-${idx}`}
                            className={`rounded-xl border transition ${card}`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setActiveTraceNode(isExpanded ? null : step.nodeName)
                              }
                              className="flex w-full items-center justify-between p-3 text-left text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-[10px] opacity-40">
                                  #{idx + 1}
                                </span>
                                <span className="font-bold truncate">{step.nodeName}</span>
                                <span className="rounded bg-blue-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-blue-500">
                                  {step.nodeType}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] ${muted}`}>
                                  {step.durationMs}ms
                                </span>
                                <FiChevronDown
                                  className={`text-xs transition-transform ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-inherit p-3">
                                <pre className="max-h-48 overflow-auto rounded-lg bg-black/5 p-2 font-mono text-[10px] leading-4 dark:bg-black/30">
                                  {JSON.stringify(step.output, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Test Run panel footer */}
            <div className={`border-t p-3 text-center text-[10px] ${muted}`}>
              <Link
                href={`/chat?workflow=${encodeURIComponent(workflow?.name || "")}`}
                className="inline-flex items-center gap-1.5 text-blue-500 font-semibold hover:underline"
              >
                <span>Open in chat view</span>
                <FiExternalLink />
              </Link>
            </div>
          </aside>
        )}
      </div>

      {/* Footer bar */}
      <div
        className={`flex h-8 shrink-0 items-center justify-between border-t px-4 text-[10px] ${panel} ${muted}`}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <FiGitBranch className="text-blue-500" /> Workflow builder
          </span>
          <span>Draft freedom · Published executable validation · DAG</span>
        </div>
        <span>{dirty ? "Unsaved changes" : "Saved"}</span>
      </div>
    </main>
  );
}

export default function WorkflowBuilderPage() {
  const params = useParams<{ workflowId: string }>();
  return (
    <ReactFlowProvider>
      <WorkflowCanvas workflowId={params.workflowId} />
    </ReactFlowProvider>
  );
}
