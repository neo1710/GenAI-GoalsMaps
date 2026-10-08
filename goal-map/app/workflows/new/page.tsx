"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiCheck, FiDatabase, FiEdit3, FiGitBranch, FiLoader, FiShield, FiZap } from "react-icons/fi";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import ThemeToggle from "@/components/ThemeToggle";
import { CreateWorkflowParams, workflowsApi } from "@/lib/workflowsApi";

const GROUNDED_TEMPLATE: CreateWorkflowParams = {
  name: "Grounded knowledge assistant",
  description: "Rewrite, search the knowledge base, then answer from retrieved sources.",
  status: "draft",
  nodes: [
    {
      name: "Question",
      type: "input",
      position: { x: 60, y: 180 },
    },
    {
      name: "Rewrite question",
      type: "agent",
      agentType: "prompt_agent",
      position: { x: 340, y: 180 },
      provider: "groq",
      model: "llama-3.1-8b-instant",
      prompt:
        'Rewrite the user\'s question as a short, standalone search query. Return JSON: {"query": string}.\n\nQuestion: {{Question.output.message}}',
    },
    {
      name: "Search knowledge base",
      type: "tool",
      position: { x: 640, y: 180 },
      tool: "knowledge_base_search",
      input: {
        query: "{{Rewrite question.output.query}}",
        topK: 5,
      },
    },
    {
      name: "Grounded answer",
      type: "agent",
      agentType: "prompt_agent",
      position: { x: 940, y: 180 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      prompt:
        "Answer only from these sources:\n{{Search knowledge base.output.results}}\n\nQuestion: {{Question.output.message}}\nInclude source titles.",
    },
  ],
  edges: [
    { from: "Question", to: "Rewrite question" },
    { from: "Rewrite question", to: "Search knowledge base" },
    { from: "Search knowledge base", to: "Grounded answer" },
  ],
};

const SANDBOX_PIPELINE_TEMPLATE: CreateWorkflowParams = {
  name: "Python Sandbox Data Pipeline",
  description: "Generate synthetic goal data in Python 3.12 sandbox, profile statistical distributions, and summarize key insights.",
  status: "draft",
  nodes: [
    {
      name: "Question",
      type: "input",
      position: { x: 60, y: 180 },
    },
    {
      name: "Generate Goals Dataset",
      type: "agent",
      agentType: "sandbox_agent",
      position: { x: 340, y: 180 },
      action: "create_synthetic_csv",
      parameters: {
        filename: "q3_goals.csv",
        template: "goals_and_milestones",
        row_count: 25,
        seed: 42,
      },
    },
    {
      name: "Profile Goals Data",
      type: "agent",
      agentType: "sandbox_agent",
      position: { x: 640, y: 180 },
      action: "analyze_csv",
      parameters: {
        filename: "q3_goals.csv",
        generate_markdown_report: true,
        top_correlations_count: 5,
      },
    },
    {
      name: "Data Scientist Agent",
      type: "agent",
      agentType: "prompt_agent",
      position: { x: 940, y: 180 },
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      prompt:
        "Based on the CSV dataset analysis below:\n{{Profile Goals Data.output.markdown_report}}\n\nAnswer the user's question:\n{{Question.output.message}}\n\nHighlight milestone deadlines, owner allocations, and budget risks.",
    },
  ],
  edges: [
    { from: "Question", to: "Generate Goals Dataset" },
    { from: "Generate Goals Dataset", to: "Profile Goals Data" },
    { from: "Profile Goals Data", to: "Data Scientist Agent" },
  ],
};

const SIMPLE_AGENT_TEMPLATE: CreateWorkflowParams = {
  name: "AI assistant flow",
  description: "Direct reasoning workflow using a prompt agent.",
  status: "draft",
  nodes: [
    {
      name: "Question",
      type: "input",
      position: { x: 120, y: 200 },
    },
    {
      name: "AI Assistant",
      type: "agent",
      agentType: "prompt_agent",
      position: { x: 440, y: 200 },
      prompt: "Respond thoughtfully to the user:\n\n{{Question.output.message}}",
    },
  ],
  edges: [{ from: "Question", to: "AI Assistant" }],
};

const BLANK_DRAFT_TEMPLATE: CreateWorkflowParams = {
  name: "Untitled workflow",
  description: "New blank workflow canvas draft.",
  status: "draft",
  nodes: [],
  edges: [],
};

export default function NewWorkflowPage() {
  const router = useRouter();
  const dark = useSelector((state: RootState) => state.theme.mode === "dark");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<"grounded" | "sandbox" | "simple" | "blank">("grounded");
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const template =
        selectedTemplate === "grounded"
          ? GROUNDED_TEMPLATE
          : selectedTemplate === "sandbox"
          ? SANDBOX_PIPELINE_TEMPLATE
          : selectedTemplate === "simple"
          ? SIMPLE_AGENT_TEMPLATE
          : BLANK_DRAFT_TEMPLATE;

      const payload: CreateWorkflowParams = {
        ...template,
        name: customName.trim() || template.name,
        ...(customDescription.trim() && { description: customDescription.trim() }),
        status: "draft",
      };
      const workflow = await workflowsApi.create(payload);
      router.replace(`/workflows/${workflow.workflowId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workflow");
      setBusy(false);
    }
  };

  const card = dark
    ? "border-slate-800 bg-slate-900 text-slate-100"
    : "border-blue-100 bg-white text-slate-900";
  const muted = dark ? "text-slate-400" : "text-slate-500";

  return (
    <main
      className={`grid min-h-screen place-items-center p-5 ${
        dark ? "bg-slate-950" : "bg-[#f7faff]"
      }`}
    >
      <div className={`w-full max-w-xl rounded-3xl border p-7 shadow-xl shadow-blue-950/5 ${card}`}>
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/workflows"
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-500"
          >
            <FiArrowLeft /> Workflows
          </Link>
          <ThemeToggle />
        </div>

        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/15 to-indigo-500/15 text-xl text-blue-500">
            <FiGitBranch />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-500">
              New workflow
            </p>
            <h1 className="text-2xl font-bold">Create a new workflow</h1>
          </div>
        </div>

        <p className={`text-sm leading-6 ${muted}`}>
          Choose a starter blueprint or initialize a blank canvas draft. Drafts permit saving in-progress
          graphs and disconnected nodes.
        </p>

        <div className="mt-6 space-y-3">
          <label className={`block text-xs font-bold uppercase tracking-wider ${muted}`}>
            Workflow template
          </label>

          <button
            type="button"
            onClick={() => setSelectedTemplate("grounded")}
            className={`w-full rounded-2xl border p-4 text-left transition ${
              selectedTemplate === "grounded"
                ? "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20"
                : dark
                ? "border-slate-800 hover:border-slate-700"
                : "border-slate-200 hover:border-blue-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500/10 text-sm text-blue-500 font-bold">
                  <FiDatabase />
                </span>
                <span className="font-bold text-sm">Grounded Knowledge Assistant (RAG)</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  selectedTemplate === "grounded"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                Recommended
              </span>
            </div>
            <p className={`mt-2 text-xs leading-5 ${muted}`}>
              Question ➔ Prompt Agent (Rewrite) ➔ Knowledge Base Search ➔ Grounded Answer. Ready to
              execute out of the box with citations.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTemplate("sandbox")}
            className={`w-full rounded-2xl border p-4 text-left transition ${
              selectedTemplate === "sandbox"
                ? "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20"
                : dark
                ? "border-slate-800 hover:border-slate-700"
                : "border-slate-200 hover:border-emerald-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/10 text-sm text-emerald-500 font-bold">
                  <FiShield />
                </span>
                <span className="font-bold text-sm">Python Sandbox Data Pipeline</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  selectedTemplate === "sandbox"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                Sandbox 🛡️
              </span>
            </div>
            <p className={`mt-2 text-xs leading-5 ${muted}`}>
              Question ➔ Synthetic Goals Generator ➔ Statistical CSV Profiler ➔ AI Data Scientist. Run Python 3.12, pandas & numpy in an isolated sandbox.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTemplate("simple")}
            className={`w-full rounded-2xl border p-4 text-left transition ${
              selectedTemplate === "simple"
                ? "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20"
                : dark
                ? "border-slate-800 hover:border-slate-700"
                : "border-slate-200 hover:border-blue-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-purple-500/10 text-sm text-purple-500 font-bold">
                  <FiZap />
                </span>
                <span className="font-bold text-sm">Basic AI Agent Flow</span>
              </div>
            </div>
            <p className={`mt-2 text-xs leading-5 ${muted}`}>
              Question ➔ Prompt Agent. A minimalist starter workflow ready for custom nodes and
              tools.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTemplate("blank")}
            className={`w-full rounded-2xl border p-4 text-left transition ${
              selectedTemplate === "blank"
                ? "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20"
                : dark
                ? "border-slate-800 hover:border-slate-700"
                : "border-slate-200 hover:border-blue-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-500/10 text-sm text-slate-500 font-bold">
                  <FiEdit3 />
                </span>
                <span className="font-bold text-sm">Blank Canvas Draft</span>
              </div>
              <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                Empty
              </span>
            </div>
            <p className={`mt-2 text-xs leading-5 ${muted}`}>
              Starts with an empty canvas. Add nodes and connections freely in draft mode.
            </p>
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <label className={`mb-1.5 block text-xs font-bold uppercase tracking-wider ${muted}`}>
              Workflow name
            </label>
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={
                selectedTemplate === "grounded"
                  ? "Grounded knowledge assistant"
                  : selectedTemplate === "simple"
                  ? "AI assistant flow"
                  : "Customer Support Assistant"
              }
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${
                dark
                  ? "border-slate-700 bg-slate-950 text-slate-100"
                  : "border-slate-200 bg-white text-slate-800"
              }`}
            />
          </div>

          <div>
            <label className={`mb-1.5 block text-xs font-bold uppercase tracking-wider ${muted}`}>
              Description (optional)
            </label>
            <input
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="e.g. Draft assistant for handling billing questions"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${
                dark
                  ? "border-slate-700 bg-slate-950 text-slate-100"
                  : "border-slate-200 bg-white text-slate-800"
              }`}
            />
          </div>
        </div>

        {error && (
          <p className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-500">
            {error}
          </p>
        )}

        <button
          onClick={create}
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? (
            <>
              <FiLoader className="animate-spin" /> Creating canvas…
            </>
          ) : (
            <>
              <FiCheck /> Create workflow
            </>
          )}
        </button>
      </div>
    </main>
  );
}
