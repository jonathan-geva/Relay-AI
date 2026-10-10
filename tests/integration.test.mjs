import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";

const directory = await mkdtemp(join(tmpdir(), "relay-test-"));
const preferences = {
  baseUrl: "",
  apiKey: "test-key",
  defaultModel: "fallback",
  systemPrompt: "Be useful.",
  saveHistory: true,
};
const items = new Map();
globalThis.__relayTestPreferences = preferences;
globalThis.__relayTestItems = items;
const result = await build({
  stdin: {
    contents: 'export * from "./src/api"; export * from "./src/storage";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  plugins: [
    {
      name: "mock-raycast",
      setup(b) {
        b.onResolve({ filter: /^@raycast\/api$/ }, () => ({
          path: "raycast",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: `export const environment = { supportPath: "", assetsPath: "" };
export const getPreferenceValues = () => globalThis.__relayTestPreferences;
  export const LocalStorage = { getItem: async k => globalThis.__relayTestItems.get(k), setItem: async (k,v) => { globalThis.__relayTestItems.set(k,v); }, removeItem: async k => { globalThis.__relayTestItems.delete(k); }, allItems: async () => Object.fromEntries(globalThis.__relayTestItems) };`,
        }));
      },
    },
  ],
});
const entry = join(directory, "test.cjs");
await writeFile(entry, result.outputFiles[0].text);
const relay = createRequire(import.meta.url)(entry);
let received;
let modelResponse = { data: [{ id: "zeta" }, { id: "alpha" }] };
const server = createServer(async (req, res) => {
  if (req.url === "/v1/models") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(modelResponse));
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  received = {
    body: JSON.parse(body),
    authorization: req.headers.authorization,
  };
  if (received.body.model === "slow") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.flushHeaders();
    return;
  }
  if (received.body.model === "fail") {
    res.writeHead(429);
    res.end("Rate limited");
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({ choices: [{ message: { content: "A useful answer" } }] }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
preferences.baseUrl = `http://127.0.0.1:${server.address().port}/v1/`;
try {
  await test("API discovers models and preserves configured defaults", async () => {
    assert.deepEqual(await relay.fetchModels(), ["alpha", "zeta"]);
    assert.equal(await relay.getDefaultModel(), "fallback");
    await relay.setDefaultModel("alpha");
    assert.equal(await relay.getDefaultModel(), "alpha");
  });
  await test("completion sends auth, chosen model and one system prompt", async () => {
    assert.equal(
      await relay.complete([{ role: "user", content: "Hello" }], "alpha"),
      "A useful answer",
    );
    assert.equal(received.authorization, "Bearer test-key");
    assert.equal(received.body.model, "alpha");
    assert.equal(received.body.stream, false);
    assert.deepEqual(received.body.messages, [
      { role: "system", content: "Be useful." },
      { role: "user", content: "Hello" },
    ]);
    await relay.complete(
      [
        { role: "system", content: "Override" },
        { role: "user", content: "Hello" },
      ],
      "alpha",
    );
    assert.equal(
      received.body.messages.filter((m) => m.role === "system").length,
      1,
    );
  });
  await test("managed model selection leaves the custom provider default intact", async () => {
    items.set("chatmock-managed-enabled", true);
    await relay.setDefaultModel("managed-model");
    assert.equal(await relay.getDefaultModel(), "managed-model");
    items.set("chatmock-managed-enabled", false);
    assert.equal(await relay.getDefaultModel(), "alpha");
  });
  await test("completion surfaces HTTP failures", async () => {
    await assert.rejects(
      relay.complete([{ role: "user", content: "Hello" }], "fail"),
      /429.*Rate limited/,
    );
  });
  await test("stop aborts an in-flight HTTP stream", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      await assert.rejects(
        relay.complete(
          [{ role: "user", content: "Hello" }],
          "slow",
          () => {},
          controller.signal,
        ),
        { name: "AbortError" },
      );
    } finally {
      clearTimeout(timer);
    }
  });
  await test("conversations save, resume, pin, and delete without losing neighbors", async () => {
    const first = relay.newConversation("First", "alpha");
    const second = relay.newConversation("Second", "alpha");
    second.pinned = true;
    await Promise.all([
      relay.saveConversation(first),
      relay.saveConversation(second),
    ]);
    assert.equal((await relay.getConversations())[0].id, second.id);
    await relay.deleteConversation(first.id);
    assert.equal((await relay.getConversations()).length, 1);
    preferences.saveHistory = false;
    await relay.saveConversation(first);
    assert.equal((await relay.getConversations()).length, 1);
    preferences.saveHistory = true;
    await relay.clearHistory();
    assert.deepEqual(await relay.getConversations(), []);
    assert.equal(items.get("default-model"), "alpha");
  });
  await test("legacy think tags migrate into separate reasoning", async () => {
    const chat = relay.newConversation("Legacy", "alpha");
    chat.messages.push({
      role: "assistant",
      content: "<think>**Planning a greeting**</think>Hello Joni!",
    });
    await relay.saveConversation(chat);
    const loaded = (await relay.getConversations()).find(
      (item) => item.id === chat.id,
    );
    assert.equal(loaded.messages[1].reasoning, "**Planning a greeting**");
    assert.equal(loaded.messages[1].content, "Hello Joni!");
    await relay.clearHistory();
  });
  await test("custom prompts update and delete by ID", async () => {
    const prompt = {
      id: "custom",
      title: "Test",
      instruction: "Explain",
      category: "Custom",
      description: "Test prompt",
    };
    await relay.savePrompt(prompt);
    await relay.savePrompt({ ...prompt, title: "Edited" });
    assert.equal((await relay.getPrompts()).length, 1);
    assert.equal((await relay.getPrompts())[0].title, "Edited");
    await relay.deletePrompt(prompt.id);
    assert.deepEqual(await relay.getPrompts(), []);
  });
  await test("model discovery normalizes duplicate and invalid entries", async () => {
    modelResponse = {
      data: [
        { id: " alpha " },
        { id: "alpha" },
        null,
        { id: "" },
        { id: 42 },
        { id: "zeta" },
      ],
    };
    assert.deepEqual(await relay.fetchModels(), ["alpha", "zeta"]);
  });
  await test("model discovery explains malformed provider responses", async () => {
    modelResponse = { data: {} };
    await assert.rejects(relay.fetchModels(), /invalid model list/i);
  });
  await test("unreadable history records cannot break healthy conversations", async () => {
    const healthy = relay.newConversation("Healthy", "alpha");
    await relay.saveConversation(healthy);
    items.set(
      "relay-chat:invalid",
      JSON.stringify({ id: "invalid", messages: [null] }),
    );
    items.set(
      "relay-chat:invalid-content",
      JSON.stringify({
        ...healthy,
        id: "invalid-content",
        messages: [{ role: "assistant", content: 42 }],
      }),
    );
    items.set(
      "relay-chat:missing-metadata",
      JSON.stringify({ id: "missing-metadata", messages: [] }),
    );
    assert.deepEqual(
      (await relay.getConversations()).map((chat) => chat.id),
      [healthy.id],
    );
  });
  await test("clear history removes unreadable records and preserves other settings", async () => {
    items.set("relay-chat:corrupt", "not JSON");
    items.set("relay-chat:invalid", "null");
    items.set(
      "relay-prompts",
      JSON.stringify([
        {
          id: "keep",
          title: "Keep",
          instruction: "Explain",
          category: "Custom",
          description: "",
        },
      ]),
    );
    await relay.clearHistory();
    assert.equal(
      [...items.keys()].some((key) => key.startsWith("relay-chat:")),
      false,
    );
    assert.equal(items.get("default-model"), "alpha");
    assert.equal((await relay.getPrompts())[0].id, "keep");
  });
  await test("malformed prompt storage is preserved with an actionable error", async () => {
    items.set("relay-prompts", "{}");
    await assert.rejects(relay.getPrompts(), /prompt library.*unreadable/i);
    await assert.rejects(
      relay.savePrompt({
        id: "new",
        title: "New",
        instruction: "Explain",
        category: "Custom",
        description: "",
      }),
    );
    assert.equal(items.get("relay-prompts"), "{}");
  });
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
  delete globalThis.__relayTestItems;
  delete globalThis.__relayTestPreferences;
}
