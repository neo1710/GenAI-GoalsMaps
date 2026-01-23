"use client";

import { useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { FiSend } from "react-icons/fi";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

export default function ChatInput({
  onSendMessage,
  isLoading,
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
      <div className="flex gap-2 sm:gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading}
          className={`flex-1 px-4 py-2.5 sm:py-3 rounded-lg border transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed ${
            theme === "dark"
              ? "border-slate-700 bg-slate-800 text-white placeholder-gray-400 focus:ring-blue-400"
              : "border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:ring-blue-500"
          }`}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
        >
          {isLoading ? (
            <>
              <AiOutlineLoading3Quarters className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Sending...</span>
            </>
          ) : (
            <>
              <FiSend className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
