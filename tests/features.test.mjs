import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bundle, memoryStorage } from "./helpers.mjs";
globalThis.__featurePreferences = {
  baseUrl: "http://127.0.0.1:9/v1",
  defaultModel: "fallback",
  saveHistory: true,
};
globalThis.__featureStorage = memoryStorage();
const compiled = await bundle(
  'export * from "./src/domain"; export * from "./src/storage"; export * from "./src/providers"; export * from "./src/protocols"; export * from "./src/api"; export * from "./src/attachments"; export * from "./src/data-files"; export * from "./src/mcp";',
);
const relay = compiled.api,
  directory = await mkdtemp(join(tmpdir(), "relay-files-"));
const sse = (...events) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
const profile = {
  id: "test",
  title: "Test",
  kind: "chat-completions",
  baseUrl: "http://127.0.0.1:9/v1",
  defaultModel: "alpha",
  capabilities: { images: true, reasoning: true, webSearch: true, tools: true },
  updatedAt: 1,
  fingerprint: "test",
};
try {
  await test("branch and edit preserve original messages and independent identity", () => {
    const original = relay.newConversation("First", "alpha");
    original.messages.push(
      { role: "assistant", content: "Answer" },
      { role: "user", content: "Second" },
      { role: "assistant", content: "Old answer" },
    );
    const edited = relay.editLastUser(original, "Changed");
    assert.notEqual(edited.id, original.id);
    assert.equal(edited.branchOf, original.id);
    assert.equal(edited.messages.length, 3);
    assert.equal(edited.messages[2].content, "Changed");
    assert.equal(original.messages[2].content, "Second");
    edited.messages[0].content = "Independent";
    assert.equal(original.messages[0].content, "First");
  });
  await test("deleted chats can be restored and are retained in backups", async () => {
    const c = relay.newConversation("Restore", "alpha");
    await relay.saveConversation(c);
    await relay.deleteConversation(c.id);
    assert.equal(
      (await relay.getConversations()).some((v) => v.id === c.id),
      false,
    );
    assert.ok(
      (await relay.exportData()).conversations.find((v) => v.id === c.id)
        .deletedAt,
    );
    await relay.restoreConversation(c.id);
    assert.ok((await relay.getConversations()).find((v) => v.id === c.id));
  });
  await test("prompt records prevent concurrent neighboring edits from overwriting each other", async () => {
    const p = {
      title: "Preset",
      description: "",
      category: "Custom",
      instruction: "Explain",
    };
    await Promise.all([
      relay.savePrompt({ ...p, id: "a" }),
      relay.savePrompt({ ...p, id: "b" }),
    ]);
    assert.equal((await relay.getPrompts()).length, 2);
  });
  await test("prompt variables fail on missing values and substitute literally", () => {
    assert.deepEqual(relay.variables("{{tone}} {{tone}} {{language}}"), [
      "tone",
      "language",
    ]);
    assert.throws(() => relay.renderPrompt("{{tone}}", {}), /tone/);
    assert.equal(
      relay.renderPrompt("{{tone}} {{input}}", {
        tone: "Warm",
        input: "$& {{other}}",
      }),
      "Warm $& {{other}}",
    );
  });
  await test("context summaries leave originals unchanged and preserve recent messages", () => {
    const c = relay.newConversation("Earlier", "alpha");
    c.messages.push(
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "Recent" },
    );
    c.contextSummary = { through: 2, content: "Summary" };
    c.instruction = "Be concise";
    const context = relay.contextMessages(c);
    assert.equal(c.messages.length, 3);
    assert.equal(context.length, 3);
    assert.match(context[1].content, /Summary/);
    assert.equal(context.at(-1).content, "Recent");
  });
  await test("portable schema validates everything before accepting data", async () => {
    const data = await relay.exportData();
    assert.equal(relay.parsePortable(JSON.stringify(data)).version, 2);
    assert.throws(
      () => relay.parsePortable(JSON.stringify({ ...data, version: 999 })),
      /Unsupported/,
    );
    assert.throws(
      () =>
        relay.parsePortable(
          JSON.stringify({ ...data, conversations: [{ id: "bad" }] }),
        ),
      /invalid/i,
    );
    assert.throws(
      () =>
        relay.parsePortable(
          JSON.stringify({
            ...data,
            prompts: [data.prompts[0], data.prompts[0]],
          }),
        ),
      /duplicate/,
    );
  });
  await test("sync merge retains deletion markers and has deterministic tie resolution", () => {
    const local = [{ id: "a", updatedAt: 1, title: "old" }],
      incoming = [{ id: "a", updatedAt: 2, deletedAt: 2 }];
    assert.deepEqual(relay.mergeRecords(local, incoming), incoming);
    const a = [{ id: "a", updatedAt: 3, title: "aaa" }],
      b = [{ id: "a", updatedAt: 3, title: "zzz" }];
    assert.deepEqual(relay.mergeRecords(a, b), relay.mergeRecords(b, a));
  });
  await test("backups omit provider and MCP secrets", async () => {
    await relay.saveProvider(profile, "secret-value");
    globalThis.__featureStorage.items.set(
      "relay-mcp-secret:test",
      "mcp-secret",
    );
    const text = JSON.stringify(await relay.exportData());
    assert.equal(text.includes("secret-value"), false);
    assert.equal(text.includes("mcp-secret"), false);
  });
  await test("provider defaults are isolated by endpoint fingerprint", async () => {
    await relay.setDefaultModel("chosen", "test");
    assert.equal(await relay.getDefaultModel("test"), "chosen");
    await relay.saveProvider({ ...profile, baseUrl: "http://127.0.0.1:10/v1" });
    assert.equal(await relay.getDefaultModel("test"), "alpha");
    assert.equal(relay.chooseAvailableModel("missing", ["valid"]), "valid");
  });
  await test("attachment files are bounded, previewable, and binary content is rejected", async () => {
    const text = join(directory, "context.md");
    await writeFile(text, "Context 👋");
    assert.equal((await relay.readAttachment(text)).text, "Context 👋");
    await writeFile(join(directory, "binary.txt"), Buffer.from([1, 0, 2]));
    await assert.rejects(
      relay.readAttachment(join(directory, "binary.txt")),
      /binary/,
    );
    await writeFile(join(directory, "large.txt"), "x".repeat(256 * 1024 + 1));
    await assert.rejects(
      relay.readAttachment(join(directory, "large.txt")),
      /limit/,
    );
  });
  await test("image attachments reject the truncated legacy icon and accept the valid replacement", async () => {
    await assert.rejects(
      relay.readAttachment(join(process.cwd(), "assets", "icon.png")),
      /damaged|incomplete/,
    );
    const image = await relay.readAttachment(
      join(process.cwd(), "assets", "icon-relay-512.png"),
    );
    assert.match(image.data, /^data:image\/png;base64,/);
  });
  await test("sync folder exchanges validated JSON and ignores unrelated files", async () => {
    const data = await relay.exportData();
    await relay.writeExport(directory, "relay-abc.json", JSON.stringify(data));
    await writeFile(join(directory, "unrelated.json"), "bad");
    const merged = await relay.mergeSyncFolder(directory, {
      ...data,
      prompts: [],
    });
    assert.equal(merged.prompts.length, data.prompts.length);
    await assert.rejects(
      relay.writeExport(directory, "../outside.json", "bad"),
      /filename/,
    );
  });
  await test("multiline SSE with bare CR framing is parsed correctly", async () => {
    const r = new Response(
      'data: {\rdata: "choices": [{"delta":{"content":"OK"}}]\rdata: }\r\rdata: [DONE]\r\r',
      { headers: { "content-type": "text/event-stream" } },
    );
    assert.equal(
      (await relay.readProtocol(r, "chat-completions")).content,
      "OK",
    );
  });
  await test("Chat Completions preserves streamed tool arguments, citations, and finish reason", async () => {
    const m = await relay.readProtocol(
      sse(
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call1",
                    function: { name: "lookup", arguments: '{"q":' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '"test"}' } }],
                annotations: [
                  {
                    url_citation: {
                      url: "https://example.com",
                      title: "Source",
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
      ),
      "chat-completions",
    );
    assert.equal(m.toolCalls[0].arguments, '{"q":"test"}');
    assert.equal(m.citations[0].title, "Source");
    assert.equal(m.finishReason, "tool_calls");
  });
  await test("Responses adapter streams thinking, answer, sources, and incomplete status", async () => {
    const m = await relay.readProtocol(
      sse(
        { type: "response.reasoning_summary_text.delta", delta: "Thinking" },
        { type: "response.output_text.delta", delta: "Answer" },
        {
          type: "response.output_text.annotation.added",
          annotation: { url: "https://example.com", title: "Source" },
        },
        {
          type: "response.incomplete",
          response: { incomplete_details: { reason: "max_output_tokens" } },
        },
      ),
      "responses",
    );
    assert.equal(m.content, "Answer");
    assert.equal(m.reasoning, "Thinking");
    assert.equal(m.finishReason, "max_output_tokens");
    assert.equal(m.citations.length, 1);
  });
  await test("Anthropic adapter streams text, thinking, tool JSON, and stop reason", async () => {
    const m = await relay.readProtocol(
      sse(
        { type: "content_block_delta", index: 0, delta: { thinking: "Think" } },
        { type: "content_block_delta", index: 1, delta: { text: "Answer" } },
        {
          type: "content_block_start",
          index: 2,
          content_block: { type: "tool_use", id: "t1", name: "lookup" },
        },
        {
          type: "content_block_delta",
          index: 2,
          delta: { partial_json: '{"q":"x"}' },
        },
        { type: "message_delta", delta: { stop_reason: "tool_use" } },
      ),
      "anthropic",
    );
    assert.equal(m.content, "Answer");
    assert.equal(m.reasoning, "Think");
    assert.equal(m.toolCalls[0].id, "t1");
    assert.equal(m.finishReason, "tool_use");
  });
  await test("all protocols serialize image/text context and apply correct auth headers", () => {
    const messages = [
      {
        role: "user",
        content: "Explain",
        attachments: [
          {
            id: "f",
            name: "notes.md",
            mime: "text/plain",
            bytes: 3,
            text: "note",
          },
          {
            id: "i",
            name: "image.png",
            mime: "image/png",
            bytes: 3,
            data: "data:image/png;base64,YWJj",
          },
        ],
      },
    ];
    for (const kind of ["chat-completions", "responses", "anthropic"]) {
      const r = relay.buildRequest(
        { ...profile, kind, apiKey: "test-key" },
        messages,
        "alpha",
        { webSearch: true, reasoningEffort: "high" },
        true,
      );
      assert.match(JSON.stringify(r.body), /image/);
      assert.match(JSON.stringify(r.body), /note/);
      if (kind === "anthropic")
        assert.equal(r.headers["x-api-key"], "test-key");
      else assert.equal(r.headers.Authorization, "Bearer test-key");
    }
    assert.throws(
      () =>
        relay.buildRequest(
          {
            ...profile,
            capabilities: { ...profile.capabilities, images: false },
          },
          messages,
          "alpha",
          {},
          false,
        ),
      /image capability/,
    );
  });
  await test("Anthropic signed thinking and Responses output items survive continuation", async () => {
    const anthropic = await relay.readProtocol(
      sse(
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "", signature: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { thinking: "Reasoning", signature: "signed-value" },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "content_block_start",
          index: 1,
          content_block: { type: "text", text: "Answer" },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ),
      "anthropic",
    );
    const a = relay.buildRequest(
      { ...profile, kind: "anthropic" },
      [anthropic, { role: "user", content: "Continue" }],
      "alpha",
      {},
      true,
    );
    assert.equal(a.body.messages[0].content[0].signature, "signed-value");
    const raw = {
      type: "reasoning",
      id: "reasoning-1",
      encrypted_content: "opaque-value",
      summary: [],
    };
    const response = await relay.readProtocol(
      sse(
        { type: "response.output_item.done", item: raw },
        { type: "response.output_text.delta", delta: "Answer" },
      ),
      "responses",
    );
    const r = relay.buildRequest(
      { ...profile, kind: "responses" },
      [response, { role: "user", content: "Continue" }],
      "alpha",
      {},
      true,
    );
    assert.equal(r.body.input[0].encrypted_content, "opaque-value");
  });
  await test("HTTP MCP discovery and approved tool loop execute end to end", async () => {
    let toolCalls = 0,
      completionCalls = 0,
      approved = 0,
      capturedToolResult;
    const server = createServer(async (req, res) => {
      if (req.method === "GET" || req.method === "DELETE") {
        res.writeHead(405);
        res.end();
        return;
      }
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      res.setHeader("content-type", "application/json");
      if (req.url === "/mcp") {
        if (body.id === undefined) {
          res.writeHead(202);
          res.end();
          return;
        }
        let result;
        if (body.method === "initialize")
          result = {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "fixture", version: "1.0" },
          };
        else if (body.method === "tools/list")
          result = {
            tools: [
              {
                name: "lookup",
                description: "Fixture lookup",
                inputSchema: {
                  type: "object",
                  properties: { q: { type: "string" } },
                },
              },
            ],
          };
        else if (body.method === "tools/call") {
          toolCalls++;
          result = { content: [{ type: "text", text: "Fixture result" }] };
        } else result = {};
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
        return;
      }
      completionCalls++;
      const tool = body.messages.find((m) => m.role === "tool");
      if (tool) capturedToolResult = tool.content;
      res.end(
        JSON.stringify({
          choices: [
            {
              message:
                completionCalls === 1
                  ? {
                      content: "",
                      tool_calls: [
                        {
                          id: "call-fixture",
                          function: {
                            name: body.tools[0].function.name,
                            arguments: '{"q":"x"}',
                          },
                        },
                      ],
                    }
                  : { content: "Tool worked" },
            },
          ],
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      await relay.saveServer({
        id: "fixture",
        title: "Fixture",
        url: `${baseUrl}/mcp`,
        updatedAt: Date.now(),
      });
      await relay.saveProvider({ ...profile, id: "loop", baseUrl });
      const tools = await relay.discoverTools();
      assert.equal(tools[0].originalName, "lookup");
      const result = await relay.generate(
        [{ role: "user", content: "Use the lookup" }],
        "alpha",
        {
          providerId: "loop",
          allowTools: true,
          approveTool: async () => {
            approved++;
            return true;
          },
        },
      );
      assert.equal(result.message.content, "Tool worked");
      assert.equal(toolCalls, 1);
      assert.equal(approved, 1);
      assert.match(capturedToolResult, /Fixture result/);
      completionCalls = 0;
      await relay.generate(
        [{ role: "user", content: "Try a lookup" }],
        "alpha",
        {
          providerId: "loop",
          allowTools: true,
          approveTool: async () => false,
        },
      );
      assert.equal(toolCalls, 1);
      assert.match(capturedToolResult, /declined/);
      completionCalls = 0;
      await relay.generate(
        [{ role: "user", content: "Try a lookup" }],
        "alpha",
        { providerId: "loop", allowTools: true },
      );
      assert.equal(toolCalls, 1);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
  await test("context budget and pre-cancellation stop before sending requests", async () => {
    await assert.rejects(
      relay.generate([{ role: "user", content: "x".repeat(5000) }], "alpha", {
        providerId: "test",
        contextBudget: 1000,
      }),
      /budget/,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      relay.generate(
        [{ role: "user", content: "Hello" }],
        "alpha",
        {},
        undefined,
        controller.signal,
      ),
      { name: "AbortError" },
    );
  });
  await test("backup import rejects malformed metadata and rolls back failed writes", async () => {
    const local = await relay.exportData();
    const invalid = {
      ...local,
      conversations: [{ ...local.conversations[0], providerLabel: {} }],
    };
    assert.throws(
      () => relay.parsePortable(JSON.stringify(invalid)),
      /invalid/i,
    );
    const newChat = {
      ...relay.newConversation("Incoming", "alpha"),
      updatedAt: Date.now() + 1000,
    };
    const before = new Map(globalThis.__featureStorage.items),
      originalWrite = globalThis.__featureStorage.setItem;
    let writes = 0;
    globalThis.__featureStorage.setItem = async (key, value) => {
      if (++writes === 2) throw new Error("Fixture storage failure");
      return originalWrite(key, value);
    };
    try {
      await assert.rejects(
        relay.importData({ ...local, conversations: [newChat] }),
        /Fixture/,
      );
      assert.deepEqual(globalThis.__featureStorage.items, before);
    } finally {
      globalThis.__featureStorage.setItem = originalWrite;
    }
  });
} finally {
  await compiled.cleanup();
  await rm(directory, { recursive: true, force: true });
  delete globalThis.__featurePreferences;
  delete globalThis.__featureStorage;
}
