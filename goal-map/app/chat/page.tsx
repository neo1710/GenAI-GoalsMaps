import ChatContainer from "@/components/ChatContainer";
import ThemeToggle from "@/components/ThemeToggle";

export default function ChatPage() {
  // Replace with your actual API URL
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/chat";
  const MODEL = process.env.NEXT_PUBLIC_MODEL || "gpt-3.5-turbo";

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-slate-950 text-gray-900 dark:text-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            Chat Assistant
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Model: <span className="font-medium text-gray-900 dark:text-gray-200">{MODEL}</span>
          </p>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-hidden bg-gradient-to-b from-gray-50 to-white dark:from-slate-900 dark:to-slate-950">
        <ChatContainer apiUrl={API_URL} model={MODEL} />
      </main>
    </div>
  );
}
