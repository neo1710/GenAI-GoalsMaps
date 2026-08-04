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
import { FiMessageCircle } from "react-icons/fi";

interface ChatContainerProps {
  apiUrl: string;
  defaultModel: string;
  agent: string;
}

export default function ChatContainer({ apiUrl, defaultModel, agent }: ChatContainerProps) {
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
        const data = await response.json() as { models?: ChatModel[] };
        const catalogue = Array.isArray(data.models) ? data.models.filter((model) => model?.id) : [];
        if (!active || catalogue.length === 0) return;
        setModels(catalogue);
        setSelectedModelId((current) => catalogue.some((model) => model.id === current) ? current : catalogue[0].id);
      } catch (error) {
        console.warn("Could not load the model catalogue:", error);
      } finally {
        if (active) setIsLoadingModels(false);
      }
    };
    loadModels();
    return () => { active = false; };
  }, [apiUrl]);

  const selectedModel = models.find((model) => model.id === selectedModelId);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  const handleSendMessage = useCallback(async (userMessage: string) => {
    if (isStreaming) return;

    // Capture current messages
    const currentMessages = [...messages];
    
    // Add user message to Redux
    const newUserMessage: Message = { role: "user", content: userMessage };
    dispatch(addMessage(newUserMessage));
    dispatch(setLoading(true));
    dispatch(setError(null));
    
    setIsStreaming(true);
    setStreamingMessage("");

    try {
      // Prepare request body
      const requestBody: ChatRequestBody = {
        model: selectedModelId,
        ...(selectedModel?.provider && { provider: selectedModel.provider }),
        stream: true,
        messages: [...currentMessages, newUserMessage],
        ...(agent && { agent }),
      };

      // Stream response using local state
      let assistantResponse = "";

      for await (const chunk of streamChatResponse(`${apiUrl}/genAI/chat`, requestBody)) {
        assistantResponse += chunk;
        setStreamingMessage(assistantResponse);
      }

      // Only add to Redux when complete
      dispatch(addMessage({ role: "assistant", content: assistantResponse }));
      
    } catch (error) {
      console.error("Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      dispatch(setError(errorMessage));
      dispatch(addMessage({ 
        role: "assistant", 
        content: `⚠️ Error: ${errorMessage}` 
      }));
    } finally {
      dispatch(setLoading(false));
      setIsStreaming(false);
      setStreamingMessage("");
    }
  }, [messages, isStreaming, dispatch, apiUrl, selectedModelId, selectedModel, agent]);

  // Combine messages with streaming message for display
  const displayMessages = [...messages];
  if (isStreaming && streamingMessage) {
    displayMessages.push({ role: "assistant", content: streamingMessage });
  }

  return (
    <div className={`flex flex-col h-full w-full transition-colors duration-200 ${
      theme === "dark"
        ? "bg-slate-950"
        : "bg-[#f7faff]"
    }`}>
      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4 flex flex-col transition-colors duration-200 ${
          theme === "dark"
            ? "bg-slate-950"
            : "bg-[#f7faff]"
        }`}
      >
        <div className="max-w-4xl mx-auto w-full">
          {displayMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-96">
              <div className="text-center py-12">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center transition-colors duration-200 ${
                  theme === "dark"
                    ? "bg-slate-900"
                    : "bg-blue-100"
                }`}>
                  <FiMessageCircle className={`w-8 h-8 ${
                    theme === "dark"
                      ? "text-blue-400"
                      : "text-blue-600"
                  }`} />
                </div>
                <p className={`text-lg font-semibold mb-2 transition-colors duration-200 ${
                  theme === "dark"
                    ? "text-gray-200"
                    : "text-gray-800"
                }`}>
                  Ask your knowledge base
                </p>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === "dark"
                    ? "text-gray-400"
                    : "text-gray-600"
                }`}>
                  Choose the Knowledge assistant to ask questions grounded in your indexed documents.
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
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} models={models.length ? models : [{ id: defaultModel }]} selectedModelId={selectedModelId} onModelChange={setSelectedModelId} isLoadingModels={isLoadingModels} />
        </div>
      </div>
    </div>
  );
}
