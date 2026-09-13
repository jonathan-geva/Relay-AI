import {
  Action,
  ActionPanel,
  Detail,
  getSelectedText,
  Icon,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { Compose } from "./compose";
export default function Command() {
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const started = useRef(false);
  async function read() {
    setError(undefined);
    try {
      const text = await getSelectedText();
      if (!text.trim())
        throw new Error(
          "Select some text in another application and try again.",
        );
      setSelected(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void read();
  }, []);
  if (selected !== undefined)
    return (
      <Compose
        title="Ask About Selected Text"
        initialText={`Help me understand the following text:\n\n${selected}`}
        conversationTitle={`Ask about: ${selected.replace(/\s+/g, " ").slice(0, 52)}`}
      />
    );
  return (
    <Detail
      isLoading={!error}
      markdown={
        error
          ? `# Select text to get started\n\n${error}`
          : "Reading your selection…"
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
