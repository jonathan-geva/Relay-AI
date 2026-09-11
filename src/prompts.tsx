import {
  Action,
  ActionPanel,
  Alert,
  Color,
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
import { Compose } from "./compose";
import { deletePrompt, getPrompts, Prompt, savePrompt } from "./storage";

const builtins: Prompt[] = [
  {
    id: "summarize",
    title: "Find the Essentials",
    description: "A short summary, key points, and next steps",
    category: "Understand",
    instruction:
      "Summarize the supplied text. Use a short overview, key points, and actionable next steps if relevant. Stay faithful to the source; flag missing information.",
  },
  {
    id: "explain",
    title: "Explain Simply",
    description: "Clear explanations with a concrete example",
    category: "Understand",
    instruction:
      "Explain the supplied material in plain language. Define unfamiliar terms and give a useful example. Preserve nuance and state uncertainty.",
  },
  {
    id: "actions",
    title: "Extract Action Items",
    description: "Turn meeting notes into a practical checklist",
    category: "Understand",
    instruction:
      "Extract action items from these notes as a checklist. Include owners and deadlines only where explicitly given; otherwise label them unassigned or unspecified. Separate decisions and open questions.",
  },
  {
    id: "polish",
    title: "Polish Writing",
    description: "Clearer wording that still sounds like you",
    category: "Write",
    instruction:
      "Improve grammar, flow, and clarity while preserving meaning, language, and voice. Return only the revised text.",
  },
  {
    id: "shorten",
    title: "Make It Concise",
    description: "Cut repetition while keeping what matters",
    category: "Write",
    instruction:
      "Make this text concise without losing essential facts or intent. Preserve the original language and tone. Return only the revised text.",
  },
  {
    id: "reply",
    title: "Draft a Thoughtful Reply",
    description: "A professional response you can review and paste",
    category: "Write",
    instruction:
      "Draft a clear, friendly, professional reply to this message. Do not invent personal details, commitments, or availability. Use placeholders where needed. Return only the draft.",
  },
  {
    id: "translate",
    title: "Translate Text",
    description: "Specify a target language alongside your text",
    category: "Write",
    instruction:
      "Translate the supplied text into the target language specified by the user. Preserve tone, formatting, and meaning. If no target language is specified, ask for it before translating.",
  },
  {
    id: "review",
    title: "Review Code",
    description: "Find concrete bugs and suggest focused fixes",
    category: "Build",
    instruction:
      "Review the supplied code for correctness, security, and maintainability. Prioritize concrete bugs with severity, explain their impact, and suggest focused fixes. State assumptions. Do not claim to have run the code.",
  },
  {
    id: "debug",
    title: "Debug an Error",
    description: "Understand the cause and choose the next step",
    category: "Build",
    instruction:
      "Help diagnose this error using the supplied code and context. Explain likely causes, distinguish evidence from guesses, and give ordered troubleshooting steps. Ask for essential missing details.",
  },
  {
    id: "brainstorm",
    title: "Explore Possibilities",
    description: "Five distinct ideas with useful trade-offs",
    category: "Think",
    instruction:
      "Generate five distinct, practical ideas for the supplied goal. For each, give the approach, main benefit, trade-off, and first step. Respect all supplied constraints.",
  },
];
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
                        onAction={() =>
                          push(
                            <Compose
                              instruction={p.instruction}
                              title={p.title}
                            />,
                          )
                        }
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
                            push(
                              <Compose
                                instruction={p.instruction}
                                title={p.title}
                                initialText={text}
                              />,
                            );
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
