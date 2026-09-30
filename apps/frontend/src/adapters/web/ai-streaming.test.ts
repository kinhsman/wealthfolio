// money-hub patch test: the chat's time limit on silence (ai-streaming.ts).
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("./core", () => ({
  AI_CHAT_STREAM_ENDPOINT: "/api/v1/ai/chat/stream",
  logger: { error: vi.fn() },
}));
vi.mock("@/features/profiles/session", () => ({ profileFetch: mocks.fetch }));

import { SILENCE_LIMIT_MS, streamAiChat } from "./ai-streaming";

/** A response whose body sends the given lines, then goes quiet (or ends). */
function body(lines: string[], thenEnd: boolean) {
  const enc = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l + "\n"));
      if (thenEnd) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: new Response(stream, { status: 200 }), wasCancelled: () => cancelled };
}

const system = JSON.stringify({ type: "system", threadId: "t1", runId: "r1" });
const delta = JSON.stringify({ type: "textDelta", threadId: "t1", runId: "r1", delta: "Hi" });
const done = JSON.stringify({ type: "done", threadId: "t1", runId: "r1" });

afterEach(() => {
  vi.useRealTimers();
  mocks.fetch.mockReset();
});

describe("chat stream time limit", () => {
  it("ends a silent stream with a plain error after the limit", async () => {
    vi.useFakeTimers();
    const b = body([system, delta], false);
    mocks.fetch.mockResolvedValue(b.response);
    const events: { type: string; code?: string; message?: string }[] = [];
    const run = (async () => {
      for await (const e of streamAiChat({ content: "hi" })) events.push(e as never);
    })();
    await vi.advanceTimersByTimeAsync(SILENCE_LIMIT_MS - 1000);
    expect(events.map((e) => e.type)).toEqual(["system", "textDelta"]);
    await vi.advanceTimersByTimeAsync(2000);
    await run;
    expect(events.map((e) => e.type)).toEqual(["system", "textDelta", "error"]);
    expect(events[2].code).toBe("timeout");
    expect(events[2].message).toMatch(/stopped answering/);
    expect(b.wasCancelled()).toBe(true);
  });

  it("a normal stream is untouched", async () => {
    mocks.fetch.mockResolvedValue(body([system, delta, done], true).response);
    const types: string[] = [];
    for await (const e of streamAiChat({ content: "hi" })) types.push(e.type);
    expect(types).toEqual(["system", "textDelta", "done"]);
  });
});
