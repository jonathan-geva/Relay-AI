/** Separate visible output from reasoning, including ChatMock's think-tag mode. */
class CompletionText {
  private pending = "";
  private hidden = false;
  private answer = "";
  private thought = "";

  pushContent(delta: string, final = false) {
    this.pending += delta;
    const open = "<think";
    const close = "</think>";

    while (this.pending) {
      const lower = this.pending.toLowerCase();
      if (this.hidden) {
        const end = lower.indexOf(close);
        if (end >= 0) {
          this.thought += this.pending.slice(0, end);
          this.pending = this.pending.slice(end + close.length);
          this.hidden = false;
          continue;
        }
        if (final) {
          this.thought += this.pending;
          this.pending = "";
        } else {
          const suffix = suffixThatStarts(this.pending, close);
          this.thought += this.pending.slice(
            0,
            this.pending.length - suffix.length,
          );
          this.pending = suffix;
        }
        break;
      }

      const start = lower.indexOf(open);
      if (start >= 0) {
        this.answer += this.pending.slice(0, start);
        const tagEnd = this.pending.indexOf(">", start + open.length);
        if (tagEnd < 0) {
          this.pending = this.pending.slice(start);
          if (final) this.pending = "";
          break;
        }
        this.pending = this.pending.slice(tagEnd + 1);
        this.hidden = true;
        continue;
      }

      if (final) {
        this.answer += this.pending.replace(/<\/think\s*>/gi, "");
        this.pending = "";
      } else {
        const suffix = suffixThatStarts(this.pending, open);
        this.answer += this.pending.slice(
          0,
          this.pending.length - suffix.length,
        );
        this.pending = suffix;
      }
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
        message?: {
          content?: string;
          reasoning_summary?: string;
          reasoning?: unknown;
        };
      }[];
    };
    if (body.error)
      throw new Error(body.error.message || "Provider returned an error");
    const message = body.choices?.[0]?.message;
    const thought = reasoningText(
      message?.reasoning_summary ?? message?.reasoning,
    );
    if (thought) appendReasoning(thought);
    return append(message?.content || "", true);
  }
  if (!response.body) throw new Error("The API returned no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  function consume(line: string): boolean {
    if (!line.startsWith("data:")) return false;
    const data = line.slice(5).trim();
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
    const thought = reasoningText(
      choice?.delta?.reasoning_summary ??
        choice?.delta?.reasoning ??
        choice?.message?.reasoning_summary ??
        choice?.message?.reasoning,
    );
    if (thought) appendReasoning(thought);
    const delta =
      choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
    if (typeof delta === "string") append(delta);
    return false;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) if (consume(line)) return append("", true);
      if (done) {
        if (buffer) consume(buffer);
        break;
      }
    }
    return append("", true);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
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
