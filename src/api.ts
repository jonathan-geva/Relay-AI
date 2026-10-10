import { LocalStorage } from "@raycast/api";
import { parseModelList } from "./model-list";
import {
  activeProviderId,
  getProviders,
  globalInstruction,
  providerFingerprint,
  resolveConnection,
} from "./providers";
import { buildRequest, readProtocol } from "./protocols";
import { discoverTools, runTool, AvailableTool } from "./mcp";
import {
  ChatMessage,
  GenerationSettings,
  ToolCall,
  estimateTokens,
} from "./domain";
export type { ChatMessage } from "./domain";
export type Role = ChatMessage["role"];
export async function fetchModels(providerId?: string): Promise<string[]> {
  const c = await resolveConnection(providerId);
  const headers: Record<string, string> =
    c.kind === "anthropic"
      ? {
          "anthropic-version": "2023-06-01",
          ...(c.apiKey ? { "x-api-key": c.apiKey } : {}),
        }
      : c.apiKey
        ? { Authorization: `Bearer ${c.apiKey}` }
        : {};
  const response = await fetch(`${c.baseUrl}/models`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Models request failed (${response.status} ${response.statusText})`,
    );
  return parseModelList(await response.json()).sort((a, b) =>
    a.localeCompare(b),
  );
}
async function defaultKeys(providerId?: string) {
  const id = providerId || (await activeProviderId());
  const p = (await getProviders()).find((p) => p.id === id);
  if (!p) throw new Error("Choose an available provider profile.");
  return {
    id,
    p,
    scoped: `relay-default:${providerFingerprint(p)}`,
    legacy:
      id === "managed"
        ? "chatmock-default-model"
        : id === "preferences"
          ? "default-model"
          : undefined,
  };
}
export async function getDefaultModel(providerId?: string) {
  const { p, scoped, legacy } = await defaultKeys(providerId);
  const stored = await LocalStorage.getItem<string>(scoped);
  const marker = await LocalStorage.getItem<string>(
    "relay-legacy-default-fingerprint",
  );
  const old =
    legacy && (legacy !== "default-model" || !marker || marker === scoped)
      ? await LocalStorage.getItem<string>(legacy)
      : undefined;
  return stored || old || p.defaultModel;
}
export async function setDefaultModel(model: string, providerId?: string) {
  const { scoped, legacy } = await defaultKeys(providerId);
  await LocalStorage.setItem(scoped, model);
  if (legacy) await LocalStorage.setItem(legacy, model);
  if (legacy === "default-model")
    await LocalStorage.setItem("relay-legacy-default-fingerprint", scoped);
}
export async function resetDefaultModel(providerId?: string) {
  const { scoped, legacy } = await defaultKeys(providerId);
  await LocalStorage.removeItem(scoped);
  if (legacy) await LocalStorage.removeItem(legacy);
}
export function chooseAvailableModel(saved: string, available: string[]) {
  return available.length && !available.includes(saved) ? available[0] : saved;
}
export function withSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  const instruction = globalInstruction();
  return instruction && messages[0]?.role !== "system"
    ? [{ role: "system", content: instruction }, ...messages]
    : messages;
}
export function friendlyError(e: unknown): string {
  if (e instanceof Error && e.name === "TimeoutError")
    return "The response timed out after three minutes. Retry with a faster model or a shorter message.";
  const text = e instanceof Error ? e.message : String(e);
  if (/401|403/.test(text))
    return "Authentication failed. Sign in to ChatMock again, or check this provider's API key.";
  if (/429/.test(text))
    return "The provider is rate limited. Wait before retrying, or change the model/provider.";
  if (/context|token.*limit|too.*long/i.test(text))
    return "This conversation exceeds the provider's context limit. Summarize earlier messages or start a branch with less context.";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(text))
    return "Could not connect to the provider. Check its URL and whether the server is running.";
  return text;
}
export type GenerateOptions = GenerationSettings & {
  providerId?: string;
  approveTool?: (
    call: ToolCall,
    tool: AvailableTool | undefined,
  ) => Promise<boolean>;
  onTool?: (name: string) => void;
};
export async function generate(
  messages: ChatMessage[],
  model: string,
  options: GenerateOptions = {},
  onUpdate?: (message: ChatMessage) => void,
  signal?: AbortSignal,
): Promise<{ message: ChatMessage; messages: ChatMessage[] }> {
  signal?.throwIfAborted();
  const c = await resolveConnection(options.providerId);
  signal?.throwIfAborted();
  const budget = options.contextBudget || 24000;
  if (estimateTokens(messages) > budget)
    throw new Error(
      `Estimated context is above the ${budget.toLocaleString()} token budget. Summarize earlier messages or increase the budget in Chat Settings.`,
    );
  let tools = options.allowTools ? await discoverTools(signal) : [];
  if (options.agentId && tools.length) {
    const { getAgents } = await import("./storage");
    const agent = (await getAgents()).find((a) => a.id === options.agentId);
    tools = tools.filter((t) => agent?.toolNames.includes(t.name));
  }
  const history = [...messages];
  const deadline = AbortSignal.timeout(180000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let round = 0; round < 8; round++) {
    if (estimateTokens(history) > budget)
      throw new Error(
        "Tool results exceeded the context budget. Continue with a summary or a larger budget.",
      );
    requestSignal.throwIfAborted();
    const started = Date.now();
    // ChatMock's Responses route preserves search annotations that its
    // Chat Completions translation omits.
    const protocol =
      c.managed && options.webSearch ? { ...c, kind: "responses" as const } : c;
    const request = buildRequest(
      protocol,
      withSystemPrompt(history),
      model,
      options,
      Boolean(onUpdate),
      tools,
    );
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: requestSignal,
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 2000);
      throw new Error(
        `Chat request failed (${response.status}): ${text || response.statusText}`,
      );
    }
    const message = await readProtocol(response, protocol.kind, onUpdate);
    message.model = model;
    message.durationMs = Date.now() - started;
    if (!message.toolCalls?.length) {
      if (!message.content.trim())
        throw new Error(
          "The model returned no text. Retry or choose another model.",
        );
      return { message, messages: [...history, message] };
    }
    history.push(message);
    for (const call of message.toolCalls) {
      const tool = tools.find((t) => t.name === call.name);
      requestSignal.throwIfAborted();
      const approved = options.approveTool
        ? await options.approveTool(call, tool)
        : false;
      requestSignal.throwIfAborted();
      options.onTool?.(
        approved
          ? `Running ${tool?.originalName || call.name}`
          : `Declined ${call.name}`,
      );
      let content = "The user declined this tool call. Do not retry it.";
      if (approved) {
        try {
          content = await runTool(call, tools, requestSignal);
        } catch (e) {
          if (requestSignal.aborted) throw e;
          content = `Tool failed: ${friendlyError(e)}`;
        }
      }
      history.push({ role: "tool", content, toolCallId: call.id });
    }
  }
  throw new Error(
    "The agent reached the eight-step tool limit. Continue with tools off or narrow the task.",
  );
}
export async function complete(
  messages: ChatMessage[],
  model: string,
  onDelta?: (fullText: string) => void,
  signal?: AbortSignal,
  onReasoning?: (fullText: string) => void,
): Promise<string> {
  const result = await generate(
    messages,
    model,
    {},
    onDelta || onReasoning
      ? (message) => {
          onDelta?.(message.content);
          if (message.reasoning) onReasoning?.(message.reasoning);
        }
      : undefined,
    signal,
  );
  return result.message.content;
}
