import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { fetchModels, getDefaultModel } from "./api";
import { ChatView } from "./chat-view";

export default function Command() {
  const { push } = useNavigation();
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [available, defaultModel] = await Promise.all([fetchModels(), getDefaultModel()]);
        setModels(available.length ? available : [defaultModel]);
        setModel(available.includes(defaultModel) ? defaultModel : available[0] || defaultModel);
      } catch (error) {
        const fallback = await getDefaultModel();
        setModels([fallback]);
        setModel(fallback);
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not fetch models",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Form
      isLoading={loading}
      navigationTitle="AI Chat"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Ask"
            icon={Icon.Stars}
            onSubmit={(values: { prompt: string }) => {
              const prompt = values.prompt?.trim();
              if (prompt && model) push(<ChatView initialPrompt={prompt} model={model} />);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea id="prompt" title="Message" placeholder="Ask anything…" autoFocus />
      <Form.Dropdown id="model" title="Model" value={model} onChange={setModel}>
        {models.map((m) => (
          <Form.Dropdown.Item key={m} title={m} value={m} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
