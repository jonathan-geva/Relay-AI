import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { readCompletion } from "./stream";
import { managedConnection, MANAGED_KEY } from "./chatmock";

export type Role = "system" | "user" | "assistant";
export type ChatMessage = { role: Role; content: string; reasoning?: string };

type Preferences = {
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  systemPrompt?: string;
};

function config() {
  const p = getPreferenceValues<Preferences>();
  return {
    ...p,
    baseUrl: p.baseUrl.replace(/\/+$/, ""),
  };
}

function headers(apiKey?: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

export async function fetchModels(): Promise<string[]> {
  const { baseUrl, apiKey } = (await managedConnection()) || config();
  const response = await fetch(`${baseUrl}/models`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(
      `Models request failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    .sort((a, b) => a.localeCompare(b));
}

export async function getDefaultModel(): Promise<string> {
  const key = (await LocalStorage.getItem<boolean>(MANAGED_KEY))
    ? "chatmock-default-model"
    : "default-model";
  const stored = await LocalStorage.getItem<string>(key);
  return stored || config().defaultModel;
}

export async function setDefaultModel(model: string) {
  const key = (await LocalStorage.getItem<boolean>(MANAGED_KEY))
    ? "chatmock-default-model"
    : "default-model";
  await LocalStorage.setItem(key, model);
}

export function withSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  const { systemPrompt } = config();
  if (!systemPrompt?.trim()) return messages;
  if (messages[0]?.role === "system") return messages;
  return [{ role: "system", content: systemPrompt.trim() }, ...messages];
}

export async function complete(
  messages: ChatMessage[],
  model: string,
  onDelta?: (fullText: string) => void,
  signal?: AbortSignal,
  onReasoning?: (fullText: string) => void,
): Promise<string> {
  const managed = await managedConnection();
  const { baseUrl, apiKey } = managed || config();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(180000)])
      : AbortSignal.timeout(180000),
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      messages: withSystemPrompt(messages).map(({ role, content }) => ({
        role,
        content,
      })),
      stream: Boolean(onDelta),
      ...(managed ? { reasoning: { summary: "auto" } } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Chat request failed (${response.status}): ${text || response.statusText}`,
    );
  }

  return readCompletion(response, onDelta, onReasoning);
}
