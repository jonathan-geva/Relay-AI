import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { createRequire } from "node:module";
import { bundle, memoryStorage } from "./helpers.mjs";
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__uiStorage = memoryStorage();
globalThis.__uiPushes = [];
globalThis.__uiRequests = [];
const mock = `import React from "react";
const component = name => props => React.createElement(name, props, props.children, props.actions, props.detail, props.searchBarAccessory, props.metadata);
export const List = component("List"); List.Section=component("List.Section"); List.Item=component("List.Item"); List.Item.Detail=component("Detail"); List.Item.Detail.Metadata=component("Metadata"); List.Item.Detail.Metadata.Label=component("Label"); List.Dropdown=component("Dropdown"); List.Dropdown.Item=component("Dropdown.Item");
export const Action = component("Action"); Action.CopyToClipboard=component("Copy"); Action.Paste=component("Paste"); Action.Style={Destructive:"destructive"};
export const ActionPanel=component("ActionPanel"); ActionPanel.Section=component("ActionPanel.Section");
export const Icon=new Proxy({}, {get:(_,k)=>String(k)}); export const Color={Blue:"blue",Green:"green"};
export const Keyboard={Shortcut:{Common:{Copy:{},Refresh:{},Save:{}}}}; export const Toast={Style:{Failure:"failure"}};
export const confirmAlert=async()=>true; export const showToast=async()=>{}; export const Clipboard={readText:async()=>"Clipboard context"};
export const getPreferenceValues=()=>({saveHistory:true}); export const LocalStorage=globalThis.__uiStorage;
export const useNavigation=()=>({push:v=>globalThis.__uiPushes.push(v),pop:()=>{}});`;
const replacements = {
  "api.ts": `export const chooseAvailableModel=(saved,models)=>models.includes(saved)?saved:models[0]||saved; export const fetchModels=async()=>["alpha","beta"]; export const friendlyError=e=>e.message||String(e); export const generate=(messages,model,options,onUpdate,signal)=>new Promise((resolve,reject)=>{ const request={messages,model,options,onUpdate,signal,resolve:message=>resolve({message,messages:[...messages,message]})}; globalThis.__uiRequests.push(request); signal.addEventListener("abort",()=>reject(new DOMException("Stopped","AbortError")),{once:true}); });`,
  "providers.ts": `export const activeProviderId=async()=>"preferences"; export const favorites=async()=>[]; export const getProviders=async()=>[{id:"preferences",title:"Fixture",baseUrl:"http://fixture/v1"}]; export const providerFingerprint=()=>"fp";`,
  "chat-dialogs.tsx": `export const AttachmentPicker=()=>null; export const ChatSettings=()=>null; export const ExportConversation=()=>null;`,
  "data-management.tsx": `export const autoSync=async()=>{};`,
};
const plugin = {
  name: "mock-chat-services",
  setup(b) {
    b.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, (args) => ({
      path: require.resolve(args.path),
      external: true,
    }));
    b.onLoad(
      {
        filter:
          /src[\\/](api\.ts|providers\.ts|chat-dialogs\.tsx|data-management\.tsx)$/,
      },
      (args) => ({
        contents: replacements[args.path.split(/[\\/]/).at(-1)],
        loader: "tsx",
      }),
    );
  },
};
const compiled = await bundle('export * from "./src/chat-view";', mock, [
  plugin,
]);
const { ChatView } = compiled.api;
let renderer;
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
const list = () => renderer.root.findByType("List");
const action = (title) =>
  renderer.root.findAllByType("Action").find((a) => a.props.title === title);
