import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { randomUUID } from "node:crypto";
import {
  Conversation,
  Prompt,
  Project,
  AgentPreset,
  PortableData,
  isConversation,
  isPrompt,
  isProject,
  isAgent,
  normalizeConversation,
  mergeRecords,
} from "./domain";
export type { Conversation, Prompt, Project, AgentPreset } from "./domain";
export const historyEnabled = () =>
  getPreferenceValues<{ saveHistory?: boolean }>().saveHistory !== false;
export const newConversation = (
  prompt: string,
  model: string,
): Conversation => ({
  schemaVersion: 2,
  id: randomUUID(),
  title: prompt.replace(/\s+/g, " ").slice(0, 72) || "New Conversation",
  model,
  messages: prompt ? [{ role: "user", content: prompt }] : [],
  updatedAt: Date.now(),
  pinned: false,
});
const CHAT = "relay-chat:",
  PROMPT = "relay-prompt:",
  PROJECT = "relay-project:",
  AGENT = "relay-agent:";
async function records<T>(
  prefix: string,
  valid: (v: unknown) => v is T,
): Promise<T[]> {
  const items = await LocalStorage.allItems();
  const result: T[] = [];
  for (const [key, value] of Object.entries(items))
    if (key.startsWith(prefix) && typeof value === "string") {
      try {
        const v: unknown = JSON.parse(value);
        if (valid(v)) result.push(v);
      } catch {
        /* Preserve unreadable records. */
      }
    }
  return result;
}
export async function getConversations(
  includeDeleted = false,
): Promise<Conversation[]> {
  return (await records(CHAT, isConversation))
    .filter((c) => includeDeleted || !c.deletedAt)
    .map(normalizeConversation)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    );
}
export async function saveConversation(chat: Conversation) {
  if (historyEnabled())
    await LocalStorage.setItem(
      CHAT + chat.id,
      JSON.stringify({ ...chat, schemaVersion: 2 }),
    );
}
export async function deleteConversation(id: string) {
  const c = (await getConversations(true)).find((c) => c.id === id);
  if (c)
    await LocalStorage.setItem(
      CHAT + id,
      JSON.stringify({ ...c, deletedAt: Date.now(), updatedAt: Date.now() }),
    );
}
export async function restoreConversation(id: string) {
  const c = (await getConversations(true)).find((v) => v.id === id);
  if (c)
    await LocalStorage.setItem(
      CHAT + id,
      JSON.stringify({
        ...c,
        deletedAt: undefined,
        archived: false,
        updatedAt: Date.now(),
      }),
    );
}
export async function clearHistory() {
  for (const key of Object.keys(await LocalStorage.allItems()))
    if (key.startsWith(CHAT) || key.startsWith("relay-draft:"))
      await LocalStorage.removeItem(key);
}
async function migratePrompts() {
  const raw = await LocalStorage.getItem<string>("relay-prompts");
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* Report below. */
  }
  if (!Array.isArray(parsed) || !parsed.every(isPrompt))
    throw new Error(
      "The saved prompt library is unreadable. Your saved data has been preserved; restore it from a backup before editing.",
    );
  for (const p of parsed)
    if (!(await LocalStorage.getItem(PROMPT + p.id)))
      await LocalStorage.setItem(
        PROMPT + p.id,
        JSON.stringify({
          ...p,
          schemaVersion: 2,
          updatedAt: p.updatedAt || Date.now(),
        }),
      );
  await LocalStorage.removeItem("relay-prompts");
}
export async function getPrompts(includeDeleted = false): Promise<Prompt[]> {
  await migratePrompts();
  return (await records(PROMPT, isPrompt)).filter(
    (p) => includeDeleted || !p.deletedAt,
  );
}
export async function savePrompt(p: Prompt) {
  await migratePrompts();
  await LocalStorage.setItem(
    PROMPT + p.id,
    JSON.stringify({ ...p, schemaVersion: 2, updatedAt: Date.now() }),
  );
}
export async function deletePrompt(id: string) {
  const p = (await getPrompts()).find((v) => v.id === id);
  if (p)
    await LocalStorage.setItem(
      PROMPT + id,
      JSON.stringify({ ...p, deletedAt: Date.now(), updatedAt: Date.now() }),
    );
}
export const getProjects = async (all = false) =>
  (await records(PROJECT, isProject)).filter((p) => all || !p.deletedAt);
