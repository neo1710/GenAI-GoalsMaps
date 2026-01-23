"use client";

import React from "react";
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

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-3 mb-2 text-gray-900 dark:text-white">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mt-3 mb-2 text-gray-900 dark:text-white">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mt-2 mb-1 text-gray-900 dark:text-white">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-semibold mt-2 mb-1 text-gray-900 dark:text-white">
            {children}
          </h4>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="my-1 leading-relaxed text-gray-800 dark:text-gray-200">
            {children}
          </p>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside ml-2 my-2 space-y-1 text-gray-800 dark:text-gray-200">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside ml-2 my-2 space-y-1 text-gray-800 dark:text-gray-200">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-gray-800 dark:text-gray-200">{children}</li>
        ),
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-blue-500 pl-3 italic my-2 py-1 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/50">
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
            <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-red-600 dark:text-red-400">
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
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            {children}
          </a>
        ),
        // Horizontal rule
        hr: () => <hr className="my-2 border-gray-300 dark:border-gray-600" />,
        // Tables
        table: ({ children }) => (
          <table className="border-collapse border border-gray-300 dark:border-gray-600 my-2 w-full text-sm">
            {children}
          </table>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border border-gray-300 dark:border-gray-600">
            {children}
          </tr>
        ),
        td: ({ children }) => (
          <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-800 dark:text-gray-200">
            {children}
          </td>
        ),
        th: ({ children }) => (
          <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-900 dark:text-white font-semibold">
            {children}
          </th>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
