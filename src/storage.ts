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
export async function getConversations(): Promise<Conversation[]> {
  const items = await LocalStorage.allItems();
  const result: Conversation[] = [];
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(PREFIX) || typeof value !== "string") continue;
    try {
      const item = JSON.parse(value);
      if (item.id && Array.isArray(item.messages)) result.push(item);
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
  for (const chat of await getConversations())
    await deleteConversation(chat.id);
}
export async function getPrompts(): Promise<Prompt[]> {
  const raw = await LocalStorage.getItem<string>("relay-prompts");
  return raw ? JSON.parse(raw) : [];
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
      .map((m) => `## ${m.role === "user" ? "You" : "Relay"}\n\n${m.content}`)
      .join("\n\n---\n\n")
  );
}
