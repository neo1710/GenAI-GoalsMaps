export interface Message {
  role: string;
  content: string;
}

export interface ChatRequestBody {
  model: string;
  stream: boolean;
  messages: Message[];
}

export async function* streamChatResponse(
  apiUrl: string,
  requestBody: ChatRequestBody
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (delimited by newline)
      const lines = buffer.split("\n");
      buffer = lines[lines.length - 1]; // Keep incomplete line in buffer

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();

        // Skip empty lines
        if (!line) continue;

        // Remove "data: " prefix if present
        const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;

        try {
          const data = JSON.parse(jsonStr);

          // Extract content using optional chaining and nullish coalescing
          const content =
            data.choices?.[0]?.delta?.content ??
            data.choices?.[0]?.text ??
            data.choices?.[0]?.delta?.text ??
            "";

          if (content) {
            yield content;
          }
        } catch (e) {
          // Skip lines that aren't valid JSON
          console.debug("Failed to parse JSON chunk:", jsonStr);
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const jsonStr = buffer.startsWith("data: ")
        ? buffer.slice(6)
        : buffer;
      try {
        const data = JSON.parse(jsonStr);
        const content =
          data.choices?.[0]?.delta?.content ??
          data.choices?.[0]?.text ??
          data.choices?.[0]?.delta?.text ??
          "";

        if (content) {
          yield content;
        }
      } catch (e) {
        console.debug("Failed to parse final JSON chunk:", jsonStr);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
