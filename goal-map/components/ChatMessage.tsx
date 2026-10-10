"use client";

import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  FiCheck,
  FiChevronDown,
  FiClock,
  FiCopy,
  FiCpu,
  FiDatabase,
  FiDownload,
  FiFileText,
  FiGitBranch,
  FiLoader,
  FiPlay,
  FiTable,
  FiTerminal,
} from "react-icons/fi";
import { RootState } from "@/store";
import type { MessageCitation } from "@/store/slices/chatSlice";
import Markdown from "./Markdown";
import { getSandboxDownloadUrl } from "@/lib/sandboxApi";

export interface NodeProgressItem {
  name: string;
  type: string;
  status: "running" | "completed" | "error" | string;
  durationMs?: number;
  step?: string;
}

export interface ChatMessageProps {
  role: string;
  content: string;
  isStreaming?: boolean;
  citations?: MessageCitation[];
  finalNode?: { name: string; type: string };
  workflowName?: string;
  outputs?: Record<string, unknown>;
  filesCreated?: string[];
  preview?: Array<Record<string, unknown>>;
  stdout?: string;
  actionSummary?: string;
  trace?: Array<{
    nodeName: string;
    nodeType: string;
    status: string;
    durationMs: number;
    output?: Record<string, unknown>;
  }>;
  streamingNode?: { name: string; type: string; step?: string; status?: string };
  nodesProgress?: NodeProgressItem[];
  durationMs?: number;
}

