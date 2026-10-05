"use client";

import { useState } from "react";
import { useSelector } from "react-redux";
import { FiChevronDown, FiDatabase, FiGitBranch } from "react-icons/fi";
import { RootState } from "@/store";
import type { MessageCitation } from "@/store/slices/chatSlice";
import Markdown from "./Markdown";

interface ChatMessageProps {
  role: string;
  content: string;
  isStreaming?: boolean;
  citations?: MessageCitation[];
  finalNode?: { name: string; type: string };
  workflowName?: string;
}

export default function ChatMessage({
  role,
  content,
  isStreaming = false,
  citations,
  finalNode,
  workflowName,
}: ChatMessageProps) {
  const isUser = role === "user";
  const theme = useSelector((state: RootState) => state.theme.mode);
  const [sourcesOpen, setSourcesOpen] = useState(true);

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
              : theme === "dark"
              ? "bg-purple-500"
              : "bg-purple-600"
          }`}
        >
          {isUser ? "U" : workflowName ? <FiGitBranch /> : "AI"}
        </div>

        {/* Message Bubble container */}
        <div className="flex-1 space-y-2">
          {/* Main Bubble */}
          <div
            className={`px-4 py-3 rounded-2xl transition-colors duration-200 ${
              isUser
                ? "bg-blue-600 text-white rounded-br-none shadow-sm"
                : theme === "dark"
                ? "bg-slate-900 border border-slate-800 text-gray-100 rounded-bl-none shadow-sm"
                : "border border-blue-100 bg-white text-gray-900 rounded-bl-none shadow-sm"
            }`}
          >
            {/* Workflow Origin tag */}
            {!isUser && (workflowName || finalNode) && (
              <div className="mb-2 flex items-center gap-2 border-b pb-2 text-[10px] font-semibold opacity-70 border-slate-200 dark:border-slate-800">
                <span className="flex items-center gap-1 text-blue-500">
                  <FiGitBranch />
                  <span>{workflowName || "Workflow"}</span>
                </span>
                {finalNode && (
                  <>
                    <span>·</span>
                    <span>
                      terminal: {finalNode.name} ({finalNode.type})
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="text-sm leading-relaxed">
              {isUser ? (
                <p className="whitespace-pre-wrap">{content}</p>
              ) : (
                <Markdown content={content} isStreaming={isStreaming} />
              )}
            </div>
          </div>

          {/* Citations / Source Cards */}
          {!isUser && citations && citations.length > 0 && (
            <div className="rounded-2xl border border-blue-100/80 bg-blue-50/40 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60">
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
        </div>
      </div>
    </div>
  );
}
