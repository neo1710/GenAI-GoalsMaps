"use client";

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import { streamChatResponse, ChatRequestBody } from "@/lib/streamingApi";
import {
  addMessage,
  updateLastMessage,
  setLoading,
  setError,
} from "@/store/slices/chatSlice";
import { RootState } from "@/store";
import type { Message } from "@/store/slices/chatSlice";
import { FiMessageCircle } from "react-icons/fi";

interface ChatContainerProps {
  apiUrl: string;
  model: string;
}

export default function ChatContainer({ apiUrl, model }: ChatContainerProps) {
  const dispatch = useDispatch();
  const messages = useSelector((state: RootState) => state.chat.messages);
  const isLoading = useSelector((state: RootState) => state.chat.isLoading);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (userMessage: string) => {
    // Add user message to chat
    const newUserMessage: Message = { role: "user", content: userMessage };
    dispatch(addMessage(newUserMessage));
    dispatch(setLoading(true));
    dispatch(setError(null));

    try {
      // Add assistant placeholder message
      dispatch(addMessage({ role: "assistant", content: "" }));

      // Prepare request body
      const requestBody: ChatRequestBody = {
        model,
        stream: true,
        messages: [...messages, newUserMessage],
      };

      // Stream response and collect chunks
      let assistantResponse = "";

      for await (const chunk of streamChatResponse(apiUrl, requestBody)) {
        assistantResponse += chunk;
        dispatch(updateLastMessage(assistantResponse));
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      dispatch(setError(errorMessage));
      dispatch(
        updateLastMessage(`⚠️ Error: ${errorMessage}`)
      );
    } finally {
      dispatch(setLoading(false));
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-950">
      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4 flex flex-col"
      >
        <div className="max-w-4xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-96">
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FiMessageCircle className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Start a Conversation
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Type a message to begin chatting with the AI
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => (
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
      <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto w-full">
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
