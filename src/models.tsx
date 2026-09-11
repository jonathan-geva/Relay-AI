import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  LocalStorage,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { fetchModels, getDefaultModel, setDefaultModel } from "./api";
import { Compose } from "./compose";
export default function Command() {
  const { push } = useNavigation();
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefault] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const [available, current] = await Promise.all([
        fetchModels(),
        getDefaultModel(),
      ]);
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
  const connection = (
    <ActionPanel.Section title="Connection">
      <Action
        title="Refresh Models"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={load}
      />
      <Action
        title="Open API Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
    </ActionPanel.Section>
  );
  return (
    <List
      isLoading={loading}
      navigationTitle="Models & Connection"
      searchBarPlaceholder="Search available models…"
    >
      <List.EmptyView
        icon={error ? Icon.Warning : Icon.Stars}
        title={
          error ? "Could not reach your model provider" : "No models found"
        }
        description={
          error
            ? `${error}\nCheck your API URL and key. For ChatMock, make sure the local server is running.`
            : "The provider returned no models. Set a fallback model in preferences to start chatting."
        }
        actions={
          <ActionPanel>
            {connection}
            <Action
              title="Start with Default Model"
              icon={Icon.Message}
              onAction={() => push(<Compose />)}
            />
          </ActionPanel>
        }
      />
      <List.Section
        title="Available Models"
        subtitle={`${models.length} models · Choose your default`}
      >
        {models.map((model) => (
          <List.Item
            key={model}
            title={model}
            icon={{
              source: model === defaultModel ? Icon.CheckCircle : Icon.Stars,
              tintColor:
                model === defaultModel ? Color.Green : Color.SecondaryText,
            }}
            accessories={
              model === defaultModel
                ? [{ tag: { value: "Default", color: Color.Green } }]
                : []
            }
            actions={
              <ActionPanel>
                <Action
                  title="Set as Default"
                  icon={Icon.CheckCircle}
                  onAction={async () => {
                    await setDefaultModel(model);
                    setDefault(model);
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Default model changed",
                      message: model,
                    });
                  }}
                />
                {connection}
                <Action
                  title="Reset Stored Default"
                  icon={Icon.ArrowCounterClockwise}
                  onAction={async () => {
                    await LocalStorage.removeItem("default-model");
                    setDefault(await getDefaultModel());
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
