import {
  Action,
  ActionPanel,
  confirmAlert,
  Form,
  Icon,
  List,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { randomUUID } from "node:crypto";
import { ProviderProfile } from "./domain";
import {
  activeProviderId,
  getProviders,
  removeProvider,
  saveProvider,
  setActiveProvider,
} from "./providers";
function Editor({
  profile,
  onSave,
}: {
  profile?: ProviderProfile;
  onSave: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [error, setError] = useState("");
  return (
    <Form
      navigationTitle={profile ? "Edit Provider" : "Create Provider"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Provider"
            onSubmit={async (v: {
              title: string;
              kind: ProviderProfile["kind"];
              baseUrl: string;
              model: string;
              key: string;
              keyEnv: string;
              images: boolean;
              reasoning: boolean;
              webSearch: boolean;
              tools: boolean;
            }) => {
              try {
                await saveProvider(
                  {
                    id: profile?.id || randomUUID(),
                    title: v.title,
                    kind: v.kind,
                    baseUrl: v.baseUrl,
                    defaultModel: v.model,
                    keyEnv: v.keyEnv.trim() || undefined,
                    capabilities: {
                      images: v.images,
                      reasoning: v.reasoning,
                      webSearch: v.webSearch,
                      tools: v.tools,
                    },
                    updatedAt: Date.now(),
                  },
                  v.key || undefined,
                );
                await onSave();
                pop();
              } catch (e) {
                setError(String(e));
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Name"
        defaultValue={profile?.title}
        error={error || undefined}
      />
      <Form.Dropdown
        id="kind"
        title="API Protocol"
        defaultValue={profile?.kind || "chat-completions"}
      >
        <Form.Dropdown.Item
          value="chat-completions"
          title="OpenAI Chat Completions"
        />
        <Form.Dropdown.Item value="responses" title="OpenAI Responses" />
        <Form.Dropdown.Item value="anthropic" title="Anthropic Messages" />
      </Form.Dropdown>
      <Form.TextField
        id="baseUrl"
        title="API Base URL"
        defaultValue={profile?.baseUrl}
        placeholder="https://api.example.com/v1"
      />
      <Form.TextField
        id="model"
        title="Fallback Model ID"
        defaultValue={profile?.defaultModel}
      />
      <Form.PasswordField
        id="key"
        title="API Key"
        placeholder={
          profile ? "Leave blank to keep the current key" : "Optional"
        }
      />
      <Form.TextField
        id="keyEnv"
        title="Key Environment Variable"
        defaultValue={profile?.keyEnv}
        placeholder="Optional; takes precedence over the saved key"
      />
      <Form.Checkbox
        id="images"
        label="Provider accepts images"
        defaultValue={profile?.capabilities.images || false}
      />
      <Form.Checkbox
        id="reasoning"
        label="Provider accepts reasoning effort controls"
        defaultValue={profile?.capabilities.reasoning || false}
      />
      <Form.Checkbox
        id="webSearch"
        label="Provider supports web search for this protocol"
        defaultValue={profile?.capabilities.webSearch || false}
      />
      <Form.Checkbox
        id="tools"
        label="Provider supports function/tool calling"
        defaultValue={profile?.capabilities.tools || false}
      />
      <Form.Description text="Enable capabilities supported by the chosen provider and model. Saved keys remain in device-local Raycast storage and are excluded from exports and folder sync. Use environment variables if you prefer not to save a key." />
    </Form>
  );
}
export default function ProviderSettings() {
  const { push } = useNavigation();
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]),
    [active, setActive] = useState("");
  async function refresh() {
    const [p, a] = await Promise.all([getProviders(), activeProviderId()]);
    setProfiles(p);
    setActive(a);
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <List navigationTitle="Provider Profiles">
      {profiles.map((p) => (
        <List.Item
          key={p.id}
          title={p.title}
          subtitle={`${p.kind} · ${p.baseUrl}`}
          icon={p.id === active ? Icon.CheckCircle : Icon.Network}
          actions={
            <ActionPanel>
              <Action
                title="Use for New Chats"
                icon={Icon.CheckCircle}
                onAction={async () => {
                  await setActiveProvider(p.id);
                  await refresh();
                }}
              />
              <Action
                title="Create Provider"
                icon={Icon.Plus}
                onAction={() => push(<Editor onSave={refresh} />)}
              />
              {!["managed", "preferences"].includes(p.id) && (
                <>
                  <Action
                    title="Edit Provider"
                    icon={Icon.Pencil}
                    onAction={() =>
                      push(<Editor profile={p} onSave={refresh} />)
                    }
                  />
                  <Action
                    title="Delete Provider"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={async () => {
                      if (
                        await confirmAlert({
                          title: `Delete ${p.title}?`,
                          message:
                            "Its local key will also be removed. Conversations stay saved.",
                          primaryAction: { title: "Delete" },
                        })
                      ) {
                        await removeProvider(p);
                        await refresh();
                      }
                    }}
                  />
                </>
              )}
              <Action.CopyToClipboard title="Copy Provider ID" content={p.id} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
