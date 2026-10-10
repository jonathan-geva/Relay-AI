import type { ChatMessage, GenerationSettings } from "./domain";
import type { Connection } from "./providers";
import type { AvailableTool } from "./mcp";
import { attachmentText } from "./attachments";
import { sseData } from "./sse";
import { readCompletion, citations } from "./stream";
export type Request = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};
type WireBlock = {
  type?: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  input?: unknown;
  text?: string;
  thinking?: string;
  signature?: string;
  refusal?: string;
  annotations?: unknown[];
  citations?: unknown[];
  content?: WireBlock[];
  summary?: { text: string }[];
};
type WireDelta = {
  text?: string;
  thinking?: string;
  signature?: string;
  partial_json?: string;
  citation?: { url?: string; title?: string };
  stop_reason?: string;
};
type WireResponse = {
  error?: { message?: string };
  content?: WireBlock[];
  output?: WireBlock[];
  stop_reason?: string;
  incomplete_details?: { reason?: string };
};
type WireEvent = {
  type: string;
  index?: number;
  error?: { message?: string };
  response?: WireResponse;
  content_block?: WireBlock;
  delta?: WireDelta | string;
  annotation?: unknown;
  item?: WireBlock;
};
const textPart = (m: ChatMessage) => attachmentText(m);
export function buildRequest(
  c: Connection,
  messages: ChatMessage[],
  model: string,
  settings: GenerationSettings,
  stream: boolean,
  tools: AvailableTool[] = [],
): Request {
  const images = messages.some((m) => m.attachments?.some((a) => a.data));
  if (images && !c.capabilities.images)
    throw new Error(
      "Enable image capability in this provider profile or choose an image-capable provider.",
    );
  if (settings.webSearch && !c.capabilities.webSearch)
    throw new Error("Web search is not enabled for this provider profile.");
  if (tools.length && !c.capabilities.tools)
    throw new Error("Tools are not enabled for this provider profile.");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (c.apiKey) headers.Authorization = `Bearer ${c.apiKey}`;
  const functions = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
  if (c.kind === "anthropic") {
    delete headers.Authorization;
    if (c.apiKey) headers["x-api-key"] = c.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    const wire = messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (m.role === "tool")
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.toolCallId,
                content: m.content,
              },
            ],
          };
        if (m.role === "assistant" && m.providerBlocks?.length)
          return { role: "assistant", content: m.providerBlocks };
        const content: Record<string, unknown>[] = [
          { type: "text", text: textPart(m) || " " },
        ];
        for (const a of m.attachments || [])
          if (a.data)
            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: a.mime,
                data: a.data.split(",")[1],
              },
            });
        for (const t of m.toolCalls || [])
          content.push({
            type: "tool_use",
            id: t.id,
            name: t.name,
            input: JSON.parse(t.arguments || "{}"),
          });
        return { role: m.role, content };
      });
    return {
      url: `${c.baseUrl}/messages`,
      headers,
      body: {
        model,
        messages: wire,
        system: messages
          .filter((m) => m.role === "system")
          .map((m) => m.content)
          .join("\n\n"),
        max_tokens: settings.maxTokens || 4096,
        stream,
        ...(settings.reasoningEffort && c.capabilities.reasoning
          ? { output_config: { effort: settings.reasoningEffort } }
          : {}),
        ...(tools.length
          ? {
              tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
            }
          : {}),
        ...(settings.webSearch
          ? {
              tools: [
                ...tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.parameters,
                })),
                { type: "web_search_20250305", name: "web_search" },
              ],
            }
          : {}),
      },
    };
  }
  if (c.kind === "responses") {
    const input = messages.flatMap<Record<string, unknown>>((m) => {
      if (m.role === "assistant" && m.responseItems?.length)
        return m.responseItems;
      if (m.role === "tool")
        return [
          {
            type: "function_call_output",
            call_id: m.toolCallId,
            output: m.content,
          },
        ];
      const content: Record<string, unknown>[] = [
        {
          type: m.role === "assistant" ? "output_text" : "input_text",
          text: textPart(m),
        },
      ];
      for (const a of m.attachments || [])
        if (a.data) content.push({ type: "input_image", image_url: a.data });
      return [
        { role: m.role, content },
        ...(m.toolCalls || []).map((t) => ({
          type: "function_call",
          call_id: t.id,
          name: t.name,
          arguments: t.arguments,
        })),
      ];
    });
    const responseTools: Record<string, unknown>[] = tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
    if (settings.webSearch) responseTools.push({ type: "web_search" });
    return {
      url: `${c.baseUrl}/responses`,
      headers,
      body: {
        model,
        input,
        stream,
        ...(settings.maxTokens
          ? { max_output_tokens: settings.maxTokens }
          : {}),
        ...(settings.reasoningEffort && c.capabilities.reasoning
          ? { reasoning: { effort: settings.reasoningEffort, summary: "auto" } }
          : {}),
        ...(responseTools.length ? { tools: responseTools } : {}),
      },
    };
  }
  const wire = messages.map((m) => {
    const images = (m.attachments || []).filter((a) => a.data);
    const content = images.length
      ? [
          { type: "text", text: textPart(m) },
          ...images.map((a) => ({
            type: "image_url",
            image_url: { url: a.data },
          })),
        ]
      : textPart(m);
    return {
      role: m.role,
      content,
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.toolCalls?.length
        ? {
            tool_calls: m.toolCalls.map((t) => ({
              id: t.id,
              type: "function",
              function: { name: t.name, arguments: t.arguments },
            })),
          }
        : {}),
    };
  });
  return {
    url: `${c.baseUrl}/chat/completions`,
    headers,
    body: {
      model,
      messages: wire,
      stream,
      ...(c.managed
        ? {
            reasoning: {
              summary: "auto",
              ...(settings.reasoningEffort
                ? { effort: settings.reasoningEffort }
                : {}),
            },
          }
        : settings.reasoningEffort && c.capabilities.reasoning
          ? { reasoning_effort: settings.reasoningEffort }
          : {}),
      ...(settings.maxTokens
        ? { max_completion_tokens: settings.maxTokens }
        : {}),
      ...(settings.webSearch
        ? {
            responses_tools: [{ type: "web_search" }],
            responses_tool_choice: "auto",
          }
        : {}),
      ...(functions.length ? { tools: functions, tool_choice: "auto" } : {}),
    },
  };
}
export async function readProtocol(
  response: Response,
  kind: Connection["kind"],
  onUpdate?: (message: ChatMessage) => void,
): Promise<ChatMessage> {
  let message: ChatMessage = { role: "assistant", content: "" };
  const publish = () => onUpdate?.({ ...message });
  if (kind === "chat-completions") {
    message.content = await readCompletion(
      response,
      (text) => {
        message.content = text;
        publish();
      },
      (text) => {
        message.reasoning = text;
        publish();
      },
      (metadata) => {
        const sources = [
          ...(message.citations || []),
          ...(metadata.citations || []),
        ];
        message = {
          ...message,
          ...metadata,
          citations: sources.filter(
            (v, i, a) => a.findIndex((c) => c.url === v.url) === i,
          ),
        };
        publish();
      },
    );
    return message;
  }
  const toolBlocks = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  const providerBlocks = new Map<number, WireBlock>();
  const consume = (event: WireEvent) => {
    if (
      event.error ||
      event.type === "error" ||
      event.type === "response.failed"
    )
      throw new Error(
        event.error?.message ||
          event.response?.error?.message ||
          "The provider returned an error.",
      );
    if (kind === "anthropic") {
      const index = event.index || 0,
        d = typeof event.delta === "object" ? event.delta : {};
      if (event.type === "content_block_start" && event.content_block)
        providerBlocks.set(index, { ...event.content_block });
      if (event.type === "content_block_start" && event.content_block?.text)
        message.content += event.content_block.text;
      if (event.type === "content_block_start" && event.content_block?.thinking)
        message.reasoning =
          (message.reasoning || "") + event.content_block.thinking;
      const block = providerBlocks.get(index);
      if (block && event.type === "content_block_delta") {
        if (d.text) block.text = (block.text || "") + d.text;
        if (d.thinking) block.thinking = (block.thinking || "") + d.thinking;
        if (d.signature)
          block.signature = (block.signature || "") + d.signature;
      }
      if (
        event.type === "content_block_start" &&
        event.content_block?.type === "tool_use"
      )
        toolBlocks.set(index, {
          id: event.content_block.id || "",
          name: event.content_block.name || "",
          arguments: "",
        });
      if (event.type === "content_block_delta") {
        if (d.text) message.content += d.text;
        if (d.thinking)
          message.reasoning = (message.reasoning || "") + d.thinking;
        if (d.partial_json && toolBlocks.has(index))
          toolBlocks.get(index)!.arguments += d.partial_json;
        if (d.citation?.url)
          message.citations = [
            ...(message.citations || []),
            { url: d.citation.url, title: d.citation.title || d.citation.url },
          ];
      }
      if (event.type === "message_delta") message.finishReason = d.stop_reason;
      if (toolBlocks.size) message.toolCalls = [...toolBlocks.values()];
      if (event.type === "content_block_stop" && block?.type === "tool_use") {
        const call = toolBlocks.get(index);
        if (call) {
          try {
            block.input = JSON.parse(call.arguments || "{}");
          } catch {
            throw new Error("The provider returned invalid tool JSON.");
          }
        }
      }
      if (providerBlocks.size)
        message.providerBlocks = [...providerBlocks.values()];
    } else {
      if (
        event.type === "response.output_text.delta" &&
        typeof event.delta === "string"
      )
        message.content += event.delta;
      if (
        event.type === "response.refusal.delta" &&
        typeof event.delta === "string"
      )
        message.content += event.delta;
      if (
        /^response.reasoning(_summary)?_text.delta$/.test(event.type) &&
        typeof event.delta === "string"
      )
        message.reasoning = (message.reasoning || "") + event.delta;
      if (event.type === "response.output_text.annotation.added")
        message.citations = [
          ...(message.citations || []),
          ...citations([event.annotation]),
        ];
      if (
        event.type === "response.output_item.done" &&
        event.item?.type === "function_call"
      )
        message.toolCalls = [
          ...(message.toolCalls || []),
          {
            id: event.item.call_id || "",
            name: event.item.name || "",
            arguments: event.item.arguments || "{}",
          },
        ];
      if (
        event.type === "response.completed" ||
        event.type === "response.incomplete"
      )
        message.finishReason =
          event.response?.incomplete_details?.reason || "stop";
      if (event.type === "response.output_item.done" && event.item) {
        message.responseItems = [...(message.responseItems || []), event.item];
        const parts = event.item.content || [];
        if (!message.content && event.item.type === "message")
          message.content = parts
            .map((p) => p.text || p.refusal || "")
            .join("");
        if (!message.reasoning && event.item.type === "reasoning")
          message.reasoning = event.item.summary?.map((p) => p.text).join("\n");
        message.citations = [
          ...(message.citations || []),
          ...parts.flatMap((p) => citations(p.annotations || p.citations)),
        ];
      }
    }
    publish();
  };
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = (await response.json()) as WireResponse;
    if (body.error) throw new Error(body.error.message || "Provider error");
    if (kind === "anthropic") message.providerBlocks = body.content;
    else message.responseItems = body.output;
    const blocks: WireBlock[] =
      kind === "anthropic"
        ? body.content || []
        : (body.output || []).flatMap((i) =>
            i.type === "function_call"
              ? [i]
              : i.type === "reasoning"
                ? (i.summary || []).map((s) => ({
                    ...s,
                    type: "thinking",
                    thinking: s.text,
                  }))
                : i.content || [],
          );
    for (const b of blocks) {
      if (["text", "output_text"].includes(b.type || ""))
        message.content += b.text || "";
      if (b.type === "refusal") message.content += b.refusal || "";
      if (b.type === "thinking")
        message.reasoning = (message.reasoning || "") + (b.thinking || "");
      if (["tool_use", "function_call"].includes(b.type || ""))
        message.toolCalls = [
          ...(message.toolCalls || []),
          {
            id: b.call_id || b.id || "",
            name: b.name || "",
            arguments: b.arguments || JSON.stringify(b.input || {}),
          },
        ];
      message.citations = [
        ...(message.citations || []),
        ...citations(b.annotations || b.citations),
      ];
    }
    message.finishReason =
      body.stop_reason || body.incomplete_details?.reason || "stop";
    publish();
  } else
    for await (const data of sseData(response)) {
      if (data.trim() === "[DONE]") break;
      if (data.trim()) {
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          throw new Error("The provider returned malformed streaming data.");
        }
        consume(event);
      }
    }
  message.citations = message.citations?.filter(
    (c, i, a) => a.findIndex((v) => v.url === c.url) === i,
  );
  return message;
}
