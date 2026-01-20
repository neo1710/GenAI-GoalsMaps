"use client";

import { useEffect, useRef, useState } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import { streamChatResponse, Message, ChatRequestBody } from "@/lib/streamingApi";

interface ChatContainerProps {
  apiUrl: string;
  model: string;
}

export default function ChatContainer({ apiUrl, model }: ChatContainerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (userMessage: string) => {
    // Add user message to chat
    const newUserMessage: Message = { role: "user", content: userMessage };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
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

        // Update assistant message in real-time
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === "assistant") {
            updated[updated.length - 1].content = assistantResponse;
          } else {
            updated.push({ role: "assistant", content: assistantResponse });
          }
          return updated;
        });
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white dark:bg-gray-900">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <p className="text-center">
              No messages yet. Start a conversation!
            </p>
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

      {/* Input Container */}
      <div className="border-t border-gray-300 dark:border-gray-700 p-6 bg-white dark:bg-gray-900">
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
}
