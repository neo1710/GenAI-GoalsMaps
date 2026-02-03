"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
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
  model: string;
  agent: string;
}

export default function ChatContainer({ apiUrl, model, agent }: ChatContainerProps) {
  const dispatch = useDispatch();
  const messages = useSelector((state: RootState) => state.chat.messages);
  const isLoading = useSelector((state: RootState) => state.chat.isLoading);
  const theme = useSelector((state: RootState) => state.theme.mode);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Local state for streaming message
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);

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
        model,
        stream: true,
        messages: [...currentMessages, newUserMessage],
        ...(agent && { agent }),
      };

      // Stream response using local state
      let assistantResponse = "";

      for await (const chunk of streamChatResponse(`${apiUrl}/chat`, requestBody)) {
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
  }, [messages, isStreaming, dispatch, apiUrl, model, agent]);

  // Combine messages with streaming message for display
  const displayMessages = [...messages];
  if (isStreaming && streamingMessage) {
    displayMessages.push({ role: "assistant", content: streamingMessage });
  }

  return (
    <div className={`flex flex-col h-full w-full transition-colors duration-200 ${
      theme === "dark"
        ? "bg-slate-950"
        : "bg-white"
    }`}>
      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4 flex flex-col transition-colors duration-200 ${
          theme === "dark"
            ? "bg-slate-950"
            : "bg-white"
        }`}
      >
        <div className="max-w-4xl mx-auto w-full">
          {displayMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-96">
              <div className="text-center py-12">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center transition-colors duration-200 ${
                  theme === "dark"
                    ? "bg-slate-800"
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
                  Start a Conversation
                </p>
                <p className={`text-sm transition-colors duration-200 ${
                  theme === "dark"
                    ? "text-gray-400"
                    : "text-gray-600"
                }`}>
                  Type a message to begin chatting with the AI
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
      <div className={`border-t transition-colors duration-200 py-4 px-4 sm:px-6 lg:px-8 ${
        theme === "dark"
          ? "border-slate-700 bg-slate-900"
          : "border-gray-200 bg-white"
      }`}>
        <div className="max-w-4xl mx-auto w-full">
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}