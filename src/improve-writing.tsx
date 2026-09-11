import {
  Action,
  ActionPanel,
  Detail,
  getSelectedText,
  Icon,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { Compose } from "./compose";
export default function Command() {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  async function read() {
    setError(undefined);
    try {
      const selection = await getSelectedText();
      if (!selection.trim())
        throw new Error("Select text in another application first.");
      setText(selection);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void read();
  }, []);
  return text !== undefined ? (
    <Compose
      title="Improve Selected Writing"
      initialText={text}
      instruction="Improve grammar, clarity, and flow. Preserve the original meaning, language, and voice. Return only the improved text."
    />
  ) : (
    <Detail
      isLoading={!error}
      markdown={
        error ? `# Select some writing\n\n${error}` : "Reading your selection…"
      }
      actions={
        error ? (
          <ActionPanel>
            <Action
              title="Read Selection Again"
              icon={Icon.ArrowClockwise}
              onAction={read}
            />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}
