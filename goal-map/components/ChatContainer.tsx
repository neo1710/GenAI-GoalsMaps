"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatMessage from "./ChatMessage";
import ChatInput, { ChatModel } from "./ChatInput";
import { streamChatResponse, ChatRequestBody } from "@/lib/streamingApi";
import {
  addMessage,
  setLoading,
  setError,
} from "@/store/slices/chatSlice";
import { RootState } from "@/store";
import type { Message } from "@/store/slices/chatSlice";
import type { WorkflowChatRequest, WorkflowChatResponse } from "@/lib/workflowsApi";
import { FiGitBranch, FiMessageCircle } from "react-icons/fi";

interface ChatContainerProps {
  apiUrl: string;
  defaultModel: string;
  agent?: string;
  workflowName?: string;
  workflowOwnerId?: string;
}

export default function ChatContainer({
  apiUrl,
  defaultModel,
  agent,
  workflowName,
  workflowOwnerId,
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
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(defaultModel);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

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

  const handleSendMessage = useCallback(
    async (userMessage: string) => {
      if (isStreaming || isLoading) return;

      const currentMessages = [...messages];
      const newUserMessage: Message = { role: "user", content: userMessage };
      dispatch(addMessage(newUserMessage));
      dispatch(setLoading(true));
      dispatch(setError(null));

      // CASE 1: Chat with a Workflow
      // "Pass workflowName to select workflow execution. Do not send agent at the same time;
      // workflowName takes precedence over the legacy direct-agent behavior.
      // Workflow streaming is not available in this initial endpoint. Do not set stream: true"
      if (workflowName) {
        try {
          const payload: WorkflowChatRequest = {
            workflowName,
            ...(workflowOwnerId && { workflowOwnerId }),
            messages: [...currentMessages, newUserMessage].map((m) => ({
              role: m.role as "user" | "assistant" | "system",
              content: m.content,
            })),
            stream: false,
          };

          const res = await fetch(`${apiUrl}/genAI/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            let msg = `Workflow request failed (${res.status})`;
            try {
              const data = await res.json();
              msg = data.message
                ? Array.isArray(data.message)
                  ? data.message.join(" · ")
                  : data.message
                : data.error || msg;
            } catch {
              msg = await res.text();
            }
            throw new Error(msg);
          }

          const runResult: WorkflowChatResponse = await res.json();
          dispatch(
            addMessage({
              role: "assistant",
              content: runResult.response.message,
              citations: runResult.response.citations,
              finalNode: runResult.response.finalNode,
              workflowName,
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
  if (isStreaming && streamingMessage) {
    displayMessages.push({ role: "assistant", content: streamingMessage });
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
                  {workflowName ? (
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
                  {workflowName ? `Workflow: ${workflowName}` : "Ask your knowledge base"}
                </p>
                <p
                  className={`max-w-md mx-auto text-sm leading-6 transition-colors duration-200 ${
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {workflowName
                    ? "Messages are processed through this saved workflow graph. The server executes node instructions and resolves terminal outputs and citations."
                    : "Choose a reasoning agent or a workflow to ask questions grounded in your indexed documents."}
                </p>
              </div>
            </div>
          ) : (
            <>
              {displayMessages.map((msg, index) => (
                <ChatMessage
                  key={index}
                  role={msg.role}
                  content={msg.content}
                  citations={msg.citations}
                  finalNode={msg.finalNode}
                  workflowName={msg.workflowName}
                />
              ))}
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
          />
        </div>
      </div>
    </div>
  );
}
