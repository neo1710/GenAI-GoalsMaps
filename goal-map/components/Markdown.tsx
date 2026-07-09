"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { IoIosArrowDropdownCircle, IoIosArrowDropupCircle } from "react-icons/io";
import MultiTableExporter from "./ChatUtils/TableExporterExcel";

interface MarkdownProps {
  content: string;
  isStreaming?: boolean;
}

const stringifyMessageValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringifyMessageValue).filter(Boolean).join("\n\n");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredText =
      record.answer ??
      record.final_answer ??
      record.finalAnswer ??
      record.response ??
      record.content ??
      record.message ??
      record.text ??
      record.output;

    if (preferredText !== undefined) {
      return stringifyMessageValue(preferredText);
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const getFirstTextValue = (
  record: Record<string, unknown>,
  keys: string[]
): string => {
  for (const key of keys) {
    const value = stringifyMessageValue(record[key]).trim();
    if (value) {
      return value;
    }
  }

  return "";
};

const humanizeKey = (key: string): string =>
  key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonCandidates = (content: string): unknown | null => {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    // Continue with balanced-object extraction below.
  }

  const candidates: unknown[] = [];
  let start = -1;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{" || char === "[") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;

      if (depth === 0 && start >= 0) {
        try {
          candidates.push(JSON.parse(content.slice(start, index + 1)));
        } catch {
          // Ignore malformed snippets and keep looking for displayable JSON.
        }
        start = -1;
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.length === 1 ? candidates[0] : candidates;
};

export default function Markdown({ content, isStreaming = false }: MarkdownProps) {
  const theme = useSelector((state: RootState) => state.theme.mode);
  const [showReasoning, setShowReasoning] = useState(false);
  const [tableRefs, setTableRefs] = useState<(HTMLTableElement | null)[]>([]);
  const tableRefsMap = useRef<Map<number, HTMLTableElement | null>>(new Map());

  // Parse content to check for structured sections
  const parsedContent = useMemo(() => {
    // Try to parse JSON-like structure (reasoning, answer, confidence)
    const parsedJson = parseJsonCandidates(content);
    if (parsedJson !== null) {
      const jsonItems = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
      const firstRecord = jsonItems.find(isPlainRecord);

      if (firstRecord) {
        const answer = getFirstTextValue(firstRecord, [
          "answer",
          "final_answer",
          "finalAnswer",
          "response",
          "content",
          "message",
          "text",
          "output",
        ]);
        const reasoning = getFirstTextValue(firstRecord, [
          "reasoning",
          "thoughts",
          "thought",
          "explanation",
          "rationale",
        ]);
        const confidence = stringifyMessageValue(firstRecord.confidence).trim();

        if (answer) {
          return {
            hasStructure: true,
            type: "new",
            reasoning,
            answer,
            confidence: (confidence || "medium").toLowerCase(),
          };
        }
      }

      return {
        hasStructure: true,
        type: "json",
        data: parsedJson,
      };
    }

    // Legacy: Parse content to check for thought: and answer: sections
    const thoughtRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:Thoughts?|Reasoning|Rationale|Explanation):\s*([\s\S]*?)(?=(?:^|\n)\s*(?:#{1,6}\s*)?(?:Answer|Final Answer|Response):|$)/i;
    const answerRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:Answer|Final Answer|Response):\s*([\s\S]*?)$/i;

    const thoughtMatch = content.match(thoughtRegex);
    const answerMatch = content.match(answerRegex);
    const answer = answerMatch?.[1]?.trim() ?? "";

    if (answer) {
      return {
        hasStructure: true,
        type: "legacy",
        thought: thoughtMatch?.[1]?.trim() ?? "",
        answer,
      };
    }

    return {
      hasStructure: false,
      content: content,
    };
  }, [content]);

  // Effect to collect table refs after render
  useEffect(() => {
    const refs = Array.from(tableRefsMap.current.values());
    setTableRefs(refs);
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
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-200 ${theme === "dark" ? "bg-blue-300" : "bg-blue-700"
          }`} style={{ animationDelay: "0ms" }}></span>
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-200 ${theme === "dark" ? "bg-blue-300" : "bg-blue-700"
          }`} style={{ animationDelay: "150ms" }}></span>
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors duration-200 ${theme === "dark" ? "bg-blue-300" : "bg-blue-700"
          }`} style={{ animationDelay: "300ms" }}></span>
      </span>
    </div>
  );

  // Counter for table refs
  let tableCounter = 0;

  const markdownComponents = {
    // Headings
    h1: ({ children }: any) => (
      <h1 className={`text-lg font-bold mt-3 mb-2 transition-colors duration-200 ${theme === "dark" ? "text-white" : "text-gray-900"
        }`}>
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className={`text-base font-bold mt-3 mb-2 transition-colors duration-200 ${theme === "dark" ? "text-white" : "text-gray-900"
        }`}>
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className={`text-sm font-semibold mt-2 mb-1 transition-colors duration-200 ${theme === "dark" ? "text-white" : "text-gray-900"
        }`}>
        {children}
      </h3>
    ),
    h4: ({ children }: any) => (
      <h4 className={`text-sm font-semibold mt-2 mb-1 transition-colors duration-200 ${theme === "dark" ? "text-white" : "text-gray-900"
        }`}>
        {children}
      </h4>
    ),
    // Paragraphs
    p: ({ children }: any) => (
      <p className={`my-1 leading-relaxed transition-colors duration-200 ${theme === "dark" ? "text-gray-200" : "text-gray-800"
        }`}>
        {children}
      </p>
    ),
    // Lists
    ul: ({ children }: any) => (
      <ul className={`list-disc list-inside ml-2 my-2 space-y-1 transition-colors duration-200 ${theme === "dark" ? "text-gray-200" : "text-gray-800"
        }`}>
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className={`list-decimal list-inside ml-2 my-2 space-y-1 transition-colors duration-200 ${theme === "dark" ? "text-gray-200" : "text-gray-800"
        }`}>
        {children}
      </ol>
    ),
    li: ({ children }: any) => (
      <li className={`transition-colors duration-200 ${theme === "dark" ? "text-gray-200" : "text-gray-800"
        }`}>{children}</li>
    ),
    // Blockquote
    blockquote: ({ children }: any) => (
      <blockquote className={`border-l-4 border-blue-500 pl-3 italic my-2 py-1 transition-colors duration-200 ${theme === "dark"
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
        <code className={`px-1 py-0.5 rounded text-xs font-mono transition-colors duration-200 ${theme === "dark"
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
        className={`hover:underline font-medium transition-colors duration-200 ${theme === "dark"
            ? "text-blue-400"
            : "text-blue-600"
          }`}
      >
        {children}
      </a>
    ),
    // Horizontal rule
    hr: () => <hr className={`my-2 transition-colors duration-200 ${theme === "dark" ? "border-gray-600" : "border-gray-300"
      }`} />,
    // Tables - Modified to capture refs
    table: ({ children }: any) => {
      const currentTableIndex = tableCounter++;
      return (
        <table
          ref={(el) => {
            tableRefsMap.current.set(currentTableIndex, el);
          }}
          className={`border-collapse border my-2 w-full text-sm transition-colors duration-200 ${theme === "dark"
              ? "border-gray-600"
              : "border-gray-300"
            }`}
        >
          {children}
        </table>
      );
    },
    thead: ({ children }: any) => (
      <thead className={`transition-colors duration-200 ${theme === "dark" ? "bg-gray-800" : "bg-gray-100"
        }`}>{children}</thead>
    ),
    tbody: ({ children }: any) => <tbody>{children}</tbody>,
    tr: ({ children }: any) => (
      <tr className={`border transition-colors duration-200 ${theme === "dark" ? "border-gray-600" : "border-gray-300"
        }`}>
        {children}
      </tr>
    ),
    td: ({ children }: any) => (
      <td className={`border px-2 py-1 transition-colors duration-200 ${theme === "dark"
          ? "border-gray-600 text-gray-200"
          : "border-gray-300 text-gray-800"
        }`}>
        {children}
      </td>
    ),
    th: ({ children }: any) => (
      <th className={`border px-2 py-1 font-semibold transition-colors duration-200 ${theme === "dark"
          ? "border-gray-600 text-white"
          : "border-gray-300 text-gray-900"
        }`}>
        {children}
      </th>
    ),
  };

  const renderJsonValue = (value: unknown, depth = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Not provided</span>;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {String(value)}
        </ReactMarkdown>
      );
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>None</span>;
      }

      const hasObjectItems = value.some((item) => isPlainRecord(item) || Array.isArray(item));

      if (hasObjectItems) {
        return (
          <div className="space-y-2">
            {value.map((item, index) => (
              <div
                key={index}
                className={`rounded-md border p-2 ${theme === "dark"
                    ? "border-gray-700 bg-gray-900/40"
                    : "border-gray-200 bg-gray-50"
                  }`}
              >
                {renderJsonValue(item, depth + 1)}
              </div>
            ))}
          </div>
        );
      }

      return (
        <ul className={`list-disc list-inside space-y-1 ${theme === "dark" ? "text-gray-200" : "text-gray-800"}`}>
          {value.map((item, index) => (
            <li key={index}>{stringifyMessageValue(item)}</li>
          ))}
        </ul>
      );
    }

    if (isPlainRecord(value)) {
      const entries = Object.entries(value).filter(([, entryValue]) => {
        const text = stringifyMessageValue(entryValue).trim();
        return text.length > 0 || Array.isArray(entryValue) || isPlainRecord(entryValue);
      });

      if (entries.length === 0) {
        return <span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>No details</span>;
      }

      return (
        <div className={depth === 0 ? "space-y-3" : "space-y-2"}>
          {entries.map(([key, entryValue]) => (
            <div key={key} className={depth === 0 ? "" : "space-y-1"}>
              <div className={`text-xs font-semibold uppercase tracking-wide ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                {humanizeKey(key)}
              </div>
              <div className={`${theme === "dark" ? "text-gray-100" : "text-gray-900"}`}>
                {renderJsonValue(entryValue, depth + 1)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  // If content has structured sections, render as separate bubbles
  if (parsedContent.hasStructure) {
    // New structure with reasoning, answer, and confidence
    if (parsedContent.type === "new") {
      const confidence = parsedContent.confidence || "medium";
      const confidenceColors = getConfidenceColors(confidence);
      const labelColor = getConfidenceLabelColor(confidence);
      const hasReasoning = parsedContent.reasoning && parsedContent.reasoning.trim().length > 0;
      const answer = parsedContent.answer || "";
      const answerJson = parseJsonCandidates(answer);

      return (
        <div className="space-y-2">
          {/* MultiTableExporter - Shows only if 2+ tables exist */}
          <MultiTableExporter
            tableRefs={tableRefs}
            contextContent={content}
            className="mb-2"
          />

          {/* Answer Bubble - FIRST */}
          <div
            className={`rounded-lg p-3 transition-colors duration-200 border ${theme === "dark"
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
                  {confidence}
                </span>
                )
              </span>
            </div>
            <div
              className={`text-sm transition-colors duration-200 ${theme === "dark" ? "text-gray-200" : "text-gray-800"
                }`}
            >
              {answerJson !== null ? (
                renderJsonValue(answerJson)
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {answer}
                </ReactMarkdown>
              )}
            </div>
          </div>

          {/* Expandable Reasoning Box */}
          <div
            className={`rounded-lg overflow-hidden transition-all duration-300 ${theme === "dark"
                ? "bg-blue-900/20 border border-blue-700/30"
                : "bg-blue-50/50 border border-blue-200/50"
              }`}
          >
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className={`w-full px-3 py-2 flex items-center justify-between text-xs font-semibold transition-colors duration-200 hover:bg-opacity-50 ${theme === "dark"
                  ? "text-blue-300 hover:bg-blue-900/30"
                  : "text-blue-700 hover:bg-blue-100/50"
                }`}
            >
              <span className="flex items-center gap-2">
                <span>{showReasoning ? <IoIosArrowDropupCircle /> : <IoIosArrowDropdownCircle />}</span>
                <span>Reasoning</span>
              </span>
            </button>

            {/* Reasoning Content - Expandable */}
            {showReasoning && (
              <div
                className={`px-3 pb-3 pt-0 border-t transition-colors duration-200 ${theme === "dark"
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

    if (parsedContent.type === "json") {
      return (
        <div className="space-y-2">
          <MultiTableExporter
            tableRefs={tableRefs}
            contextContent={content}
            className="mb-2"
          />

          <div
            className={`rounded-lg p-3 transition-colors duration-200 border ${theme === "dark"
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200"
              }`}
          >
            {renderJsonValue(parsedContent.data)}
          </div>
        </div>
      );
    }

    // Legacy structure with thought and answer
    if (parsedContent.type === "legacy") {
      const hasThought = parsedContent.thought && parsedContent.thought.trim().length > 0;
      const answer = parsedContent.answer || "";
      const answerJson = parseJsonCandidates(answer);

      return (
        <div className="space-y-3">
          {/* MultiTableExporter - Shows only if 2+ tables exist */}
          <MultiTableExporter
            tableRefs={tableRefs}
            contextContent={content}
            className="mb-2"
          />

          {/* Thought Bubble */}
          {hasThought && (
          <div
            className={`rounded-lg p-3 transition-colors duration-200 ${theme === "dark"
                ? "bg-amber-900/30 border border-amber-700/50"
                : "bg-amber-50 border border-amber-200"
              }`}
          >
            <div
              className={`text-xs font-semibold mb-2 transition-colors duration-200 ${theme === "dark" ? "text-amber-300" : "text-amber-700"
                }`}
            >
              💭 Thought
            </div>
            <div
              className={`text-sm transition-colors duration-200 ${theme === "dark" ? "text-amber-100" : "text-amber-900"
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
          )}

          {/* Answer Bubble */}
          <div
            className={`rounded-lg p-3 transition-colors duration-200 ${theme === "dark"
                ? "bg-green-900/30 border border-green-700/50"
                : "bg-green-50 border border-green-200"
              }`}
          >
            <div
              className={`text-xs font-semibold mb-2 transition-colors duration-200 ${theme === "dark" ? "text-green-300" : "text-green-700"
                }`}
            >
              ✓ Answer
            </div>
            <div
              className={`text-sm transition-colors duration-200 ${theme === "dark" ? "text-green-100" : "text-green-900"
                }`}
            >
              {answerJson !== null ? (
                renderJsonValue(answerJson)
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {answer}
                </ReactMarkdown>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // Default: render content as usual
  return (
    <div>
      {/* MultiTableExporter - Shows only if 2+ tables exist */}
      <MultiTableExporter
        tableRefs={tableRefs}
        contextContent={content}
        className="mb-2"
      />

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
