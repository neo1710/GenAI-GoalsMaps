interface ChatMessageProps {
  role: string;
  content: string;
}

import { useSelector } from "react-redux";
import { RootState } from "@/store";
import Markdown from "./Markdown";

export default function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";
  const theme = useSelector((state: RootState) => state.theme.mode);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`flex gap-2 sm:gap-3 max-w-xs sm:max-w-sm md:max-w-lg lg:max-w-xl xl:max-w-2xl ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white text-xs font-bold transition-colors duration-200 ${
          isUser
            ? "bg-blue-600"
            : theme === "dark"
            ? "bg-purple-500"
            : "bg-purple-600"
        }`}>
          {isUser ? "U" : "AI"}
        </div>

        {/* Message Bubble */}
        <div className={`px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-colors duration-200 ${
          isUser
            ? "bg-blue-600 text-white rounded-br-none shadow-sm"
            : theme === "dark"
            ? "bg-slate-800 text-gray-100 rounded-bl-none shadow-sm"
            : "bg-gray-100 text-gray-900 rounded-bl-none shadow-sm"
        }`}>
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
