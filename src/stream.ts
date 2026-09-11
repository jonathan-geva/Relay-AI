/** Decode OpenAI SSE across arbitrary UTF-8/network chunk boundaries. */
export async function readCompletion(
  response: Response,
  onDelta?: (text: string) => void,
): Promise<string> {
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = (await response.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };
    if (body.error)
      throw new Error(body.error.message || "Provider returned an error");
    const text = body.choices?.[0]?.message?.content || "";
    onDelta?.(text);
    return text;
  }
  if (!response.body) throw new Error("The API returned no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
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
    const delta =
      choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
    if (typeof delta === "string") {
      full += delta;
      onDelta?.(full);
    }
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
      for (const line of lines) if (consume(line)) return full;
      if (done) {
        if (buffer) consume(buffer);
        break;
      }
    }
    return full;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
