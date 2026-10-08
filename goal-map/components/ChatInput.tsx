"use client";

import { useRef, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import {
  FiChevronDown,
  FiFileText,
  FiGitBranch,
  FiPaperclip,
  FiSend,
  FiShield,
  FiX,
} from "react-icons/fi";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

export interface ChatModel {
  id: string;
  provider?: "groq" | "mistral";
}

export interface UploadedSandboxFile {
  name: string;
  folder: "input" | "output";
  relative_path: string;
  size_bytes?: number;
}

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  models: ChatModel[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  isLoadingModels: boolean;
  workflowName?: string;
  hasSandboxAgent?: boolean;
  onFileUpload?: (file: File) => Promise<void> | void;
  uploadedFiles?: UploadedSandboxFile[];
  onRemoveUploadedFile?: (relativePath: string) => void;
  isUploadingFile?: boolean;
}

export default function ChatInput({
  onSendMessage,
  isLoading,
  models,
  selectedModelId,
  onModelChange,
  isLoadingModels,
  workflowName,
  hasSandboxAgent = false,
  onFileUpload,
  uploadedFiles = [],
  onRemoveUploadedFile,
  isUploadingFile = false,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const theme = useSelector((state: RootState) => state.theme.mode);
  const dark = theme === "dark";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput("");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onFileUpload) {
      await onFileUpload(file);
    }
    // Reset file input so user can pick the same file again if desired
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const insertFileReference = (relPath: string) => {
    setInput((prev) => {
      if (prev.includes(relPath)) return prev;
      return prev ? `${prev} ${relPath}` : `Inspect ${relPath} and `;
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={`rounded-3xl border p-2.5 shadow-2xl backdrop-blur-xl transition-colors duration-200 ${
          dark
            ? "border-slate-700/80 bg-slate-900/95 shadow-black/30"
            : "border-slate-200 bg-white/95 shadow-slate-400/20"
        }`}
      >
        {/* Uploaded Sandbox files preview pills */}
        {hasSandboxAgent && uploadedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 px-2 pt-1 border-b border-inherit pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sandbox Files:
            </span>
            {uploadedFiles.map((file) => (
              <span
                key={file.relative_path}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  dark
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                <FiFileText className="text-xs text-emerald-500" />
                <button
                  type="button"
                  onClick={() => insertFileReference(file.relative_path)}
                  title="Click to insert path in prompt"
                  className="font-mono text-[11px] hover:underline"
                >
                  {file.relative_path}
                </button>
                {onRemoveUploadedFile && (
                  <button
                    type="button"
                    onClick={() => onRemoveUploadedFile(file.relative_path)}
                    title="Remove from prompt"
                    className="ml-0.5 rounded p-0.5 hover:bg-emerald-500/20"
                  >
                    <FiX className="text-xs" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* File Upload Trigger for Sandbox Workflows */}
          {hasSandboxAgent && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.json,.py,.tsv,.xlsx"
                onChange={handleFileChange}
                className="hidden"
                id="sandbox-chat-file-upload"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isUploadingFile}
                title="Upload dataset to Sandbox (input/)"
                className={`mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition ${
                  isUploadingFile
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                    : dark
                    ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-emerald-500/50 hover:bg-slate-700 hover:text-emerald-400"
                    : "border-slate-200 bg-slate-100 text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
                } disabled:cursor-not-allowed disabled:opacity-50`}
                aria-label="Upload dataset to sandbox"
              >
                {isUploadingFile ? (
                  <AiOutlineLoading3Quarters className="w-4 h-4 animate-spin text-emerald-500" />
                ) : (
                  <FiPaperclip className="w-4 h-4" />
                )}
              </button>
            </>
          )}

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
              hasSandboxAgent
                ? `Prompt sandbox workflow "${workflowName}" (e.g. Inspect input/data.csv)…`
                : workflowName
                ? `Ask workflow "${workflowName}"…`
                : "Message your assistant…"
            }
            disabled={isLoading || isUploadingFile}
            className={`max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
              dark ? "text-white placeholder-gray-500" : "text-gray-900 placeholder-gray-500"
            }`}
          />

          <button
            type="submit"
            disabled={isLoading || isUploadingFile || !input.trim()}
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

        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1 pt-2">
          <div className="flex items-center gap-2">
            {workflowName ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <FiGitBranch className="text-xs" />
                <span>Workflow DAG</span>
              </div>
            ) : (
              <div className="relative min-w-0">
                <FiChevronDown
                  className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                    dark ? "text-slate-400" : "text-slate-500"
                  }`}
                />
                <select
                  value={selectedModelId}
                  onChange={(event) => onModelChange(event.target.value)}
                  disabled={isLoading || isLoadingModels || models.length === 0}
                  aria-label="Select AI model"
                  className={`max-w-52 appearance-none rounded-lg py-1 pl-2 pr-7 text-xs font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    dark
                      ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {models.map((model) => (
                    <option key={`${model.provider ?? "default"}-${model.id}`} value={model.id}>
                      {model.id}
                      {model.provider ? ` (${model.provider})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sandbox Agent Indicator */}
            {hasSandboxAgent && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <FiShield className="text-xs" />
                <span>Python Sandbox 🛡️</span>
              </div>
            )}
          </div>

          <p className={`text-[11px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
            {hasSandboxAgent
              ? "Attach CSV or type instructions · Shift+Enter for newline"
              : "Enter to send · Shift+Enter for newline"}
          </p>
        </div>
      </div>
    </form>
  );
}
