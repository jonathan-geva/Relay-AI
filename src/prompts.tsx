import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Clipboard,
  confirmAlert,
  Form,
  getSelectedText,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { randomUUID } from "node:crypto";
import { deletePrompt, getPrompts, Prompt, savePrompt } from "./storage";
import { builtins } from "./builtin-prompts";
import { PromptRun, promptDeeplink } from "./prompt-run";
import { sharePrompt } from "./data-management";

const icons: Record<string, Icon> = {
  Understand: Icon.Book,
  Write: Icon.Pencil,
  Build: Icon.Terminal,
  Think: Icon.LightBulb,
  Custom: Icon.Stars,
};
function PromptEditor({
  prompt,
  saved,
}: {
  prompt?: Prompt;
  saved: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string>();
  return (
    <Form
      navigationTitle={prompt ? "Edit Prompt" : "Create a Prompt"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Prompt"
            icon={Icon.CheckCircle}
            onSubmit={async (v: {
              title: string;
              description: string;
              instruction: string;
              model: string;
              providerId: string;
            }) => {
              if (!v.title.trim() || !v.instruction.trim()) {
                setError("A title and instructions are required.");
                return;
              }
              try {
                await savePrompt({
                  id: prompt?.id || randomUUID(),
                  category: "Custom",
                  title: v.title.trim(),
                  description: v.description.trim(),
                  instruction: v.instruction.trim(),
                  model: v.model.trim() || undefined,
                  providerId: v.providerId.trim() || undefined,
                });
                await saved();
                pop();
              } catch (e) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Could not save prompt",
                  message: String(e),
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Name"
        defaultValue={prompt?.title}
        placeholder="e.g. Write a release note"
        error={error}
      />
      <Form.TextField
        id="description"
        title="Description"
        defaultValue={prompt?.description}
        placeholder="What does this prompt help you do?"
      />
      <Form.TextArea
        id="instruction"
        title="Instructions"
        defaultValue={prompt?.instruction}
        placeholder="Describe how Relay should respond. Your input text will be added below these instructions."
      />
      <Form.Description text="Reusable instructions, fresh context each time. You can review or edit your input before sending." />
      <Form.TextField
        id="model"
        title="Preset Model (optional)"
        defaultValue={prompt?.model}
      />
      <Form.TextField
        id="providerId"
        title="Provider ID (optional)"
        defaultValue={prompt?.providerId}
        placeholder="managed, preferences, or a saved profile ID"
      />
      <Form.Description text="Use variables such as {{language}}, {{tone}}, {{audience}}, {{input}} or {{selectedText}}. {{date}} is filled automatically. Preset instructions remain active for follow-ups." />
    </Form>
  );
}
export default function PromptLibrary() {
  const { push } = useNavigation();
  const [custom, setCustom] = useState<Prompt[]>([]);
  const [category, setCategory] = useState("All");
  async function refresh() {
    try {
      setCustom(await getPrompts());
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not load prompts",
        message: String(e),
      });
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const create = (
    <Action
      title="Create Custom Prompt"
      icon={Icon.Plus}
      shortcut={Keyboard.Shortcut.Common.New}
      onAction={() => push(<PromptEditor saved={refresh} />)}
    />
  );
  return (
    <List
      navigationTitle="Prompt Library"
      isShowingDetail
      searchBarPlaceholder="Find a prompt for your next task…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Category"
          value={category}
          onChange={setCategory}
        >
          {["All", ...Object.keys(icons)].map((c) => (
            <List.Dropdown.Item key={c} title={c} value={c} />
          ))}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        title="Make it your own"
        description="Create a reusable prompt for the work you do most."
        icon={Icon.Book}
        actions={<ActionPanel>{create}</ActionPanel>}
      />
      {Object.keys(icons)
        .filter((c) => category === "All" || c === category)
        .map((c) => (
          <List.Section key={c} title={c}>
            {[...builtins, ...custom]
              .filter((p) => p.category === c)
              .map((p) => (
                <List.Item
                  key={p.id}
                  title={p.title}
                  icon={{
                    source: icons[c],
                    tintColor: c === "Custom" ? Color.Orange : Color.Purple,
                  }}
                  keywords={[p.description, c]}
                  detail={
                    <List.Item.Detail
                      markdown={`# ${p.title}\n\n${p.description}\n\n---\n\n### Instructions\n\n${p.instruction}\n\n### How to use\n\nPress **Enter** to add your text and choose a model. Or use **Use Selected Text** to bring in your current selection.`}
                      metadata={
                        <List.Item.Detail.Metadata>
                          <List.Item.Detail.Metadata.Label
                            title="Category"
                            text={c}
                          />
                          <List.Item.Detail.Metadata.Label
                            title="Input"
                            text="Text you provide"
                          />
                          <List.Item.Detail.Metadata.Label
                            title="Output"
                            text="Editable conversation"
                          />
                        </List.Item.Detail.Metadata>
                      }
                    />
                  }
                  actions={
                    <ActionPanel>
                      <Action
                        title="Use Prompt"
                        icon={Icon.ArrowRight}
                        onAction={() => push(<PromptRun prompt={p} />)}
                      />
                      <Action
                        title="Use Selected Text"
                        icon={Icon.Text}
                        onAction={async () => {
                          try {
                            const text = await getSelectedText();
                            if (!text.trim())
                              throw new Error(
                                "Select text in another app first.",
                              );
                            push(<PromptRun prompt={p} initialText={text} />);
                          } catch (e) {
                            await showToast({
                              style: Toast.Style.Failure,
                              title: "Could not read selection",
                              message: String(e),
                            });
                          }
                        }}
                      />
                      <ActionPanel.Section title="Library">
                        <Action
                          title="Use Clipboard Text"
                          icon={Icon.Clipboard}
                          onAction={async () =>
                            push(
                              <PromptRun
                                prompt={p}
                                initialText={(await Clipboard.readText()) || ""}
                              />,
                            )
                          }
                        />
                        <Action.CopyToClipboard
                          title="Copy Prompt Quicklink"
                          content={promptDeeplink(p.id)}
                        />
                        <Action
                          title="Export Prompt as JSON"
                          icon={Icon.Download}
                          onAction={() => sharePrompt(p)}
                        />
                        {create}
                        <Action
                          title="Duplicate Prompt"
                          icon={Icon.CopyClipboard}
                          onAction={() =>
                            push(
                              <PromptEditor
                                prompt={{
                                  ...p,
                                  id: randomUUID(),
                                  title: `${p.title} (copy)`,
                                }}
                                saved={refresh}
                              />,
                            )
                          }
                        />
                        {c === "Custom" && (
                          <>
                            <Action
                              title="Edit Prompt"
                              icon={Icon.Pencil}
                              onAction={() =>
                                push(
                                  <PromptEditor prompt={p} saved={refresh} />,
                                )
                              }
                            />
                            <Action
                              title="Delete Prompt"
                              icon={Icon.Trash}
                              style={Action.Style.Destructive}
                              onAction={async () => {
                                if (
                                  await confirmAlert({
                                    title: `Delete ${p.title}?`,
                                    primaryAction: {
                                      title: "Delete",
                                      style: Alert.ActionStyle.Destructive,
                                    },
                                  })
                                ) {
                                  await deletePrompt(p.id);
                                  await refresh();
                                }
                              }}
                            />
                          </>
                        )}
                      </ActionPanel.Section>
                    </ActionPanel>
                  }
                />
              ))}
          </List.Section>
        ))}
    </List>
  );
}
