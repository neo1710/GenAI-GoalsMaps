"use client";

import { useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { FiChevronDown, FiGitBranch, FiSend } from "react-icons/fi";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  models: ChatModel[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  isLoadingModels: boolean;
  workflowName?: string;
}

export interface ChatModel {
  id: string;
  provider?: "groq" | "mistral";
}

export default function ChatInput({
  onSendMessage,
  isLoading,
  models,
  selectedModelId,
  onModelChange,
  isLoadingModels,
  workflowName,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const theme = useSelector((state: RootState) => state.theme.mode);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={`rounded-3xl border p-2 shadow-2xl backdrop-blur-xl transition-colors duration-200 ${
          theme === "dark"
            ? "border-slate-700/80 bg-slate-900/95 shadow-black/30"
            : "border-slate-200 bg-white/95 shadow-slate-400/20"
        }`}
      >
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
            placeholder={
              workflowName
                ? `Ask workflow "${workflowName}"…`
                : "Message your assistant…"
            }
            disabled={isLoading}
            className={`max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
              theme === "dark"
                ? "text-white placeholder-gray-500"
                : "text-gray-900 placeholder-gray-500"
            }`}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={isLoading ? "Sending message" : "Send message"}
          >
            {isLoading ? (
              <AiOutlineLoading3Quarters className="w-4 h-4 animate-spin" />
            ) : (
              <FiSend className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-2">
          {workflowName ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <FiGitBranch className="text-xs" />
              <span>Workflow DAG execution</span>
            </div>
          ) : (
            <div className="relative min-w-0">
              <FiChevronDown
                className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                  theme === "dark" ? "text-slate-400" : "text-slate-500"
                }`}
              />
              <select
                value={selectedModelId}
                onChange={(event) => onModelChange(event.target.value)}
                disabled={isLoading || isLoadingModels || models.length === 0}
                aria-label="Select AI model"
                className={`max-w-52 appearance-none rounded-lg py-1 pl-2 pr-7 text-xs font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  theme === "dark"
                    ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {models.map((model) => (
                  <option
                    key={`${model.provider ?? "default"}-${model.id}`}
                    value={model.id}
                  >
                    {model.id}
                    {model.provider ? ` (${model.provider})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p
            className={`text-[11px] ${
              theme === "dark" ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </form>
  );
}
