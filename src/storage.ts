import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "./api";

export type Conversation = {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  updatedAt: number;
  pinned: boolean;
};
export type Prompt = {
  id: string;
  title: string;
  description: string;
  category: string;
  instruction: string;
};
export const historyEnabled = () =>
  getPreferenceValues<{ saveHistory?: boolean }>().saveHistory !== false;
export const newConversation = (
  prompt: string,
  model: string,
): Conversation => ({
  id: randomUUID(),
  title: prompt.replace(/\s+/g, " ").slice(0, 72),
  model,
  messages: [{ role: "user", content: prompt }],
  updatedAt: Date.now(),
  pinned: false,
});

// A record per conversation prevents concurrent chats from overwriting each other.
const PREFIX = "relay-chat:";
function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<ChatMessage>;
  return (
    ["system", "user", "assistant"].includes(m.role || "") &&
    typeof m.content === "string" &&
    (m.reasoning === undefined || typeof m.reasoning === "string")
  );
}
function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Conversation>;
  return (
    typeof c.id === "string" &&
    Boolean(c.id) &&
    typeof c.title === "string" &&
    typeof c.model === "string" &&
    typeof c.updatedAt === "number" &&
    Number.isFinite(c.updatedAt) &&
    typeof c.pinned === "boolean" &&
    Array.isArray(c.messages) &&
    c.messages.every(isMessage)
  );
}
function normalizeMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant" || message.reasoning) return message;
  const match = message.content.match(
    /^\s*<think\b[^>]*>([\s\S]*?)<\/think\s*>\s*/i,
  );
  if (!match) return message;
  return {
    ...message,
    content: message.content.slice(match[0].length),
    reasoning: match[1].trim(),
  };
}

export async function getConversations(): Promise<Conversation[]> {
  const items = await LocalStorage.allItems();
  const result: Conversation[] = [];
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(PREFIX) || typeof value !== "string") continue;
    try {
      const item = JSON.parse(value);
      if (isConversation(item))
        result.push({
          ...item,
          messages: item.messages.map(normalizeMessage),
        });
    } catch {
      /* Preserve unreadable records. */
    }
  }
  return result.sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );
}
export async function saveConversation(chat: Conversation) {
  if (historyEnabled())
    await LocalStorage.setItem(PREFIX + chat.id, JSON.stringify(chat));
}
export async function deleteConversation(id: string) {
  await LocalStorage.removeItem(PREFIX + id);
}
export async function clearHistory() {
  const items = await LocalStorage.allItems();
  for (const key of Object.keys(items))
    if (key.startsWith(PREFIX)) await LocalStorage.removeItem(key);
}
export async function getPrompts(): Promise<Prompt[]> {
  const raw = await LocalStorage.getItem<string>("relay-prompts");
  if (!raw) return [];
  try {
    const prompts: unknown = JSON.parse(raw);
    if (
      Array.isArray(prompts) &&
      prompts.every((p: unknown) => {
        if (!p || typeof p !== "object") return false;
        const item = p as Partial<Prompt>;
        return (
          typeof item.id === "string" &&
          Boolean(item.id) &&
          typeof item.title === "string" &&
          typeof item.description === "string" &&
          typeof item.category === "string" &&
          typeof item.instruction === "string"
        );
      })
    )
      return prompts;
  } catch {
    /* Preserve the original data instead of overwriting it. */
  }
  throw new Error(
    "The saved prompt library is unreadable. Restore its relay-prompts record from a backup before editing; your saved data has been preserved.",
  );
}
export async function savePrompt(prompt: Prompt) {
  const prompts = await getPrompts();
  await LocalStorage.setItem(
    "relay-prompts",
    JSON.stringify([...prompts.filter((p) => p.id !== prompt.id), prompt]),
  );
}
export async function deletePrompt(id: string) {
  await LocalStorage.setItem(
    "relay-prompts",
    JSON.stringify((await getPrompts()).filter((p) => p.id !== id)),
  );
}
export function conversationMarkdown(chat: Conversation) {
  return (
    `# ${chat.title}\n\nModel: ${chat.model}\n\n` +
    chat.messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        const thinking =
          m.role === "assistant" && m.reasoning
            ? `> **Thinking**\n>\n${m.reasoning
                .trim()
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n")}\n\n`
            : "";
        return `## ${m.role === "user" ? "You" : "Relay"}\n\n${thinking}${m.content}`;
      })
      .join("\n\n---\n\n")
  );
}
