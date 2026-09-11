import { getPreferenceValues, LocalStorage } from "@raycast/api";

export type Role = "system" | "user" | "assistant";
export type ChatMessage = { role: Role; content: string };

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

function headers() {
  const { apiKey } = config();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

export async function fetchModels(): Promise<string[]> {
  const { baseUrl } = config();
  const response = await fetch(`${baseUrl}/models`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`Models request failed (${response.status} ${response.statusText})`);
  }

  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => Boolean(id))
    .sort((a, b) => a.localeCompare(b));
}

export async function getDefaultModel(): Promise<string> {
  const stored = await LocalStorage.getItem<string>("default-model");
  return stored || config().defaultModel;
}

export async function setDefaultModel(model: string) {
  await LocalStorage.setItem("default-model", model);
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
): Promise<string> {
  const { baseUrl } = config();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      messages: withSystemPrompt(messages),
      stream: Boolean(onDelta),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat request failed (${response.status}): ${text || response.statusText}`);
  }

  if (!onDelta) {
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content ?? "";
  }

  if (!response.body) throw new Error("The API returned no response body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const chunk = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
            text?: string;
          }>;
        };
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? "";
        if (delta) {
          full += delta;
          onDelta(full);
        }
      } catch {
        // Ignore keep-alive or provider-specific non-JSON SSE lines.
      }
    }
  }

  if (!full && buffer.trim()) {
    const maybeJson = buffer.replace(/^data:\s*/, "").trim();
    if (maybeJson && maybeJson !== "[DONE]") {
      try {
        const chunk = JSON.parse(maybeJson) as {
          choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
        };
        full = chunk.choices?.[0]?.message?.content ?? chunk.choices?.[0]?.delta?.content ?? "";
        if (full) onDelta(full);
      } catch {
        // Nothing else to do.
      }
    }
  }

  return full;
}
