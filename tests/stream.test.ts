import { test } from "node:test";
import assert from "node:assert/strict";
import { readCompletion } from "../src/stream.ts";

function stream(text: string, size = 3) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size)
          controller.enqueue(bytes.slice(i, i + size));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const chunk = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;
test("streams split UTF-8 and CRLF, preserving the final unterminated event", async () => {
  const updates: string[] = [];
  const result = await readCompletion(
    stream(`${chunk("Hello 👋")}\r\n\r\n${chunk(" world")}`, 1),
    (t) => updates.push(t),
  );
  assert.equal(result, "Hello 👋 world");
  assert.deepEqual(updates, ["Hello 👋", "Hello 👋 world"]);
});
test("DONE terminates the response and ignores any later events", async () => {
  assert.equal(
    await readCompletion(
      stream(`${chunk("first")}\n\ndata: [DONE]\n\n${chunk("ignored")}\n`),
    ),
    "first",
  );
});
test("ignores heartbeat and event metadata", async () => {
  assert.equal(
    await readCompletion(
      stream(`: keepalive\nevent: message\n${chunk("ok")}\n`),
    ),
    "ok",
  );
});
test("supports providers returning JSON despite streaming request", async () => {
  const updates: string[] = [];
  const response = Response.json({
    choices: [{ message: { content: "JSON answer" } }],
  });
  assert.equal(
    await readCompletion(response, (t) => updates.push(t)),
    "JSON answer",
  );
  assert.deepEqual(updates, ["JSON answer"]);
});
test("surfaces in-stream provider errors", async () => {
  await assert.rejects(
    readCompletion(
      stream('data: {"error":{"message":"Rate limit reached"}}\n'),
    ),
    /Rate limit reached/,
  );
});
test("surfaces JSON provider errors", async () => {
  await assert.rejects(
    readCompletion(Response.json({ error: { message: "Unavailable" } })),
    /Unavailable/,
  );
});
test("malformed events do not silently truncate successful responses", async () => {
  await assert.rejects(
    readCompletion(stream(`${chunk("partial")}\ndata: not-json\n`)),
    /malformed/,
  );
});
test("supports legacy text deltas and empty usage events", async () => {
  assert.equal(
    await readCompletion(
      stream('data: {"choices":[]}\ndata: {"choices":[{"text":"legacy"}]}\n'),
    ),
    "legacy",
  );
});
test("separates ChatMock reasoning tags split across stream chunks", async () => {
  const updates: string[] = [];
  const thoughts: string[] = [];
  const result = await readCompletion(
    stream(
      `${chunk("<thi")}\n${chunk("nk>**Planning friendly")}\n${chunk(" greeting response**</think>")}\n${chunk("Nice to meet you, Joni!")}\n`,
    ),
    (text) => updates.push(text),
    (text) => thoughts.push(text),
  );
  assert.equal(result, "Nice to meet you, Joni!");
  assert.deepEqual(updates, ["Nice to meet you, Joni!"]);
  assert.equal(thoughts.at(-1), "**Planning friendly greeting response**");
});
test("separates reasoning tags in non-streaming responses", async () => {
  const thoughts: string[] = [];
  const response = Response.json({
    choices: [
      {
        message: {
          content: "<think>**Planning a response**</think>Your name is Joni.",
        },
      },
    ],
  });
  assert.equal(
    await readCompletion(response, undefined, (text) => thoughts.push(text)),
    "Your name is Joni.",
  );
  assert.deepEqual(thoughts, ["**Planning a response**"]);
});
test("streams o3-compatible reasoning separately from answer text", async () => {
  const updates: string[] = [];
  const thoughts: string[] = [];
  const reasoning = (text: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: { reasoning: { content: [{ type: "text", text }] } } }] })}`;
  const result = await readCompletion(
    stream(
      `${reasoning("Checking context")}\n${chunk("Your name is Joni.")}\n`,
    ),
    (text) => updates.push(text),
    (text) => thoughts.push(text),
  );
  assert.equal(result, "Your name is Joni.");
  assert.deepEqual(updates, ["Your name is Joni."]);
  assert.deepEqual(thoughts, ["Checking context"]);
});
test("propagates cancellation from the response reader", async () => {
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.error(new DOMException("Aborted", "AbortError"));
      },
    }),
  );
  await assert.rejects(readCompletion(response), { name: "AbortError" });
});
