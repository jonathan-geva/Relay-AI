import { Action, ActionPanel, Detail, getSelectedText, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { ChatMessage, complete, getDefaultModel } from "./api";

export default function Command() {
  const [markdown, setMarkdown] = useState("_Reading selected text…_");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const selected = await getSelectedText();
        const model = await getDefaultModel();
        const messages: ChatMessage[] = [
          {
            role: "user",
            content: `Explain or answer questions about the following selected text. Be concise unless detail is useful.\n\n${selected}`,
          },
        ];
        const answer = await complete(messages, model, setMarkdown);
        setMarkdown(answer || "_No text returned._");
      } catch (error) {
        setMarkdown("### Could not read or process the selection\n\nSelect some text in another application and try again.");
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not process selection",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Detail
      isLoading={loading}
      navigationTitle="Ask About Selected Text"
      markdown={markdown}
      actions={
        markdown && !loading ? (
          <ActionPanel>
            <Action.CopyToClipboard content={markdown} />
            <Action.Paste content={markdown} />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}
