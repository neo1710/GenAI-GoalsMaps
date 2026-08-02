"use client";

import Link from "next/link";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatContainer from "@/components/ChatContainer";
import ThemeToggle from "@/components/ThemeToggle";
import { RootState } from "@/store";
import { clearMessages } from "@/store/slices/chatSlice";
import { FiArrowLeft, FiBookOpen, FiMessageCircle, FiTrash2 } from "react-icons/fi";

export default function ChatPage() {
  const dispatch = useDispatch();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/chat";
  const MODEL = process.env.NEXT_PUBLIC_MODEL || "gpt-3.5-turbo";
  const darkMode = useSelector((state: RootState) => state.theme.mode === "dark");
  const [selectedAgent, setSelectedAgent] = useState("");
  const surface = darkMode ? "bg-slate-950 text-slate-100" : "bg-[#f7faff] text-slate-900";
  const card = darkMode ? "border-slate-800 bg-slate-900" : "border-blue-100 bg-white";
  const muted = darkMode ? "text-slate-400" : "text-slate-500";

  return <div className={`flex h-screen flex-col transition-colors duration-200 ${surface}`}>
    <header className={`sticky top-0 z-20 border-b backdrop-blur-xl ${darkMode ? "border-slate-800 bg-slate-950/85" : "border-blue-100 bg-white/85"}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="Back to knowledge base" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30"><FiBookOpen /></Link>
          <div className="min-w-0"><p className="text-lg font-bold">Lumen<span className="text-blue-500">base</span></p><div className={`flex items-center gap-1.5 text-xs ${muted}`}><FiMessageCircle className="text-blue-500" /><span className="truncate">AI workspace</span></div></div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className={`hidden items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold sm:flex ${darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-blue-50"}`}><FiArrowLeft /> Knowledge base</Link>
          <select value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)} aria-label="Select agent" className={`hidden rounded-xl border px-3 py-2.5 text-sm font-medium outline-none transition sm:block ${card} ${darkMode ? "hover:bg-slate-800" : "hover:bg-blue-50"}`}><option value="">General assistant</option><option value="critiqueAgent">Critique agent</option><option value="ragAgent">Knowledge assistant</option></select>
          <button onClick={() => dispatch(clearMessages())} className={`rounded-xl p-2.5 transition ${darkMode ? "text-slate-400 hover:bg-slate-800 hover:text-rose-300" : "text-slate-500 hover:bg-rose-50 hover:text-rose-600"}`} aria-label="Clear chat" title="Clear chat"><FiTrash2 /></button>
          <ThemeToggle />
        </div>
      </div>
    </header>
    <main className="min-h-0 flex-1"><ChatContainer apiUrl={API_URL} model={MODEL} agent={selectedAgent} /></main>
  </div>;
}
