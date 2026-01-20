import ChatContainer from "@/components/ChatContainer";

export default function ChatPage() {
  // Replace with your actual API URL
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/chat";
  const MODEL = process.env.NEXT_PUBLIC_MODEL || "gpt-3.5-turbo";

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-black">
      <header className="border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Chat Assistant
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Model: {MODEL}
        </p>
      </header>

      <main className="flex-1 overflow-hidden">
        <ChatContainer apiUrl={API_URL} model={MODEL} />
      </main>
    </div>
  );
}
