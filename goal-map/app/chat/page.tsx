"use client";

import { useSelector, useDispatch } from "react-redux";
import { useState } from "react";
import { RootState } from "@/store";
import ChatContainer from "@/components/ChatContainer";
import ThemeToggle from "@/components/ThemeToggle";
import { FiMessageCircle, FiTrash2 } from "react-icons/fi";
import { clearMessages } from "@/store/slices/chatSlice";

export default function ChatPage() {
  const dispatch = useDispatch();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/chat";
  const MODEL = process.env.NEXT_PUBLIC_MODEL || "gpt-3.5-turbo";
  const theme = useSelector((state: RootState) => state.theme.mode);
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  const handleClearChat = () => {
    dispatch(clearMessages());
  };

  return (
    <div className={`flex h-screen flex-col transition-colors duration-200 ${
      theme === "dark"
        ? "bg-slate-950 text-gray-50"
        : "bg-white text-gray-900"
    }`}>
      {/* Header */}
      <header className={`border-b transition-colors duration-200 px-4 sm:px-6 lg:px-8 py-3 ${
        theme === "dark"
          ? "border-slate-700 bg-slate-900"
          : "border-gray-200 bg-white"
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg transition-colors duration-200 ${
              theme === "dark"
                ? "bg-slate-800"
                : "bg-blue-100"
            }`}>
              <FiMessageCircle className={`w-5 h-5 ${
                theme === "dark"
                  ? "text-blue-400"
                  : "text-blue-600"
              }`} />
            </div>
            <div>
              <h1 className={`text-xl sm:text-2xl font-bold ${
                theme === "dark"
                  ? "text-blue-400"
                  : "text-blue-600"
              }`}>
                Chat Assistant
              </h1>
              <p className={`text-xs sm:text-sm ${
                theme === "dark"
                  ? "text-gray-400"
                  : "text-gray-600"
              }`}>
                {MODEL}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                theme === "dark"
                  ? "bg-slate-800 text-gray-200 border border-slate-700 hover:bg-slate-700"
                  : "bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200"
              }`}
            >
              <option value="">Select Agent</option>
              <option value="critiqueAgent">Critique Agent</option>
            </select>
            <button
              onClick={handleClearChat}
              className={`p-2.5 rounded-lg transition-colors duration-200 hover:scale-110 ${
                theme === "dark"
                  ? "bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-red-400"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-red-600"
              }`}
              title="Clear chat history"
            >
              <FiTrash2 className="w-5 h-5" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className={`flex-1 overflow-hidden flex flex-col transition-colors duration-200 ${
        theme === "dark"
          ? "bg-slate-950"
          : "bg-white"
      }`}>
        <ChatContainer apiUrl={API_URL} model={MODEL} agent={selectedAgent} />
      </main>
    </div>
  );
}
