"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import ChatContainer from "@/components/ChatContainer";
import ThemeToggle from "@/components/ThemeToggle";
import { RootState } from "@/store";
import { clearMessages } from "@/store/slices/chatSlice";
import { DEFAULT_OWNER_ID, Workflow, workflowsApi } from "@/lib/workflowsApi";
import {
  FiArrowLeft,
  FiBookOpen,
  FiGitBranch,
  FiMessageCircle,
  FiTrash2,
  FiZap,
} from "react-icons/fi";

function ChatView() {
  const dispatch = useDispatch();
  const searchParams = useSearchParams();
  const initialWorkflow = searchParams.get("workflow") || "";
  const initialOwnerId = searchParams.get("ownerId") || DEFAULT_OWNER_ID;

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const MODEL = process.env.NEXT_PUBLIC_MODEL || "llama-3.3-70b-versatile";
  const darkMode = useSelector((state: RootState) => state.theme.mode === "dark");

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  // Target can be "agent:<id>" or "workflow:<name>"
  const [selectedTarget, setSelectedTarget] = useState<string>(
    initialWorkflow ? `workflow:${initialWorkflow}` : "agent:"
  );

  useEffect(() => {
    workflowsApi
      .list()
      .then((data) => {
        setWorkflows(data);
        if (initialWorkflow && !data.some((w) => w.name === initialWorkflow)) {
          // If specified from URL, keep it
        }
      })
      .catch(() => undefined);
  }, [initialWorkflow]);

  // Derived target
  const isWorkflow = selectedTarget.startsWith("workflow:");
  const currentWorkflowName = isWorkflow ? selectedTarget.replace("workflow:", "") : undefined;
  const currentWorkflow = workflows.find((w) => w.name === currentWorkflowName);
  const currentWorkflowOwnerId = currentWorkflow?.ownerId || initialOwnerId || DEFAULT_OWNER_ID;
  const currentAgent = !isWorkflow ? selectedTarget.replace("agent:", "") : undefined;

  const surface = darkMode ? "bg-slate-950 text-slate-100" : "bg-[#f7faff] text-slate-900";
  const card = darkMode ? "border-slate-800 bg-slate-900" : "border-blue-100 bg-white";
  const muted = darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`flex h-screen flex-col transition-colors duration-200 ${surface}`}>
      <header
        className={`sticky top-0 z-20 border-b backdrop-blur-xl ${
          darkMode ? "border-slate-800 bg-slate-950/85" : "border-blue-100 bg-white/85"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Back to knowledge base"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30"
            >
              <FiBookOpen />
            </Link>
            <div className="min-w-0">
              <p className="text-lg font-bold">
                Lumen<span className="text-blue-500">base</span>
              </p>
              <div className={`flex items-center gap-1.5 text-xs ${muted}`}>
                <FiMessageCircle className="text-blue-500" />
                <span className="truncate">AI workspace</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/workflows"
              className={`hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold sm:flex ${
                darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-blue-50"
              }`}
            >
              <FiGitBranch className="text-blue-500" /> Workflows
            </Link>

            {/* Target Selector: Agents vs Workflows */}
            <select
              value={selectedTarget}
              onChange={(event) => setSelectedTarget(event.target.value)}
              aria-label="Select execution target"
              className={`rounded-xl border px-3 py-2 text-xs font-semibold outline-none transition sm:text-sm ${card} ${
                darkMode ? "hover:bg-slate-800" : "hover:bg-blue-50"
              }`}
            >
              <optgroup label="Direct AI Agents">
                <option value="agent:">General assistant</option>
                <option value="agent:ragAgent">Knowledge assistant (RAG)</option>
                <option value="agent:critiqueAgent">Critique agent</option>
              </optgroup>

              {workflows.length > 0 && (
                <optgroup label="Workflows (DAG Execution)">
                  {workflows.map((w) => (
                    <option key={w.workflowId} value={`workflow:${w.name}`}>
                      Workflow: {w.name} ({w.status})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              onClick={() => dispatch(clearMessages())}
              className={`rounded-xl p-2.5 transition ${
                darkMode
                  ? "text-slate-400 hover:bg-slate-800 hover:text-rose-300"
                  : "text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              }`}
              aria-label="Clear chat"
              title="Clear chat"
            >
              <FiTrash2 />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <ChatContainer
          apiUrl={API_URL}
          defaultModel={MODEL}
          agent={currentAgent}
          workflowName={currentWorkflowName}
          workflowOwnerId={currentWorkflowOwnerId}
        />
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-screen place-items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      }
    >
      <ChatView />
    </Suspense>
  );
}
