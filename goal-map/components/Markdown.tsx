"use client";

import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownProps {
  content: string;
}

export default function Markdown({ content }: MarkdownProps) {
  const theme = useSelector((state: RootState) => state.theme.mode);

  // Parse content to check for thought: and answer: sections
  const parsedContent = useMemo(() => {
    const thoughtRegex = /Thoughts:\s*([\s\S]*?)(?=Answer:|$)/i;
    const answerRegex = /Answer:\s*([\s\S]*?)$/i;

    const thoughtMatch = content.match(thoughtRegex);
    const answerMatch = content.match(answerRegex);

    if (thoughtMatch && answerMatch) {
      return {
        hasStructure: true,
        thought: thoughtMatch[1].trim(),
        answer: answerMatch[1].trim(),
      };
    }

    return {
      hasStructure: false,
      content: content,
    };
  }, [content]);
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

  // If content has thought: and answer: structure, render as separate bubbles
  if (parsedContent.hasStructure) {
    return (
      <div className="space-y-3">
        {/* Thought Bubble */}
        <div className={`rounded-lg p-3 transition-colors duration-200 ${
          theme === "dark"
            ? "bg-amber-900/30 border border-amber-700/50"
            : "bg-amber-50 border border-amber-200"
        }`}>
          <div className={`text-xs font-semibold mb-2 transition-colors duration-200 ${
            theme === "dark" ? "text-amber-300" : "text-amber-700"
          }`}>
            💭 Thought
          </div>
          <div className={`text-sm transition-colors duration-200 ${
            theme === "dark" ? "text-amber-100" : "text-amber-900"
          }`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {parsedContent.thought}
            </ReactMarkdown>
          </div>
        </div>

        {/* Answer Bubble */}
        <div className={`rounded-lg p-3 transition-colors duration-200 ${
          theme === "dark"
            ? "bg-green-900/30 border border-green-700/50"
            : "bg-green-50 border border-green-200"
        }`}>
          <div className={`text-xs font-semibold mb-2 transition-colors duration-200 ${
            theme === "dark" ? "text-green-300" : "text-green-700"
          }`}>
            ✓ Answer
          </div>
          <div className={`text-sm transition-colors duration-200 ${
            theme === "dark" ? "text-green-100" : "text-green-900"
          }`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {parsedContent.answer}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
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
