"use client";

import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownProps {
  content: string;
  isStreaming?: boolean;
}

export default function Markdown({ content, isStreaming = false }: MarkdownProps) {
  const theme = useSelector((state: RootState) => state.theme.mode);
  const [showReasoning, setShowReasoning] = useState(false);

  // Parse content to check for structured sections
  const parsedContent = useMemo(() => {
    // Try to parse JSON-like structure (reasoning, answer, confidence)
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.reasoning && parsed.answer && parsed.confidence) {
          return {
            hasStructure: true,
            type: "new",
            reasoning: parsed.reasoning,
            answer: parsed.answer,
            confidence: parsed.confidence.toLowerCase(),
          };
        }
      }
    } catch (e) {
      // Continue to next parsing method
    }

    // Legacy: Parse content to check for thought: and answer: sections
    const thoughtRegex = /Thoughts:\s*([\s\S]*?)(?=Answer:|$)/i;
    const answerRegex = /Answer:\s*([\s\S]*?)$/i;

    const thoughtMatch = content.match(thoughtRegex);
    const answerMatch = content.match(answerRegex);

    if (thoughtMatch && answerMatch) {
      return {
        hasStructure: true,
        type: "legacy",
        thought: thoughtMatch[1].trim(),
        answer: answerMatch[1].trim(),
      };
    }

    return {
      hasStructure: false,
      content: content,
    };
  }, [content]);

  // Helper function to get confidence color scheme
  const getConfidenceColors = (confidence: string) => {
    const colors: Record<
      string,
      { bg: string; border: string; text: string; icon: string }
    > = {
      high: {
        bg: theme === "dark" ? "bg-green-900/30" : "bg-green-50",
        border: theme === "dark" ? "border-green-700/50" : "border-green-200",
        text: theme === "dark" ? "text-green-100" : "text-green-900",
        icon: "✅",
      },
      medium: {
        bg: theme === "dark" ? "bg-yellow-900/30" : "bg-yellow-50",
        border:
          theme === "dark" ? "border-yellow-700/50" : "border-yellow-200",
        text: theme === "dark" ? "text-yellow-100" : "text-yellow-900",
        icon: "⚠️",
      },
      low: {
        bg: theme === "dark" ? "bg-red-900/30" : "bg-red-50",
        border: theme === "dark" ? "border-red-700/50" : "border-red-200",
        text: theme === "dark" ? "text-red-100" : "text-red-900",
        icon: "❌",
      },
    };
    return colors[confidence] || colors.medium;
  };

  const getConfidenceLabelColor = (confidence: string) => {
    const labelColors: Record<string, string> = {
      high: theme === "dark" ? "text-green-300" : "text-green-700",
      medium: theme === "dark" ? "text-yellow-300" : "text-yellow-700",
      low: theme === "dark" ? "text-red-300" : "text-red-700",
    };
    return labelColors[confidence] || labelColors.medium;
  };

  // Loading animation component
  const LoadingDots = () => (
    <div className="flex items-center gap-1">
      <span className={`text-sm ${theme === "dark" ? "text-blue-300" : "text-blue-700"}`}>
        Thinking
      </span>
      <span className="flex gap-0.5">
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-200 ${
          theme === "dark" ? "bg-blue-300" : "bg-blue-700"
        }`} style={{ animationDelay: "0ms" }}></span>
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-200 ${
          theme === "dark" ? "bg-blue-300" : "bg-blue-700"
        }`} style={{ animationDelay: "150ms" }}></span>
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-200 ${
          theme === "dark" ? "bg-blue-300" : "bg-blue-700"
        }`} style={{ animationDelay: "300ms" }}></span>
      </span>
    </div>
  );
  const markdownComponents = {
        // Headings
        h1: ({ children }: any) => (
          <h1 className={`text-lg font-bold mt-3 mb-2 transition-colors duration-200 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}>
            {children}
          </h1>
        ),
        h2: ({ children }: any) => (
          <h2 className={`text-base font-bold mt-3 mb-2 transition-colors duration-200 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}>
            {children}
          </h2>
        ),
        h3: ({ children }: any) => (
          <h3 className={`text-sm font-semibold mt-2 mb-1 transition-colors duration-200 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}>
            {children}
          </h3>
        ),
        h4: ({ children }: any) => (
          <h4 className={`text-sm font-semibold mt-2 mb-1 transition-colors duration-200 ${
            theme === "dark" ? "text-white" : "text-gray-900"
          }`}>
            {children}
          </h4>
        ),
        // Paragraphs
        p: ({ children }: any) => (
          <p className={`my-1 leading-relaxed transition-colors duration-200 ${
            theme === "dark" ? "text-gray-200" : "text-gray-800"
          }`}>
            {children}
          </p>
        ),
        // Lists
        ul: ({ children }: any) => (
          <ul className={`list-disc list-inside ml-2 my-2 space-y-1 transition-colors duration-200 ${
            theme === "dark" ? "text-gray-200" : "text-gray-800"
          }`}>
            {children}
          </ul>
        ),
        ol: ({ children }: any) => (
          <ol className={`list-decimal list-inside ml-2 my-2 space-y-1 transition-colors duration-200 ${
            theme === "dark" ? "text-gray-200" : "text-gray-800"
          }`}>
            {children}
          </ol>
        ),
        li: ({ children }: any) => (
          <li className={`transition-colors duration-200 ${
            theme === "dark" ? "text-gray-200" : "text-gray-800"
          }`}>{children}</li>
        ),
        // Blockquote
        blockquote: ({ children }: any) => (
          <blockquote className={`border-l-4 border-blue-500 pl-3 italic my-2 py-1 transition-colors duration-200 ${
            theme === "dark"
              ? "text-gray-300 bg-gray-800/50"
              : "text-gray-700 bg-gray-100"
          }`}>
            {children}
          </blockquote>
        ),
        // Code
        code: ({ inline: isInline, className, children }: any) => {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "text";

          if (!isInline) {
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={language}
                className="rounded-lg my-2 text-xs"
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            );
          }

          return (
            <code className={`px-1 py-0.5 rounded text-xs font-mono transition-colors duration-200 ${
              theme === "dark"
                ? "bg-gray-700 text-red-400"
                : "bg-gray-200 text-red-600"
            }`}>
              {children}
            </code>
          );
        },
        // Links
        a: ({ href, children }: any) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`hover:underline font-medium transition-colors duration-200 ${
              theme === "dark"
                ? "text-blue-400"
                : "text-blue-600"
            }`}
          >
            {children}
          </a>
        ),
        // Horizontal rule
        hr: () => <hr className={`my-2 transition-colors duration-200 ${
          theme === "dark" ? "border-gray-600" : "border-gray-300"
        }`} />,
        // Tables
        table: ({ children }: any) => (
          <table className={`border-collapse border my-2 w-full text-sm transition-colors duration-200 ${
            theme === "dark"
              ? "border-gray-600"
              : "border-gray-300"
          }`}>
            {children}
          </table>
        ),
        thead: ({ children }: any) => (
          <thead className={`transition-colors duration-200 ${
            theme === "dark" ? "bg-gray-800" : "bg-gray-100"
          }`}>{children}</thead>
        ),
        tbody: ({ children }: any) => <tbody>{children}</tbody>,
        tr: ({ children }: any) => (
          <tr className={`border transition-colors duration-200 ${
            theme === "dark" ? "border-gray-600" : "border-gray-300"
          }`}>
            {children}
          </tr>
        ),
        td: ({ children }: any) => (
          <td className={`border px-2 py-1 transition-colors duration-200 ${
            theme === "dark"
              ? "border-gray-600 text-gray-200"
              : "border-gray-300 text-gray-800"
          }`}>
            {children}
          </td>
        ),
        th: ({ children }: any) => (
          <th className={`border px-2 py-1 font-semibold transition-colors duration-200 ${
            theme === "dark"
              ? "border-gray-600 text-white"
              : "border-gray-300 text-gray-900"
          }`}>
            {children}
          </th>
        ),
      };

  // If content has structured sections, render as separate bubbles
  if (parsedContent.hasStructure) {
    // New structure with reasoning, answer, and confidence
    if (parsedContent.type === "new") {
      const confidenceColors = getConfidenceColors(parsedContent.confidence);
      const labelColor = getConfidenceLabelColor(parsedContent.confidence);
      const hasReasoning = parsedContent.reasoning && parsedContent.reasoning.trim().length > 0;

      return (
        <div className="space-y-2">
          {/* Answer Bubble - FIRST */}
          <div
            className={`rounded-lg p-3 transition-colors duration-200 border ${
              theme === "dark"
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200"
            }`}
          >
            <div
              className={`flex items-center gap-2 text-xs font-semibold mb-2 transition-colors duration-200 ${labelColor}`}
            >
              <span>{confidenceColors.icon}</span>
              <span>
                Answer (Confidence:{" "}
                <span className="capitalize font-bold">
                  {parsedContent.confidence}
                </span>
                )
              </span>
            </div>
            <div
              className={`text-sm transition-colors duration-200 ${
                theme === "dark" ? "text-gray-200" : "text-gray-800"
              }`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {parsedContent.answer}
              </ReactMarkdown>
            </div>
          </div>

          {/* Expandable Reasoning Box */}
          <div
            className={`rounded-lg overflow-hidden transition-all duration-300 ${
              theme === "dark"
                ? "bg-blue-900/20 border border-blue-700/30"
                : "bg-blue-50/50 border border-blue-200/50"
            }`}
          >
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className={`w-full px-3 py-2 flex items-center justify-between text-xs font-semibold transition-colors duration-200 hover:bg-opacity-50 ${
                theme === "dark"
                  ? "text-blue-300 hover:bg-blue-900/30"
                  : "text-blue-700 hover:bg-blue-100/50"
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{showReasoning ? "▼" : "▶"}</span>
                <span>🧠 Reasoning</span>
              </span>
            </button>

            {/* Reasoning Content - Expandable */}
            {showReasoning && (
              <div
                className={`px-3 pb-3 pt-0 border-t transition-colors duration-200 ${
                  theme === "dark"
                    ? "border-blue-700/30 text-blue-100"
                    : "border-blue-200/50 text-blue-900"
                }`}
              >
                {hasReasoning ? (
                  <div className="text-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {parsedContent.reasoning}
                    </ReactMarkdown>
                  </div>
                ) : isStreaming ? (
                  <LoadingDots />
                ) : null}
              </div>
            )}

            {/* Show loading indicator in collapsed state if still streaming */}
            {!showReasoning && isStreaming && !hasReasoning && (
              <div className="px-3 py-2">
                <LoadingDots />
              </div>
            )}
          </div>
        </div>
      );
    }

    // Legacy structure with thought and answer
    if (parsedContent.type === "legacy") {
      return (
        <div className="space-y-3">
          {/* Thought Bubble */}
          <div
            className={`rounded-lg p-3 transition-colors duration-200 ${
              theme === "dark"
                ? "bg-amber-900/30 border border-amber-700/50"
                : "bg-amber-50 border border-amber-200"
            }`}
          >
            <div
              className={`text-xs font-semibold mb-2 transition-colors duration-200 ${
                theme === "dark" ? "text-amber-300" : "text-amber-700"
              }`}
            >
              💭 Thought
            </div>
            <div
              className={`text-sm transition-colors duration-200 ${
                theme === "dark" ? "text-amber-100" : "text-amber-900"
              }`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {parsedContent.thought}
              </ReactMarkdown>
            </div>
          </div>

          {/* Answer Bubble */}
          <div
            className={`rounded-lg p-3 transition-colors duration-200 ${
              theme === "dark"
                ? "bg-green-900/30 border border-green-700/50"
                : "bg-green-50 border border-green-200"
            }`}
          >
            <div
              className={`text-xs font-semibold mb-2 transition-colors duration-200 ${
                theme === "dark" ? "text-green-300" : "text-green-700"
              }`}
            >
              ✓ Answer
            </div>
            <div
              className={`text-sm transition-colors duration-200 ${
                theme === "dark" ? "text-green-100" : "text-green-900"
              }`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {parsedContent.answer}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }
  }

  // Default: render content as usual
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
