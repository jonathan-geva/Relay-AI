import { Action, ActionPanel, Icon, List, LocalStorage, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { fetchModels, getDefaultModel, setDefaultModel } from "./api";

export default function Command() {
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefault] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const [available, current] = await Promise.all([fetchModels(), getDefaultModel()]);
      setModels(available);
      setDefault(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <List isLoading={loading} navigationTitle="Models" searchBarPlaceholder="Search models…">
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not fetch models"
          description={`${error}\n\nMake sure ChatMock is running.`}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={load} />
            </ActionPanel>
          }
        />
      ) : (
        models.map((model) => (
          <List.Item
            key={model}
            title={model}
            icon={model === defaultModel ? Icon.CheckCircle : Icon.Circle}
            accessories={model === defaultModel ? [{ text: "Default" }] : []}
            actions={
              <ActionPanel>
                <Action
                  title="Set as Default"
                  icon={Icon.CheckCircle}
                  onAction={async () => {
                    await setDefaultModel(model);
                    setDefault(model);
                    await showToast({ style: Toast.Style.Success, title: "Default model changed", message: model });
                  }}
                />
                <Action title="Refresh Models" icon={Icon.ArrowClockwise} onAction={load} />
                <Action
                  title="Reset Stored Default"
                  icon={Icon.Trash}
                  onAction={async () => {
                    await LocalStorage.removeItem("default-model");
                    const fallback = await getDefaultModel();
                    setDefault(fallback);
                  }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
