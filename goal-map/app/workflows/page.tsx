"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  FiArrowRight,
  FiArrowUpRight,
  FiClock,
  FiGitBranch,
  FiLayers,
  FiMessageSquare,
  FiPlus,
  FiSearch,
  FiUser,
  FiZap,
} from "react-icons/fi";
import { RootState } from "@/store";
import ThemeToggle from "@/components/ThemeToggle";
import { DEFAULT_OWNER_ID, Workflow, workflowsApi } from "@/lib/workflowsApi";

export default function WorkflowsPage() {
  const dark = useSelector((state: RootState) => state.theme.mode === "dark");
  const [items, setItems] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [scope, setScope] = useState<"all" | "mine">("all");

  const loadWorkflows = async (ownerScope: "all" | "mine") => {
    setLoading(true);
    setError("");
    try {
      const data = await workflowsApi.list(
        ownerScope === "mine" ? { ownerId: DEFAULT_OWNER_ID } : undefined
      );
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workflows");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkflows(scope);
  }, [scope]);

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === "all" || item.status === filter) &&
          `${item.name} ${item.description || ""}`.toLowerCase().includes(query.toLowerCase())
      ),
    [items, filter, query]
  );

  const card = dark ? "border-slate-800 bg-slate-900" : "border-blue-100 bg-white";
  const muted = dark ? "text-slate-400" : "text-slate-500";

  return (
    <main
      className={`min-h-screen ${
        dark ? "bg-slate-950 text-slate-100" : "bg-[#f7faff] text-slate-900"
      }`}
    >
      <header
        className={`sticky top-0 z-20 border-b backdrop-blur-xl ${
          dark ? "border-slate-800 bg-slate-950/85" : "border-blue-100 bg-white/85"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
              <FiLayers />
            </span>
            <span className="text-lg font-bold">
              Lumen<span className="text-blue-500">base</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/chat"
              className={`hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold sm:flex ${muted}`}
            >
              <FiZap className="text-blue-500" /> Ask AI
            </Link>
            <ThemeToggle />
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700"
            >
              <FiPlus /> New workflow
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-blue-500">
              Automation studio
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Workflows</h1>
            <p className={`mt-2 max-w-xl text-sm leading-6 ${muted}`}>
              Build, test, and run directed acyclic graphs combining AI prompt agents with knowledge
              base search tools.
            </p>
          </div>
          <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${card}`}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-500">
              <FiGitBranch />
            </span>
            <div>
              <p className="text-lg font-bold leading-5">{items.length}</p>
              <p className={`text-xs ${muted}`}>Total workflows</p>
            </div>
          </div>
        </div>

        <section className={`rounded-3xl border p-5 sm:p-7 ${card}`}>
          {/* Controls bar */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <FiSearch className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${muted}`} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workflows by name or description…"
                className={`w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 ${card}`}
              />
            </div>

            {/* Scope filter: All vs Mine */}
            <div
              className={`flex rounded-xl border p-1 ${
                dark ? "border-slate-700 bg-slate-950" : "border-blue-100 bg-blue-50/70"
              }`}
            >
              <button
                onClick={() => setScope("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  scope === "all" ? "bg-blue-600 text-white shadow" : muted
                }`}
              >
                All
              </button>
              <button
                onClick={() => setScope("mine")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
                  scope === "mine" ? "bg-blue-600 text-white shadow" : muted
                }`}
              >
                <FiUser className="text-xs" /> My workflows
              </button>
            </div>

            {/* Status filter: All / Draft / Published */}
            <div
              className={`flex rounded-xl border p-1 ${
                dark ? "border-slate-700 bg-slate-950" : "border-blue-100 bg-blue-50/70"
              }`}
            >
              {(["all", "draft", "published"] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${
                    filter === val ? "bg-blue-600 text-white shadow" : muted
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid min-h-64 place-items-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div
              className={`rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-sm ${
                dark ? "text-rose-300" : "text-rose-700"
              }`}
            >
              <p className="font-semibold">Couldn’t connect to workflows</p>
              <p className="mt-1 opacity-80">{error}</p>
              <button
                onClick={() => void loadWorkflows(scope)}
                className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                Try again
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="grid min-h-72 place-items-center text-center">
              <div>
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/10 text-2xl text-blue-500">
                  <FiGitBranch />
                </span>
                <h2 className="text-lg font-bold">
                  {items.length ? "No matching workflows" : "Build your first workflow"}
                </h2>
                <p className={`mx-auto mt-2 max-w-sm text-sm leading-6 ${muted}`}>
                  {items.length
                    ? "Try adjusting your search query or status filter."
                    : "Create a workflow graph with reasoning agents and knowledge-base search tools."}
                </p>
                {!items.length && (
                  <Link
                    href="/workflows/new"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    <FiPlus /> Create workflow
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((workflow) => (
                <div
                  key={workflow.workflowId}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-950/5 ${card}`}
                >
                  <div>
                    <div className="mb-4 flex items-start justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500/15 to-indigo-500/15 text-lg text-blue-500">
                        <FiGitBranch />
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          workflow.status === "published"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {workflow.status}
                      </span>
                    </div>

                    <Link href={`/workflows/${workflow.workflowId}`} className="block">
                      <h2 className="truncate text-base font-bold group-hover:text-blue-500">
                        {workflow.name}
                      </h2>
                    </Link>
                    <p className={`mt-1.5 line-clamp-2 min-h-10 text-sm leading-5 ${muted}`}>
                      {workflow.description || "No description provided."}
                    </p>
                  </div>

                  <div className="mt-5">
                    {/* Action buttons */}
                    <div className="mb-3 flex items-center gap-2">
                      <Link
                        href={`/workflows/${workflow.workflowId}`}
                        className={`flex-1 rounded-xl border py-2 text-center text-xs font-bold transition ${
                          dark
                            ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        Canvas
                      </Link>
                      <Link
                        href={`/chat?workflow=${encodeURIComponent(
                          workflow.name
                        )}&ownerId=${encodeURIComponent(workflow.ownerId)}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                      >
                        <FiMessageSquare className="text-xs" />
                        <span>Chat</span>
                      </Link>
                    </div>

                    <div
                      className={`flex items-center gap-4 border-t pt-3 text-xs ${
                        dark ? "border-slate-800" : "border-slate-100"
                      }`}
                    >
                      <span className={`flex items-center gap-1.5 ${muted}`}>
                        <FiLayers className="text-blue-500" />{" "}
                        {Array.isArray(workflow.nodes) ? workflow.nodes.length : 0} nodes
                      </span>
                      <span className={muted}>v{workflow.version}</span>
                      <span className={`ml-auto flex items-center gap-1.5 ${muted}`}>
                        <FiClock />{" "}
                        {new Date(workflow.updatedAt).toLocaleDateString("en", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className={`mt-5 flex items-center justify-between text-xs ${muted}`}>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Drafts are private; published workflows can be run by anyone in the workspace.</span>
          </div>
          <Link
            href="/chat"
            className="flex items-center gap-1 text-blue-500 font-semibold hover:underline"
          >
            Go to Ask AI <FiArrowRight />
          </Link>
        </div>
      </div>
    </main>
  );
}
