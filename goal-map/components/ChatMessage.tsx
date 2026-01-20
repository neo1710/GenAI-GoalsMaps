interface ChatMessageProps {
  role: string;
  content: string;
}

import Markdown from "./Markdown";

export default function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex w-full ${
        isUser ? "justify-end" : "justify-start"
      } mb-4 px-4 md:px-8 animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div
        className={`flex gap-3 max-w-xl lg:max-w-2xl ${
          isUser ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
            isUser
              ? "bg-blue-600 dark:bg-blue-500"
              : "bg-purple-600 dark:bg-purple-500"
          }`}
        >
          {isUser ? "You" : "AI"}
        </div>

        {/* Message Bubble */}
        <div
          className={`px-4 py-3 rounded-xl ${
            isUser
              ? "bg-blue-600 text-white rounded-br-none shadow-md"
              : "bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-bl-none shadow-sm"
          }`}
        >
          <div className="text-sm leading-relaxed">
            {isUser ? (
              <p>{content}</p>
            ) : (
              <Markdown content={content} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
