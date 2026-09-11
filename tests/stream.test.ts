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
