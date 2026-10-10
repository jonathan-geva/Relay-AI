import { sseData } from "./sse.ts";
import type { ChatMessage, Citation, ToolCall } from "./domain";
/** Separate visible output from reasoning, including ChatMock's think-tag mode. */
class CompletionText {
  private pending = "";
  private mode: "prefix" | "reasoning" | "answer" = "prefix";
  private answer = "";
  private thought = "";

  pushContent(delta: string, final = false) {
    this.pending += delta;
    const close = "</think>";

    while (this.pending) {
      if (this.mode === "reasoning") {
        const end = this.pending.match(/<\/think\s*>/i);
        if (end?.index !== undefined) {
          this.thought += this.pending.slice(0, end.index);
          this.pending = this.pending.slice(end.index + end[0].length);
          this.mode = "answer";
          continue;
        }
        if (final) {
          this.thought += this.pending;
          this.pending = "";
        } else {
          const suffix =
            this.pending.match(/<\/think\s*$/i)?.[0] ||
            suffixThatStarts(this.pending, close);
          this.thought += this.pending.slice(
            0,
            this.pending.length - suffix.length,
          );
          this.pending = suffix;
        }
        break;
      }

      // Only a leading, complete reasoning tag is protocol markup. Tags in
      // ordinary explanations and code must stay in the visible answer.
      if (this.mode === "prefix") {
        const prefix = this.pending.trimStart().toLowerCase();
        const tag = this.pending.match(/^\s*<think(?:\s[^>]*)?>/i);
        if (tag) {
          this.pending = this.pending.slice(tag[0].length);
          this.mode = "reasoning";
          continue;
        }
        if (
          !final &&
          ("<think>".startsWith(prefix) || /^<think\s[^>]*$/.test(prefix))
        )
          break;
        this.mode = "answer";
      }
      this.answer += this.pending;
      this.pending = "";
      break;
    }
    return this.snapshot();
  }

  pushReasoning(delta: string) {
    this.thought += delta;
    return this.snapshot();
  }

  private snapshot() {
    return { content: this.answer, reasoning: this.thought };
  }
}

function suffixThatStarts(value: string, token: string): string {
  const lower = value.toLowerCase();
  for (
    let length = Math.min(lower.length, token.length - 1);
    length > 0;
    length--
  )
    if (token.startsWith(lower.slice(-length))) return value.slice(-length);
  return "";
}

export async function readCompletion(
  response: Response,
  onDelta?: (text: string) => void,
  onReasoning?: (text: string) => void,
  onMetadata?: (metadata: Partial<ChatMessage>) => void,
): Promise<string> {
  const completion = new CompletionText();
  let full = "";
  let reasoning = "";
  const publish = (next: { content: string; reasoning: string }) => {
    if (next.content !== full) {
      full = next.content;
      onDelta?.(full);
    }
    if (next.reasoning !== reasoning) {
      reasoning = next.reasoning;
      onReasoning?.(reasoning);
    }
    return full;
  };
  const append = (text: string, final = false) =>
    publish(completion.pushContent(text, final));
  const appendReasoning = (text: string) =>
    publish(completion.pushReasoning(text));
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = (await response.json()) as {
      error?: { message?: string };
      choices?: {
        finish_reason?: string;
        message?: {
          content?: string;
          reasoning_summary?: string;
          reasoning_content?: string;
          reasoning?: unknown;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
          annotations?: unknown[];
        };
      }[];
    };
    if (body.error)
      throw new Error(body.error.message || "Provider returned an error");
    const message = body.choices?.[0]?.message;
    onMetadata?.({
      finishReason: body.choices?.[0]?.finish_reason,
      toolCalls: message?.tool_calls?.map((t) => ({
        id: t.id,
        name: t.function.name,
        arguments: t.function.arguments,
      })),
      citations: citations(message?.annotations),
    });
    const thought = reasoningText(
      message?.reasoning_summary ??
        message?.reasoning_content ??
        message?.reasoning,
    );
    if (thought) appendReasoning(thought);
    return append(message?.content || "", true);
  }
  const calls = new Map<number, ToolCall>();
  function consume(data: string): boolean {
    data = data.trim();
    if (data === "[DONE]") return true;
    if (!data) return false;
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      throw new Error(
        "The provider returned malformed streaming data. Retry the request.",
      );
    }
    if (chunk.error)
      throw new Error(chunk.error.message || "Provider returned an error");
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason)
      onMetadata?.({ finishReason: choice.finish_reason });
    for (const t of choice?.delta?.tool_calls || []) {
      const previous = calls.get(t.index) || {
        id: t.id || "",
        name: "",
        arguments: "",
      };
      calls.set(t.index, {
        id: t.id || previous.id,
        name: previous.name + (t.function?.name || ""),
        arguments: previous.arguments + (t.function?.arguments || ""),
      });
    }
    if (calls.size) onMetadata?.({ toolCalls: [...calls.values()] });
    const sources = citations(
      choice?.delta?.annotations || choice?.message?.annotations,
    );
    if (sources.length) onMetadata?.({ citations: sources });
    const thought = reasoningText(
      choice?.delta?.reasoning_summary ??
        choice?.delta?.reasoning_content ??
        choice?.delta?.reasoning ??
        choice?.message?.reasoning_summary ??
        choice?.message?.reasoning_content ??
        choice?.message?.reasoning,
    );
    if (thought) appendReasoning(thought);
    const delta =
      choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
    if (typeof delta === "string") append(delta);
    return false;
  }
  for await (const data of sseData(response))
    if (consume(data)) return append("", true);
  return append("", true);
}

export function citations(values: unknown): Citation[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const a = v as {
      url?: string;
      title?: string;
      url_citation?: { url?: string; title?: string };
    };
    const source = a.url_citation || a;
    return typeof source.url === "string" && /^https?:\/\//i.test(source.url)
      ? [
          {
            url: source.url,
            title: typeof source.title === "string" ? source.title : source.url,
          },
        ]
      : [];
  });
}

function reasoningText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part &&
      typeof part === "object" &&
      typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");
}
