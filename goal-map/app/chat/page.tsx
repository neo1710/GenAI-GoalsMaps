"use client";

import { useSelector } from "react-redux";
import { RootState } from "@/store";
import ChatContainer from "@/components/ChatContainer";
import ThemeToggle from "@/components/ThemeToggle";
import { FiMessageCircle } from "react-icons/fi";

export default function ChatPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/chat";
  const MODEL = process.env.NEXT_PUBLIC_MODEL || "gpt-3.5-turbo";
  const theme = useSelector((state: RootState) => state.theme.mode);

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
          <ThemeToggle />
        </div>
      </header>

      {/* Main Chat Area */}
      <main className={`flex-1 overflow-hidden flex flex-col transition-colors duration-200 ${
        theme === "dark"
          ? "bg-slate-950"
          : "bg-white"
      }`}>
        <ChatContainer apiUrl={API_URL} model={MODEL} />
      </main>
    </div>
  );
}