export default function ChatMessage({
  role,
  content,
  isStreaming = false,
  citations,
  finalNode,
  workflowName,
  outputs,
  filesCreated,
  preview,
  stdout,
  actionSummary,
  trace,
  streamingNode,
  nodesProgress,
  durationMs,
}: ChatMessageProps) {
  const isUser = role === "user";
  const theme = useSelector((state: RootState) => state.theme.mode);
  const dark = theme === "dark";
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [stdoutOpen, setStdoutOpen] = useState(true);
  const [traceOpen, setTraceOpen] = useState(false);
  const [copiedStdout, setCopiedStdout] = useState(false);


  // Collect created files from props, outputs, or trace
  const allFilesCreated = useMemo(() => {
    const list: string[] = [...(filesCreated || [])];
    const checkObj = (val: unknown) => {
      if (
        val &&
        typeof val === "object" &&
        "files_created" in val &&
        Array.isArray((val as Record<string, unknown>).files_created)
      ) {
        for (const f of (val as Record<string, unknown>).files_created as unknown[]) {
          if (typeof f === "string" && !list.includes(f)) {
            list.push(f);
          }
        }
      }
    };
    if (outputs) {
      for (const val of Object.values(outputs)) checkObj(val);
    }
    if (trace) {
      for (const step of trace) checkObj(step.output);
    }
    return list;
  }, [filesCreated, outputs, trace]);

  // Extract preview data if not directly provided
  const allPreview = useMemo(() => {
    if (preview && preview.length > 0) return preview;
    if (outputs) {
      for (const val of Object.values(outputs)) {
        if (
          val &&
          typeof val === "object" &&
          "preview" in val &&
          Array.isArray((val as Record<string, unknown>).preview)
        ) {
          const p = (val as Record<string, unknown>).preview as Array<Record<string, unknown>>;
          if (p.length > 0) return p;
        }
      }
    }
    if (trace) {
      for (const step of trace) {
        if (
          step.output &&
          typeof step.output === "object" &&
          "preview" in step.output &&
          Array.isArray((step.output as Record<string, unknown>).preview)
        ) {
          const p = (step.output as Record<string, unknown>).preview as Array<Record<string, unknown>>;
          if (p.length > 0) return p;
        }
      }
    }
    return null;
  }, [preview, outputs, trace]);

  // Extract stdout if not directly provided
  const allStdout = useMemo(() => {
    if (stdout) return stdout;
    if (outputs) {
      for (const val of Object.values(outputs)) {
        if (
          val &&
          typeof val === "object" &&
          "stdout" in val &&
          typeof (val as Record<string, unknown>).stdout === "string"
        ) {
          const s = ((val as Record<string, unknown>).stdout as string).trim();
          if (s) return s;
        }
      }
    }
    if (trace) {
      for (const step of trace) {
        if (
          step.output &&
          typeof step.output === "object" &&
          "stdout" in step.output &&
          typeof (step.output as Record<string, unknown>).stdout === "string"
        ) {
          const s = ((step.output as Record<string, unknown>).stdout as string).trim();
          if (s) return s;
        }
      }
    }
    return null;
  }, [stdout, outputs, trace]);

  // Extract action summary if not directly provided
  const allSummary = useMemo(() => {
    if (actionSummary) return actionSummary;
    if (outputs) {
      for (const val of Object.values(outputs)) {
        if (
          val &&
          typeof val === "object" &&
          "summary" in val &&
          typeof (val as Record<string, unknown>).summary === "string"
        ) {
          return (val as Record<string, unknown>).summary as string;
        }
      }
    }
    if (trace) {
      for (const step of trace) {
        if (
          step.output &&
          typeof step.output === "object" &&
          "summary" in step.output &&
          typeof (step.output as Record<string, unknown>).summary === "string"
        ) {
          return (step.output as Record<string, unknown>).summary as string;
        }
      }
    }
    return null;
  }, [actionSummary, outputs, trace]);

  // Preview table column headers
  const previewColumns = useMemo(() => {
    if (!allPreview || allPreview.length === 0) return [];
    return Object.keys(allPreview[0]);
  }, [allPreview]);

  const copyToClipboard = (text: string, label = "Copied to clipboard") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  return (
    <div
      className={`flex w-full ${
        isUser ? "justify-end" : "justify-start"
      } mb-5 animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div
        className={`flex gap-2 sm:gap-3 max-w-xs sm:max-w-sm md:max-w-xl lg:max-w-2xl xl:max-w-3xl ${
          isUser ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm transition-colors duration-200 ${
            isUser
              ? "bg-blue-600"
              : workflowName
              ? "bg-gradient-to-br from-indigo-500 to-purple-600"
              : dark
              ? "bg-purple-500"
              : "bg-purple-600"
          }`}
        >
          {isUser ? "U" : workflowName ? <FiGitBranch /> : "AI"}
        </div>

        {/* Message Bubble container */}
        <div className="flex-1 space-y-2.5 min-w-0">
          {/* Main Bubble */}
          <div
            className={`px-4 py-3 rounded-2xl transition-colors duration-200 ${
              isUser
                ? "bg-blue-600 text-white rounded-br-none shadow-sm"
                : dark
                ? "bg-slate-900 border border-slate-800 text-gray-100 rounded-bl-none shadow-sm"
                : "border border-blue-100 bg-white text-gray-900 rounded-bl-none shadow-sm"
            }`}
          >
            {/* Workflow Origin & Final Node tag */}
            {!isUser && (workflowName || finalNode) && (
              <div className="mb-2 flex flex-wrap items-center gap-2 border-b pb-2 text-[10px] font-semibold opacity-80 border-slate-200 dark:border-slate-800">
                <span className="flex items-center gap-1 text-blue-500 font-bold">
                  <FiGitBranch />
                  <span>{workflowName || "Workflow"}</span>
                </span>
                {finalNode && (
                  <>
                    <span>·</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      terminal: <span className="font-bold">{finalNode.name}</span> ({finalNode.type})
                    </span>
                  </>
                )}
                {durationMs !== undefined && durationMs > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-slate-400 font-mono flex items-center gap-1">
                      <FiClock className="text-[9px]" /> {durationMs}ms
                    </span>
                  </>
                )}
                {allSummary && (
                  <>
                    <span>·</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-xs">
                      {allSummary}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Live Streaming Workflow Node Progress */}
            {!isUser && isStreaming && (streamingNode || (nodesProgress && nodesProgress.length > 0)) && (
              <div className="mb-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-xs text-blue-700 dark:text-blue-300">
                <div className="flex items-center justify-between font-bold text-[11px] mb-1">
                  <span className="flex items-center gap-1.5">
                    <FiLoader className="animate-spin text-blue-500 shrink-0" />
                    <span>Executing: <strong className="font-extrabold">{streamingNode?.name || "Workflow Node"}</strong></span>
                    {streamingNode?.type && (
                      <span className="rounded bg-blue-500/20 px-1.5 py-0.2 font-mono text-[9px]">
                        {streamingNode.type}
                      </span>
                    )}
                  </span>
                  {nodesProgress && nodesProgress.length > 0 && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      Step {nodesProgress.length}
                    </span>
                  )}
                </div>
                {(streamingNode?.step || streamingNode?.status) && (
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono flex items-center gap-1">
                    <span>↳</span>
                    <span>{streamingNode.step || streamingNode.status}</span>
                  </p>
                )}
              </div>
            )}

            {/* Markdown Message Content */}
            <div className="text-sm leading-relaxed overflow-x-auto">
              {isUser ? (
                <p className="whitespace-pre-wrap">{content}</p>
              ) : !content && isStreaming ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 italic py-1">
                  <FiLoader className="animate-spin text-blue-500 text-xs shrink-0" />
                  <span>Workflow is processing nodes...</span>
                </div>
              ) : (
                <Markdown content={content} isStreaming={isStreaming} />
              )}
            </div>
          </div>

          {/* Sandbox: Created Files Pills */}
          {!isUser && allFilesCreated.length > 0 && (
            <div
              className={`rounded-2xl border p-3 text-xs shadow-sm ${
                dark
                  ? "border-emerald-500/20 bg-emerald-500/5 text-slate-200"
                  : "border-emerald-200 bg-emerald-50/60 text-slate-800"
              }`}
            >
              <div className="mb-2 flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <FiDownload className="text-sm" />
                  <span>Files Created in Sandbox ({allFilesCreated.length})</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">Isolated workspace</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {allFilesCreated.map((filePath) => {
                  const downloadUrl = getSandboxDownloadUrl(filePath);
                  const fileName = filePath.replace(/^(input|output)\//, "");
                  const folder = filePath.startsWith("input/") ? "input" : "output";
                  const isExcel = fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls");
                  const isWord = fileName.toLowerCase().endsWith(".docx") || fileName.toLowerCase().endsWith(".doc");
                  const fileBadge = isExcel ? "EXCEL" : isWord ? "WORD" : "CSV/DATA";
                  return (
                    <div
                      key={filePath}
                      className={`group flex items-center gap-2 rounded-xl border px-3 py-1.5 transition ${
                        dark
                          ? isExcel
                            ? "border-emerald-700/60 bg-emerald-950/20 hover:border-emerald-500"
                            : isWord
                            ? "border-blue-700/60 bg-blue-950/20 hover:border-blue-500"
                            : "border-slate-700 bg-slate-800 hover:border-emerald-500/50"
                          : isExcel
                          ? "border-emerald-300 bg-emerald-50/50 hover:border-emerald-500"
                          : isWord
                          ? "border-blue-300 bg-blue-50/50 hover:border-blue-500"
                          : "border-emerald-200 bg-white hover:border-emerald-400"
                      }`}
                    >
                      <FiFileText className={`text-sm shrink-0 ${isExcel ? "text-emerald-500" : isWord ? "text-blue-500" : "text-slate-500"}`} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-xs leading-4">{fileName}</p>
                        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400">
                          <span>{folder}/</span>
                          <span>•</span>
                          <span className={isExcel ? "text-emerald-500 font-semibold" : isWord ? "text-blue-500 font-semibold" : ""}>{fileBadge}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-1 border-l pl-2 border-slate-200 dark:border-slate-700">
                        <a
                          href={downloadUrl}
                          download={fileName}
                          target="_blank"
                          rel="noreferrer"
                          title={`Download ${fileName}`}
                          className="rounded-lg p-1 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-500"
                        >
                          <FiDownload className="text-xs" />
                        </a>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(filePath, `Copied path ${filePath}`)}
                          title="Copy file path"
                          className="rounded-lg p-1 text-slate-500 hover:bg-blue-500/10 hover:text-blue-500"
                        >
                          <FiCopy className="text-xs" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sandbox: Data Preview Table */}
          {!isUser && allPreview && allPreview.length > 0 && (
            <div
              className={`rounded-2xl border text-xs shadow-sm overflow-hidden ${
                dark ? "border-slate-800 bg-slate-900" : "border-blue-100 bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className={`flex w-full items-center justify-between p-3 font-bold transition ${
                  dark ? "hover:bg-slate-800/60" : "hover:bg-blue-50/60"
                }`}
              >
                <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <FiTable />
                  <span>
                    Dataset Preview ({allPreview.length} rows · {previewColumns.length} columns)
                  </span>
                </span>
                <FiChevronDown
                  className={`text-xs transition-transform ${previewOpen ? "rotate-180" : ""}`}
                />
              </button>

              {previewOpen && (
                <div className="border-t border-inherit p-3">
                  <div className="max-h-72 overflow-auto rounded-xl border border-inherit">
                    <table className="min-w-full divide-y divide-inherit text-left text-[11px]">
                      <thead className={dark ? "bg-slate-800/80" : "bg-slate-100/80"}>
                        <tr>
                          {previewColumns.map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-inherit font-mono">
                        {allPreview.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={`transition ${
                              dark ? "hover:bg-slate-800/40" : "hover:bg-blue-50/40"
                            } ${rIdx % 2 === 1 ? (dark ? "bg-slate-950/30" : "bg-slate-50/40") : ""}`}
                          >
                            {previewColumns.map((col) => (
                              <td
                                key={`${rIdx}-${col}`}
                                className="px-3 py-1.5 whitespace-nowrap text-slate-700 dark:text-slate-300"
                              >
                                {row[col] !== undefined && row[col] !== null
                                  ? String(row[col])
                                  : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sandbox: Python Execution Console Stdout */}
          {!isUser && allStdout && (
            <div
              className={`rounded-2xl border text-xs shadow-sm overflow-hidden ${
                dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-900 text-slate-100"
              }`}
            >
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-800/70 border-b border-slate-700/50">
                <span className="flex items-center gap-2 font-bold text-[11px] text-amber-400">
                  <FiTerminal />
                  <span>Python 3.12 Sandbox Stdout</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      copyToClipboard(allStdout, "Console stdout copied");
                      setCopiedStdout(true);
                      setTimeout(() => setCopiedStdout(false), 2000);
                    }}
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-700"
                  >
                    {copiedStdout ? <FiCheck className="text-emerald-400" /> : <FiCopy />}
                    <span>{copiedStdout ? "Copied" : "Copy output"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStdoutOpen((v) => !v)}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    <FiChevronDown
                      className={`text-xs transition-transform ${stdoutOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
              </div>
              {stdoutOpen && (
                <pre className="max-h-56 overflow-auto p-3 font-mono text-[11px] leading-5 text-emerald-400/90 whitespace-pre-wrap">
                  {allStdout}
                </pre>
              )}
            </div>
          )}

          {/* Citations / Source Cards */}
          {!isUser && citations && citations.length > 0 && (
            <div className="rounded-2xl border border-blue-100/80 bg-blue-50/40 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60 shadow-sm">
              <button
                type="button"
                onClick={() => setSourcesOpen((v) => !v)}
                className="flex w-full items-center justify-between font-bold text-slate-700 dark:text-slate-300"
              >
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <FiDatabase />
                  <span>Retrieved sources ({citations.length})</span>
                </span>
                <FiChevronDown
                  className={`text-xs transition-transform ${sourcesOpen ? "rotate-180" : ""}`}
                />
              </button>

              {sourcesOpen && (
                <div className="mt-2.5 space-y-2">
                  {citations.map((c, i) => (
                    <div
                      key={`${c.documentId}-${i}`}
                      className="rounded-xl border border-blue-100 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex items-center justify-between font-semibold text-[11px]">
                        <span className="truncate text-blue-600 dark:text-blue-400">
                          {c.title || c.documentId}
                        </span>
                        <span className="ml-2 shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                          {Math.round(c.score * 100)}% match
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-slate-600 dark:text-slate-400">
                        {c.excerpt}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Workflow Execution Trace Accordion */}
          {!isUser && trace && trace.length > 0 && (
            <div
              className={`rounded-2xl border text-xs shadow-sm overflow-hidden ${
                dark ? "border-slate-800 bg-slate-900/60" : "border-slate-200/90 bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => setTraceOpen((v) => !v)}
                className={`flex w-full items-center justify-between p-3 font-bold transition ${
                  dark ? "hover:bg-slate-800/60" : "hover:bg-blue-50/50"
                }`}
              >
                <span className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <FiCpu />
                  <span>
                    Workflow Execution Trace ({trace.length} nodes · {durationMs ? `${durationMs}ms` : "completed"})
                  </span>
                </span>
                <FiChevronDown
                  className={`text-xs transition-transform ${traceOpen ? "rotate-180" : ""}`}
                />
              </button>

              {traceOpen && (
                <div className="border-t border-inherit p-3 space-y-2">
                  {trace.map((step, idx) => {
                    const stepSummary =
                      typeof step.output?.summary === "string"
                        ? step.output.summary
                        : typeof step.output?.message === "string"
                        ? step.output.message.slice(0, 150)
                        : null;
                    return (
                      <div
                        key={`${step.nodeName}-${idx}`}
                        className={`rounded-xl border p-2.5 text-[11px] ${
                          dark ? "border-slate-800 bg-slate-950/70" : "border-slate-100 bg-slate-50/80"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                            <FiCheck className="text-emerald-500 text-xs shrink-0" />
                            <span>{step.nodeName}</span>
                            <span className="font-normal opacity-60 text-[9px] font-mono">
                              ({step.nodeType})
                            </span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {step.durationMs}ms
                          </span>
                        </div>
                        {stepSummary && (
                          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-4">
                            {stepSummary}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
