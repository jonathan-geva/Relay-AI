import { Action, ActionPanel, Form, Icon, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { fetchModels, getDefaultModel } from "./api";
import { ChatView } from "./chat-view";
import { historyEnabled } from "./storage";

export function Compose({
  instruction = "",
  title = "New Conversation",
  initialText = "",
}: {
  instruction?: string;
  title?: string;
  initialText?: string;
}) {
  const { push } = useNavigation();
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void (async () => {
      const fallback = await getDefaultModel();
      if (!active) return;
      setModel(fallback);
      setModels([fallback]);
      try {
        const available = await fetchModels();
        if (active) setModels([...new Set([fallback, ...available])]);
      } catch {
        if (active)
          setNotice(
            "Model discovery is unavailable. You can still use your configured default model.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return (
    <Form
      navigationTitle={title}
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send to Relay"
            icon={Icon.Stars}
            onSubmit={(v: { prompt: string }) => {
              if (!v.prompt.trim()) {
                setError("Add a message or some text first.");
                return;
              }
              if (model)
                push(
                  <ChatView
                    initialPrompt={
                      instruction
                        ? `${instruction}\n\n---\n\n${v.prompt.trim()}`
                        : v.prompt.trim()
                    }
                    initialTitle={
                      instruction
                        ? `${title}: ${v.prompt.trim().replace(/\s+/g, " ").slice(0, 48)}`
                        : undefined
                    }
                    model={model}
                  />,
                );
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Relay AI"
        text={
          instruction ||
          "A fresh conversation with your chosen model. Ask a question, work through an idea, or give Relay something to create."
        }
      />
      <Form.TextArea
        id="prompt"
        title={instruction ? "Your Text" : "Message"}
        defaultValue={initialText}
        placeholder={
          instruction
            ? "Paste the text you want to work with…"
            : "What are we working on?"
        }
        error={error}
        onChange={() => setError(undefined)}
        autoFocus
      />
      <Form.Separator />
      <Form.Dropdown id="model" title="Model" value={model} onChange={setModel}>
        {models.map((m) => (
          <Form.Dropdown.Item key={m} value={m} title={m} />
        ))}
      </Form.Dropdown>
      <Form.Description
        title="Privacy"
        text={
          historyEnabled()
            ? "Conversation history is saved on this device. Messages are sent to your configured API endpoint."
            : "History is off. Messages are still sent to your configured API endpoint."
        }
      />
      {notice && <Form.Description title="Connection" text={notice} />}
    </Form>
  );
}
