import { profileFetch } from "@/features/profiles/session";
// Web adapter - AI Chat Streaming (platform-specific HTTP implementation)

import { logger, AI_CHAT_STREAM_ENDPOINT } from "./core";
import type { AiSendMessageRequest, AiStreamEvent } from "@/features/ai-assistant/types";

// money-hub patch: a time limit on silence. The server calls the AI with no
// timeout of its own, so a router or model that stopped answering left the chat
// spinning until Stop was pressed. Two minutes with no bytes at all ends the
// wait with a plain message. Normal answers, tool rounds included, stream well
// inside that, and 9Router's "main" combo already moves on when a model errors.
export const SILENCE_LIMIT_MS = 120_000;

async function readWithLimit(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms: number,
): Promise<ReadableStreamReadResult<Uint8Array> | "silent"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const silent = new Promise<"silent">((resolve) => {
    timer = setTimeout(() => resolve("silent"), ms);
  });
  try {
    return await Promise.race([reader.read(), silent]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stream AI chat responses via HTTP fetch.
 *
 * Uses NDJSON streaming for efficient event delivery.
 *
 * @param request - The chat message request
 * @param signal - Optional AbortSignal for cancellation
 * @yields AiStreamEvent objects from the stream
 */
export async function* streamAiChat(
  request: AiSendMessageRequest,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent, void, undefined> {
  const response = await profileFetch(AI_CHAT_STREAM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
    credentials: "same-origin",
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    let errorCode = "network";

    try {
      const errorBody = (await response.json()) as { code?: string; error?: string };
      errorCode = errorBody.code ?? "network";
      errorMessage = errorBody.error ?? errorMessage;
    } catch {
      // Ignore JSON parse error
    }

    yield {
      type: "error",
      threadId: "",
      runId: "",
      messageId: undefined,
      code: errorCode,
      message: errorMessage,
    } as AiStreamEvent;
    return;
  }

  if (!response.body) {
    yield {
      type: "error",
      threadId: "",
      runId: "",
      messageId: undefined,
      code: "network",
      message: "Response body is null",
    } as AiStreamEvent;
    return;
  }

  // Parse NDJSON stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const read = await readWithLimit(reader, SILENCE_LIMIT_MS);
      if (read === "silent") {
        await reader.cancel().catch(() => undefined);
        yield {
          type: "error",
          threadId: "",
          runId: "",
          messageId: undefined,
          code: "timeout",
          message: `The AI stopped answering: nothing came back for ${SILENCE_LIMIT_MS / 60_000} minutes. Try again.`,
        } as AiStreamEvent;
        return;
      }
      const { done, value } = read;

      if (done) {
        // Process any remaining buffer content
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer.trim()) as AiStreamEvent;
            yield event;
          } catch (parseError) {
            logger.error("Failed to parse final buffer:", parseError);
          }
        }
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Split by newlines and process complete lines
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed) as AiStreamEvent;
          yield event;

          // Stop on terminal events
          if (event.type === "done" || event.type === "error") {
            return;
          }
        } catch (parseError) {
          logger.error("Failed to parse NDJSON line:", trimmed, parseError);
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A read cut short by the time limit may still hold the lock; cancel() ended it.
    }
  }
}
