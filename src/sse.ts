/** SSE framing with UTF-8, CR/LF/CRLF, multiline data and legacy JSON-line tolerance. */
export async function* sseData(response: Response): AsyncGenerator<string> {
  if (!response.body)
    throw new Error("The provider returned no response body.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    fields: string[] = [];
  const completeJSON = (s: string) => {
    if (s.trim() === "[DONE]") return true;
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  };
  function* line(value: string) {
    if (!value) {
      if (fields.length) {
        yield fields.join("\n");
        fields = [];
      }
      return;
    }
    if (value.startsWith(":")) return;
    const split = value.indexOf(":");
    const field = split < 0 ? value : value.slice(0, split);
    let data = split < 0 ? "" : value.slice(split + 1);
    if (data.startsWith(" ")) data = data.slice(1);
    if (field === "data") {
      if (fields.length && completeJSON(fields.join("\n"))) {
        yield fields.join("\n");
        fields = [];
      }
      fields.push(data);
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length > 2 * 1024 * 1024)
        throw new Error("A streaming event exceeded the 2 MB limit.");
      while (true) {
        const match = buffer.match(/[\r\n]/);
        if (
          match?.index === undefined ||
          (!done && match[0] === "\r" && match.index === buffer.length - 1)
        )
          break;
        const index = match.index,
          width = buffer.slice(index, index + 2) === "\r\n" ? 2 : 1;
        const current = buffer.slice(0, index);
        buffer = buffer.slice(index + width);
        yield* line(current);
      }
      if (done) {
        if (buffer) yield* line(buffer);
        if (fields.length) yield fields.join("\n");
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
