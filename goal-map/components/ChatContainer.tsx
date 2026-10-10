"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import ChatMessage from "./ChatMessage";
import ChatInput, { ChatModel, UploadedSandboxFile } from "./ChatInput";
import { streamChatResponse, ChatRequestBody } from "@/lib/streamingApi";
import {
  addMessage,
  setLoading,
  setError,
} from "@/store/slices/chatSlice";
import { RootState } from "@/store";
import type { Message } from "@/store/slices/chatSlice";
import {
  streamWorkflowChat,
  type WorkflowChatRequest,
  type WorkflowChatResponse,
  type WorkflowStreamEvent,
  type WorkflowTraceItem,
} from "@/lib/workflowsApi";
import { uploadSandboxFile } from "@/lib/sandboxApi";
import { FiGitBranch, FiMessageCircle, FiShield } from "react-icons/fi";

interface ChatContainerProps {
  apiUrl: string;
  defaultModel: string;
  agent?: string;
  workflowName?: string;
  workflowOwnerId?: string;
  hasSandboxAgent?: boolean;
}

export default function ChatContainer({
  apiUrl,
  defaultModel,
  agent,
  workflowName,
  workflowOwnerId,
  hasSandboxAgent = false,
}: ChatContainerProps) {
  const dispatch = useDispatch();
  const messages = useSelector((state: RootState) => state.chat.messages);
  const isLoading = useSelector((state: RootState) => state.chat.isLoading);
  const theme = useSelector((state: RootState) => state.theme.mode);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Local state for streaming message
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingWorkflowNode, setStreamingWorkflowNode] = useState<{
    name: string;
    type: string;
    step?: string;
    status?: string;
  } | undefined>(undefined);
  const [streamingWorkflowNodesProgress, setStreamingWorkflowNodesProgress] = useState<
    Array<{
      name: string;
      type: string;
      status: "running" | "completed" | "error" | string;
      durationMs?: number;
      step?: string;
    }>
  >([]);
  const [streamingWorkflowFilesCreated, setStreamingWorkflowFilesCreated] = useState<string[]>([]);
  const [streamingWorkflowStdout, setStreamingWorkflowStdout] = useState<string>("");
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(defaultModel);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  // Sandbox file uploading state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedSandboxFile[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  useEffect(() => {
    let active = true;
    const loadModels = async () => {
      try {
        const response = await fetch(`${apiUrl}/genAI/models`);
        if (!response.ok) throw new Error("Unable to load models");
        const data = (await response.json()) as { models?: ChatModel[] };
        const catalogue = Array.isArray(data.models) ? data.models.filter((model) => model?.id) : [];
        if (!active || catalogue.length === 0) return;
        setModels(catalogue);
        setSelectedModelId((current) =>
          catalogue.some((model) => model.id === current) ? current : catalogue[0].id
        );
      } catch (error) {
        console.warn("Could not load the model catalogue:", error);
      } finally {
        if (active) setIsLoadingModels(false);
      }
    };
    loadModels();
    return () => {
      active = false;
    };
  }, [apiUrl]);

  const selectedModel = models.find((model) => model.id === selectedModelId);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  const handleFileUpload = async (file: File) => {
    setIsUploadingFile(true);
    try {
      const res = await uploadSandboxFile(file, "input");
      toast.success(
        `Uploaded "${res.filename}" (${Math.round(res.size_bytes / 1024)} KB) to sandbox workspace input/`
      );
      setUploadedFiles((prev) => [
        ...prev.filter((f) => f.relative_path !== res.relative_path),
        {
          name: res.filename,
          folder: res.folder,
          relative_path: res.relative_path,
          size_bytes: res.size_bytes,
        },
      ]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file to sandbox");
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleRemoveUploadedFile = (relativePath: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.relative_path !== relativePath));
  };

  const handleSendMessage = useCallback(
    async (userMessage: string) => {
      if (isStreaming || isLoading) return;

      const currentMessages = [...messages];
      const newUserMessage: Message = { role: "user", content: userMessage };
      dispatch(addMessage(newUserMessage));
      dispatch(setLoading(true));
      dispatch(setError(null));

      // CASE 1: Chat with a Workflow (Real-Time SSE Streaming)
      if (workflowName) {
        setIsStreaming(true);
        setStreamingMessage("");
        setStreamingWorkflowNode(undefined);
        setStreamingWorkflowNodesProgress([]);
        setStreamingWorkflowFilesCreated([]);
        setStreamingWorkflowStdout("");

        try {
          let liveContent = "";
          let liveStdout = "";
          const liveFiles: string[] = [];
          const progressList: Array<{
            name: string;
            type: string;
            status: "running" | "completed" | "error" | string;
            durationMs?: number;
            step?: string;
          }> = [];

          const runResult: WorkflowChatResponse = await streamWorkflowChat(
            apiUrl,
            {
              workflowName,
              ...(workflowOwnerId && { workflowOwnerId }),
              messages: [...currentMessages, newUserMessage].map((m) => ({
                role: m.role as "user" | "assistant" | "system",
                content: m.content,
              })),
              stream: true,
            },
            (streamEvt: WorkflowStreamEvent) => {
              const { event, data } = streamEvt;
              const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;

              if (event === "workflow_start") {
                // workflow started
              } else if (event === "node_start") {
                const nodeName = String(d.nodeName || "");
                const nodeType = String(d.nodeType || "agent");
                setStreamingWorkflowNode({ name: nodeName, type: nodeType, status: "running" });
                const existing = progressList.find((p) => p.name === nodeName);
                if (!existing) {
                  progressList.push({ name: nodeName, type: nodeType, status: "running" });
                  setStreamingWorkflowNodesProgress([...progressList]);
                }
              } else if (event === "token" || event === "chunk") {
                const token =
                  typeof d.content === "string"
                    ? d.content
                    : typeof d.token === "string"
                    ? d.token
                    : typeof d.chunk === "string"
                    ? d.chunk
                    : typeof d.delta === "object" &&
                      d.delta !== null &&
                      "content" in d.delta &&
                      typeof (d.delta as { content?: unknown }).content === "string"
                    ? (d.delta as { content: string }).content
                    : typeof d.text === "string"
                    ? d.text
                    : typeof streamEvt.data === "string"
                    ? streamEvt.data
                    : "";
                if (token) {
                  liveContent += token;
                  setStreamingMessage(liveContent);
                }
              } else if (event === "step" || event === "status" || event === "log") {
                const stepText = String(d.step || d.status || d.message || d.log || "");
                if (stepText) {
                  setStreamingWorkflowNode((curr) => ({
                    name: curr?.name || String(d.nodeName || "Node"),
                    type: curr?.type || "sandbox_agent",
                    step: stepText,
                  }));
                }
              } else if (event === "stdout") {
                const outText = String(d.stdout || d.message || "");
                if (outText) {
                  liveStdout += outText;
                  if (!outText.endsWith("\n")) liveStdout += "\n";
                  setStreamingWorkflowStdout(liveStdout);
                }
              } else if (event === "stderr") {
                const errText = String(d.stderr || d.message || "");
                if (errText) {
                  liveStdout += `[stderr] ${errText}\n`;
                  setStreamingWorkflowStdout(liveStdout);
                }
              } else if (event === "file_created") {
                const f = String(d.file_path || d.filename || "");
                if (f && !liveFiles.includes(f)) {
                  liveFiles.push(f);
                  setStreamingWorkflowFilesCreated([...liveFiles]);
                }
              } else if (event === "node_complete") {
                const nodeName = String(d.nodeName || "");
                const dur = Number(d.durationMs ?? 0);
                const out = (d.output as Record<string, unknown>) || {};
                const pItem = progressList.find((p) => p.name === nodeName);
                if (pItem) {
                  pItem.status = "completed";
                  pItem.durationMs = dur;
                  setStreamingWorkflowNodesProgress([...progressList]);
                }
                if (Array.isArray(out.files_created)) {
                  for (const f of out.files_created) {
                    if (typeof f === "string" && !liveFiles.includes(f)) {
                      liveFiles.push(f);
                      setStreamingWorkflowFilesCreated([...liveFiles]);
                    }
                  }
                }
                if (typeof out.stdout === "string" && out.stdout) {
                  liveStdout += out.stdout;
                  if (!out.stdout.endsWith("\n")) liveStdout += "\n";
                  setStreamingWorkflowStdout(liveStdout);
                }
                if (!liveContent && typeof out.message === "string") {
                  liveContent = out.message;
                  setStreamingMessage(liveContent);
                } else if (!liveContent && typeof out.answer === "string") {
                  liveContent = out.answer;
                  setStreamingMessage(liveContent);
                }
              }
            }
          );

          // Extract files_created, preview, stdout, summary from outputs & trace
          const filesCreated: string[] = [...liveFiles];
          let preview: Array<Record<string, unknown>> | undefined;
          let stdout: string | undefined = liveStdout.trim() || undefined;
          let actionSummary: string | undefined;

          if (runResult.response?.outputs) {
            for (const out of Object.values(runResult.response.outputs)) {
              if (out && typeof out === "object") {
                const rec = out as Record<string, unknown>;
                if (Array.isArray(rec.files_created)) {
                  for (const f of rec.files_created) {
                    if (typeof f === "string" && !filesCreated.includes(f)) {
                      filesCreated.push(f);
                    }
                  }
                }
                if (Array.isArray(rec.preview) && rec.preview.length > 0 && !preview) {
                  preview = rec.preview as Array<Record<string, unknown>>;
                }
                if (typeof rec.stdout === "string" && rec.stdout.trim() && !stdout) {
                  stdout = rec.stdout.trim();
                }
                if (typeof rec.summary === "string" && !actionSummary) {
                  actionSummary = rec.summary;
                }
              }
            }
          }

          if (Array.isArray(runResult.trace)) {
            for (const step of runResult.trace) {
              if (step.output && typeof step.output === "object") {
                const rec = step.output as Record<string, unknown>;
                if (Array.isArray(rec.files_created)) {
                  for (const f of rec.files_created) {
                    if (typeof f === "string" && !filesCreated.includes(f)) {
                      filesCreated.push(f);
                    }
                  }
                }
                if (Array.isArray(rec.preview) && rec.preview.length > 0 && !preview) {
                  preview = rec.preview as Array<Record<string, unknown>>;
                }
                if (typeof rec.stdout === "string" && rec.stdout.trim() && !stdout) {
                  stdout = rec.stdout.trim();
                }
                if (typeof rec.summary === "string" && !actionSummary) {
                  actionSummary = rec.summary;
                }
              }
            }
          }

          dispatch(
            addMessage({
              role: "assistant",
              content: runResult.response?.message || liveContent,
              citations: runResult.response?.citations,
              finalNode: runResult.response?.finalNode,
              workflowName,
              outputs: runResult.response?.outputs,
              filesCreated: filesCreated.length > 0 ? filesCreated : undefined,
              preview,
              stdout,
              actionSummary,
              trace: runResult.trace,
              runId: runResult.run?.runId,
              durationMs: runResult.run?.durationMs,
            })
          );
        } catch (error) {
          console.error("Workflow chat error:", error);
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
          dispatch(setError(errorMessage));
          dispatch(
            addMessage({
              role: "assistant",
              content: `⚠️ Error running workflow "${workflowName}": ${errorMessage}`,
              workflowName,
            })
          );
        } finally {
          dispatch(setLoading(false));
          setIsStreaming(false);
          setStreamingMessage("");
          setStreamingWorkflowNode(undefined);
          setStreamingWorkflowNodesProgress([]);
          setStreamingWorkflowFilesCreated([]);
          setStreamingWorkflowStdout("");
        }
        return;
      }

      // CASE 2: Legacy Direct Agent Chat (Streaming)
      setIsStreaming(true);
      setStreamingMessage("");

      try {
        const requestBody: ChatRequestBody = {
          model: selectedModelId,
          ...(selectedModel?.provider && { provider: selectedModel.provider }),
          stream: true,
          messages: [...currentMessages, newUserMessage],
          ...(agent && { agent }),
        };

        let assistantResponse = "";
        for await (const chunk of streamChatResponse(`${apiUrl}/genAI/chat`, requestBody)) {
          assistantResponse += chunk;
          setStreamingMessage(assistantResponse);
        }

        dispatch(addMessage({ role: "assistant", content: assistantResponse }));
      } catch (error) {
        console.error("Agent chat error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        dispatch(setError(errorMessage));
        dispatch(
          addMessage({
            role: "assistant",
            content: `⚠️ Error: ${errorMessage}`,
          })
        );
      } finally {
        dispatch(setLoading(false));
        setIsStreaming(false);
        setStreamingMessage("");
      }
    },
    [
      messages,
      isStreaming,
      isLoading,
      dispatch,
      apiUrl,
      selectedModelId,
      selectedModel,
      agent,
      workflowName,
      workflowOwnerId,
    ]
  );

  const displayMessages = [...messages];
  if (isStreaming) {
    displayMessages.push({
      role: "assistant",
      content: streamingMessage,
      workflowName,
      filesCreated: streamingWorkflowFilesCreated.length > 0 ? streamingWorkflowFilesCreated : undefined,
      stdout: streamingWorkflowStdout || undefined,
    });
  }

  return (
    <div
      className={`flex flex-col h-full w-full transition-colors duration-200 ${
        theme === "dark" ? "bg-slate-950" : "bg-[#f7faff]"
      }`}
    >
      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4 flex flex-col transition-colors duration-200 ${
          theme === "dark" ? "bg-slate-950" : "bg-[#f7faff]"
        }`}
      >
        <div className="max-w-4xl mx-auto w-full">
          {displayMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-96">
              <div className="text-center py-12">
                <div
                  className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-colors duration-200 shadow-sm ${
                    theme === "dark" ? "bg-slate-900" : "bg-blue-100"
                  }`}
                >
                  {hasSandboxAgent ? (
                    <FiShield
                      className={`w-8 h-8 ${theme === "dark" ? "text-emerald-400" : "text-emerald-600"}`}
                    />
                  ) : workflowName ? (
                    <FiGitBranch
                      className={`w-8 h-8 ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}
                    />
                  ) : (
                    <FiMessageCircle
                      className={`w-8 h-8 ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}
                    />
                  )}
                </div>
                <p
                  className={`text-lg font-bold mb-2 transition-colors duration-200 ${
                    theme === "dark" ? "text-gray-100" : "text-gray-800"
                  }`}
                >
                  {workflowName
                    ? hasSandboxAgent
                      ? `Python Sandbox Workflow: ${workflowName}`
                      : `Workflow: ${workflowName}`
                    : "Ask your knowledge base"}
                </p>
                <p
                  className={`max-w-md mx-auto text-sm leading-6 transition-colors duration-200 ${
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {hasSandboxAgent
                    ? "This workflow connects to an isolated Python 3.12 sandbox with pandas & numpy. You can attach datasets to input/, run synthetic data generation, CSV profiling, and statistical code."
                    : workflowName
                    ? "Messages are processed through this saved workflow graph. The server executes node instructions and resolves terminal outputs and citations."
                    : "Choose a reasoning agent or a workflow to ask questions grounded in your indexed documents."}
                </p>
              </div>
            </div>
          ) : (
            <>
              {displayMessages.map((msg, index) => {
                const isThisStreaming = isStreaming && index === displayMessages.length - 1;
                return (
                  <ChatMessage
                    key={index}
                    role={msg.role}
                    content={msg.content}
                    isStreaming={isThisStreaming}
                    citations={msg.citations}
                    finalNode={msg.finalNode}
                    workflowName={msg.workflowName}
                    outputs={msg.outputs}
                    filesCreated={msg.filesCreated}
                    preview={msg.preview}
                    stdout={msg.stdout}
                    actionSummary={msg.actionSummary}
                    trace={msg.trace}
                    streamingNode={isThisStreaming ? streamingWorkflowNode : undefined}
                    nodesProgress={isThisStreaming ? streamingWorkflowNodesProgress : undefined}
                    durationMs={msg.durationMs}
                  />
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Input Container */}
      <div className="px-4 pb-5 pt-3 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto w-full">
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading || isStreaming}
            models={models.length ? models : [{ id: defaultModel }]}
            selectedModelId={selectedModelId}
            onModelChange={setSelectedModelId}
            isLoadingModels={isLoadingModels}
            workflowName={workflowName}
            hasSandboxAgent={hasSandboxAgent}
            onFileUpload={handleFileUpload}
            uploadedFiles={uploadedFiles}
            onRemoveUploadedFile={handleRemoveUploadedFile}
            isUploadingFile={isUploadingFile}
          />
        </div>
      </div>
    </div>
  );
}