export const getAgents = async (all = false) =>
  (await records(AGENT, isAgent)).filter((p) => all || !p.deletedAt);
export const saveProject = async (p: Project) =>
  LocalStorage.setItem(
    PROJECT + p.id,
    JSON.stringify({ ...p, updatedAt: Date.now() }),
  );
export const saveAgent = async (p: AgentPreset) =>
  LocalStorage.setItem(
    AGENT + p.id,
    JSON.stringify({ ...p, updatedAt: Date.now() }),
  );
export async function exportData(): Promise<PortableData> {
  const [conversations, prompts, projects, agents] = await Promise.all([
    getConversations(true),
    getPrompts(true),
    getProjects(true),
    getAgents(true),
  ]);
  return {
    format: "relay-ai",
    version: 2,
    exportedAt: Date.now(),
    conversations,
    prompts,
    projects,
    agents,
  };
}
export async function importData(incoming: PortableData) {
  const local = await exportData();
  const before = await LocalStorage.allItems();
  const changed: string[] = [];
  try {
    for (const [prefix, values] of [
      [CHAT, mergeRecords(local.conversations, incoming.conversations)],
      [PROMPT, mergeRecords(local.prompts, incoming.prompts)],
      [PROJECT, mergeRecords(local.projects, incoming.projects)],
      [AGENT, mergeRecords(local.agents, incoming.agents)],
    ] as const)
      for (const v of values) {
        const key = prefix + v.id;
        changed.push(key);
        await LocalStorage.setItem(key, JSON.stringify(v));
      }
  } catch (error) {
    for (const key of changed.reverse()) {
      const prior = before[key];
      if (prior === undefined) await LocalStorage.removeItem(key);
      else await LocalStorage.setItem(key, prior);
    }
    throw error;
  }
}
export async function saveDraft(id: string, text: string) {
  if (historyEnabled()) await LocalStorage.setItem("relay-draft:" + id, text);
}
export const loadDraft = (id: string) =>
  LocalStorage.getItem<string>("relay-draft:" + id);
export function conversationMarkdown(chat: Conversation, showReasoning = true) {
  return (
    `# ${chat.title}\n\nModel: ${chat.model}${chat.providerLabel ? ` · ${chat.providerLabel}` : ""}\n\n` +
    chat.messages
      .filter((m) => m.role !== "system" && m.role !== "tool")
      .map((m) => {
        const thought =
          showReasoning && m.reasoning
            ? `> **Thinking**\n>\n${m.reasoning
                .trim()
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n")}\n\n`
            : "";
        const files =
          m.attachments?.map((f) => `Attached: **${f.name}**`).join("\n\n") ||
          "";
        const toolNote =
          m.toolCalls
            ?.map(
              (t) =>
                `Requested tool: **${t.name.replace(/^mcp_[a-zA-Z0-9]+_/, "")}**`,
            )
            .join("\n\n") || "";
        const sources = m.citations
          ?.map((c) =>
            /^https?:\/\//i.test(c.url)
              ? `- [${c.title.replace(/[[\]]/g, "")}](${c.url.replace(/[()]/g, encodeURIComponent)})`
              : "",
          )
          .filter(Boolean)
          .join("\n");
        return `## ${m.role === "user" ? "You" : "Relay"}${m.model ? ` · ${m.model}` : ""}\n\n${thought}${m.content}${toolNote ? `\n\n${toolNote}` : ""}${files ? `\n\n${files}` : ""}${sources ? `\n\n### Sources\n\n${sources}` : ""}`;
      })
      .join("\n\n---\n\n")
  );
}