async function type(text) {
  await act(async () => {
    list().props.onSearchTextChange(text);
    await flush();
  });
}
async function click(title) {
  await act(async () => {
    await action(title).props.onAction();
    await flush();
  });
}
async function finish(request, text = "Answer") {
  await act(async () => {
    request.resolve({ role: "assistant", content: text });
    await flush();
  });
}
async function mount(props = {}) {
  await act(async () => {
    renderer = create(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(ChatView, { model: "alpha", ...props }),
      ),
    );
    await flush();
  });
}
async function unmount() {
  if (renderer) {
    await act(async () => {
      renderer.unmount();
      await flush();
    });
    renderer = undefined;
  }
}
try {
  await test("typing uses the persistent message bar and sends without opening a form", async () => {
    await mount();
    assert.equal(list().props.filtering, false);
    assert.equal(list().props.isShowingDetail, true);
    await type("Hello");
    assert.equal(list().props.searchText, "Hello");
    await click("Send Message");
    assert.equal(globalThis.__uiPushes.length, 0);
    assert.equal(globalThis.__uiRequests.length, 1);
    assert.equal(globalThis.__uiRequests[0].messages.at(-1).content, "Hello");
    await finish(globalThis.__uiRequests[0]);
    assert.equal(list().props.searchText, "");
    assert.ok(
      renderer.root
        .findAllByType("Detail")
        .some((n) => n.props.markdown.includes("Answer")),
    );
    await unmount();
  });
  await test("typing during streaming preserves the draft; Enter queues with full prior context", async () => {
    globalThis.__uiRequests = [];
    await mount();
    await type("First");
    await click("Send Message");
    const first = globalThis.__uiRequests[0];
    await type("Second");
    await act(async () => {
      first.onUpdate({ role: "assistant", content: "Partial" });
      await flush();
    });
    assert.equal(list().props.searchText, "Second");
    await click("Queue Message");
    assert.equal(globalThis.__uiRequests.length, 1);
    await finish(first, "First answer");
    assert.equal(globalThis.__uiRequests.length, 2);
    const second = globalThis.__uiRequests[1];
    assert.deepEqual(
      second.messages.map((m) => m.content),
      ["First", "First answer", "Second"],
    );
    await finish(second, "Second answer");
    await unmount();
  });
  await test("Stop retains partial text and reasoning and does not run queued work", async () => {
    globalThis.__uiRequests = [];
    await mount();
    await type("Work");
    await click("Send Message");
    const request = globalThis.__uiRequests[0];
    await act(async () => {
      request.onUpdate({
        role: "assistant",
        content: "Partial answer",
        reasoning: "Thinking",
      });
      await flush();
    });
    await type("Queued");
    await click("Queue Message");
    await click("Stop Response");
    assert.equal(request.signal.aborted, true);
    assert.equal(globalThis.__uiRequests.length, 1);
    assert.ok(
      renderer.root
        .findAllByType("Detail")
        .some(
          (n) =>
            n.props.markdown.includes("Partial answer") &&
            n.props.markdown.includes("Thinking"),
        ),
    );
    await unmount();
  });
  await test("React development remount launches an initial request exactly once", async () => {
    globalThis.__uiRequests = [];
    await mount({ initialPrompt: "Initial" });
    assert.equal(globalThis.__uiRequests.length, 1);
    assert.equal(globalThis.__uiRequests[0].signal.aborted, false);
    await finish(globalThis.__uiRequests[0]);
    await unmount();
  });
  await test("model changes stay in the chat and edit creates a branch", async () => {
    globalThis.__uiRequests = [];
    const conversation = {
      id: "original",
      title: "Original",
      model: "alpha",
      messages: [
        { role: "user", content: "Original question" },
        { role: "assistant", content: "Original answer" },
      ],
      updatedAt: 1,
      pinned: false,
      providerId: "preferences",
      providerFingerprint: "fp",
    };
    await mount({ conversation });
    const dropdown = renderer.root.findByType("Dropdown");
    await act(async () => {
      dropdown.props.onChange("beta");
      await flush();
    });
    await click("Edit Last Message");
    assert.equal(list().props.searchText, "Original question");
    await type("Edited question");
    await click("Send Edited Message as Branch");
    assert.equal(globalThis.__uiRequests[0].model, "beta");
    assert.equal(
      globalThis.__uiRequests[0].messages.at(-1).content,
      "Edited question",
    );
    assert.equal(conversation.messages[0].content, "Original question");
    await finish(globalThis.__uiRequests[0]);
    assert.ok(
      [...globalThis.__uiStorage.items.entries()].some(
        ([k, v]) =>
          k.startsWith("relay-chat:") && JSON.parse(v).branchOf === "original",
      ),
    );
    await unmount();
  });
  await test("resume restores the draft while the transcript remains visible", async () => {
    const conversation = {
      id: "draft-chat",
      title: "Draft",
      model: "alpha",
      messages: [
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ],
      updatedAt: 1,
      pinned: false,
    };
    globalThis.__uiStorage.items.set("relay-draft:draft-chat", "Unsent reply");
    await mount({ conversation });
    assert.equal(list().props.searchText, "Unsent reply");
    assert.ok(
      renderer.root
        .findAllByType("Detail")
        .some((n) => n.props.markdown.includes("Earlier answer")),
    );
    await unmount();
  });
  await test("summarization is cancellable and leaves the original transcript intact", async () => {
    globalThis.__uiRequests = [];
    const conversation = {
      id: "long-chat",
      title: "Long",
      model: "alpha",
      updatedAt: 1,
      pinned: false,
      providerId: "preferences",
      providerFingerprint: "fp",
      messages: Array.from({ length: 6 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: `Message ${i}`,
      })),
    };
    await mount({ conversation });
    await act(async () => {
      void action("Summarize Earlier Context").props.onAction();
      await flush();
    });
    const request = globalThis.__uiRequests[0];
    assert.ok(request.signal);
    await click("Stop Response");
    assert.equal(request.signal.aborted, true);
    assert.equal(conversation.messages.length, 6);
    assert.ok(
      renderer.root
        .findAllByType("Detail")
        .some((n) => n.props.markdown.includes("Message 5")),
    );
    await unmount();
  });
} finally {
  await unmount();
  await compiled.cleanup();
  delete globalThis.__uiStorage;
  delete globalThis.__uiPushes;
  delete globalThis.__uiRequests;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
}
