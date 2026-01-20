"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownProps {
  content: string;
}

export default function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mt-4 mb-2 text-gray-900 dark:text-white">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-bold mt-4 mb-2 text-gray-900 dark:text-white">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold mt-3 mb-2 text-gray-900 dark:text-white">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-semibold mt-2 mb-1 text-gray-900 dark:text-white">
            {children}
          </h4>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="text-gray-800 dark:text-gray-200 my-2 leading-relaxed">
            {children}
          </p>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside ml-2 text-gray-800 dark:text-gray-200 my-2 space-y-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside ml-2 text-gray-800 dark:text-gray-200 my-2 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-gray-800 dark:text-gray-200">{children}</li>
        ),
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-blue-500 pl-4 italic my-3 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 py-2">
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
                className="rounded-lg my-3 text-sm"
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            );
          }

          return (
            <code className="bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-red-600 dark:text-red-400">
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
        hr: () => <hr className="my-4 border-gray-300 dark:border-gray-600" />,
        // Tables (GitHub flavored markdown)
        table: ({ children }) => (
          <table className="border-collapse border border-gray-300 dark:border-gray-600 my-3 w-full">
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
          <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-800 dark:text-gray-200">
            {children}
          </td>
        ),
        th: ({ children }) => (
          <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white font-semibold">
            {children}
          </th>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
