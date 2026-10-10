import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
  environment,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Attachment, Conversation, AgentPreset, Project } from "./domain";
import { getAgents, getProjects, conversationMarkdown } from "./storage";
import { getProviders } from "./providers";
import { ProviderProfile } from "./domain";
import { readAttachment } from "./attachments";
import { writeExport } from "./data-files";
export function AttachmentPicker({
  onAttach,
}: {
  onAttach: (files: Attachment[]) => void;
}) {
  const { pop } = useNavigation();
  const [files, setFiles] = useState<Attachment[]>([]),
    [error, setError] = useState("");
  async function load(paths: string[]) {
    try {
      const items = await Promise.all(
        paths
          .slice(0, 8)
          .map((p) =>
            readAttachment(p.startsWith("file:") ? fileURLToPath(p) : p),
          ),
      );
      if (items.reduce((n, f) => n + f.bytes, 0) > 15 * 1024 * 1024)
        throw new Error("Keep total attachments under 15 MB.");
      setFiles(items);
      setError("");
    } catch (e) {
      setError(String(e));
      setFiles([]);
    }
  }
  return (
    <Form
      navigationTitle="Preview Attachments"
      actions={
        <ActionPanel>
          <Action
            title="Attach Previewed Files"
            icon={Icon.Paperclip}
            onAction={() => {
              if (files.length) {
                onAttach(files);
                pop();
              }
            }}
          />
          <Action
            title="Read Screenshot or File from Clipboard"
            icon={Icon.Clipboard}
            onAction={async () => {
              const clipboard = await Clipboard.read();
              if (clipboard.file) await load([clipboard.file]);
              else
                setError(
                  "Copy an image file or save your screenshot and choose it below. Clipboard text can be inserted directly in chat.",
                );
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Choose text/code files or images, review their contents, then attach. They are sent only when you send a chat message. Text: 256 KB each. Images: 10 MB each. Up to eight files and 15 MB total." />
      <Form.FilePicker
        id="files"
        title="Files"
        allowMultipleSelection
        canChooseDirectories={false}
        onChange={(paths) => {
          void load(paths);
        }}
        error={error || undefined}
      />
      {files.map((f) => (
        <Form.Description
          key={f.id}
          title={f.name}
          text={
            f.text
              ? f.text.slice(0, 4000) +
                (f.text.length > 4000
                  ? "\n[Preview shortened; full text will be attached]"
                  : "")
              : `${f.mime} · ${Math.round(f.bytes / 1024)} KB · Preview appears in chat before sending.`
          }
        />
      ))}
    </Form>
  );
}
export function ChatSettings({
  chat,
  onSave,
}: {
  chat: Conversation;
  onSave: (chat: Conversation) => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [providers, setProviders] = useState<ProviderProfile[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [agents, setAgents] = useState<AgentPreset[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([getProviders(), getProjects(), getAgents()])
      .then(([p, j, a]) => {
        if (active) {
          setProviders(p);
          setProjects(j);
          setAgents(a);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Form
      navigationTitle="Chat Settings"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Apply Settings"
            onSubmit={async (v: {
              title: string;
              model: string;
              provider: string;
              instruction: string;
              project: string;
              agent: string;
              effort: string;
              webSearch: boolean;
              allowTools: boolean;
              budget: string;
              output: string;
              tags: string;
            }) => {
              try {
                if (!v.model.trim() || !v.title.trim())
                  throw new Error("A title and model are required.");
                const budget = Number(v.budget),
                  maxTokens = Number(v.output);
                if (
                  !Number.isFinite(budget) ||
                  budget < 1000 ||
                  budget > 1000000 ||
                  !Number.isInteger(maxTokens) ||
                  maxTokens < 256 ||
                  maxTokens > 128000
                )
                  throw new Error(
                    "Context budget: 1,000–1,000,000. Maximum output: 256–128,000.",
                  );
                const agent = agents.find((a) => a.id === v.agent);
                await onSave({
                  ...chat,
                  title: v.title.trim(),
                  model:
                    v.agent !== (chat.options?.agentId || "") && agent?.model
                      ? agent.model
                      : v.model.trim(),
                  providerId: v.provider,
                  instruction: v.instruction,
                  projectId: v.project || undefined,
                  tags: [
                    ...new Set(
                      v.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    ),
                  ],
                  options: {
                    reasoningEffort: v.effort || undefined,
                    webSearch: v.webSearch,
                    allowTools: v.allowTools,
                    agentId: v.agent || undefined,
                    contextBudget: budget,
                    maxTokens,
                  },
                  updatedAt: Date.now(),
                });
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
        title="Title"
        defaultValue={chat.title}
        error={error || undefined}
      />
      <Form.Dropdown
        id="provider"
        title="Provider"
        defaultValue={chat.providerId || "preferences"}
      >
        {providers.map((p) => (
          <Form.Dropdown.Item key={p.id} value={p.id} title={p.title} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="model" title="Model" defaultValue={chat.model} />
      <Form.TextArea
        id="instruction"
        title="Chat Instructions"
        defaultValue={chat.instruction || ""}
      />
      <Form.Dropdown
        id="project"
        title="Project"
        defaultValue={chat.projectId || ""}
      >
        <Form.Dropdown.Item value="" title="No Project" />
        {projects.map((p) => (
          <Form.Dropdown.Item key={p.id} value={p.id} title={p.title} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="agent"
        title="Agent"
        defaultValue={chat.options?.agentId || ""}
      >
        <Form.Dropdown.Item value="" title="Ask Anything" />
        {agents.map((a) => (
          <Form.Dropdown.Item key={a.id} value={a.id} title={a.title} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="tags"
        title="Tags"
        defaultValue={chat.tags?.join(", ") || ""}
        placeholder="Comma-separated tags"
      />
      <Form.Dropdown
        id="effort"
        title="Reasoning Effort"
        defaultValue={chat.options?.reasoningEffort || ""}
      >
        {[
          "",
          "none",
          "minimal",
          "low",
          "medium",
          "high",
          "xhigh",
          "max",
          "ultra",
        ].map((v) => (
          <Form.Dropdown.Item
            key={v}
            value={v}
            title={v || "Provider Default"}
          />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="webSearch"
        label="Allow provider web search"
        defaultValue={chat.options?.webSearch || false}
      />
      <Form.Checkbox
        id="allowTools"
        label="Allow MCP tools with confirmation for every call"
        defaultValue={chat.options?.allowTools || false}
      />
      <Form.TextField
        id="budget"
        title="Context Token Budget"
        defaultValue={String(chat.options?.contextBudget || 24000)}
      />
      <Form.TextField
        id="output"
        title="Maximum Output Tokens"
        defaultValue={String(chat.options?.maxTokens || 4096)}
      />
      <Form.Description text="Capabilities must also be enabled in the provider profile. Model support varies. Provider changes require confirmation before existing history is sent. Projects and agents add their instructions to each request." />
    </Form>
  );
}
export function ExportConversation({ chat }: { chat: Conversation }) {
  const [error, setError] = useState("");
  return (
    <Form
      navigationTitle="Save Conversation"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Export"
            onSubmit={async (v: { folder: string[]; format: string }) => {
              try {
                const folder =
                  v.folder[0] || join(environment.supportPath, "exports");
                const data =
                  v.format === "md"
                    ? conversationMarkdown(chat)
                    : JSON.stringify(
                        {
                          format: "relay-ai",
                          version: 2,
                          exportedAt: Date.now(),
                          conversations: [chat],
                          prompts: [],
                          projects: [],
                          agents: [],
                        },
                        null,
                        2,
                      );
                const path = await writeExport(
                  folder,
                  `relay-${chat.id}.${v.format}`,
                  data,
                );
                await showToast({
                  style: Toast.Style.Success,
                  title: "Conversation exported",
                  message: path,
                });
              } catch (e) {
                setError(String(e));
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="folder"
        title="Destination Folder"
        canChooseDirectories
        canChooseFiles={false}
        allowMultipleSelection={false}
        error={error || undefined}
      />
      <Form.Dropdown id="format" title="Format">
        <Form.Dropdown.Item value="md" title="Markdown" />
        <Form.Dropdown.Item value="json" title="Relay JSON (importable)" />
      </Form.Dropdown>
      <Form.Description text="Choose a folder, or use Relay's private exports folder. Exports include messages, attachments and thinking, but never provider keys." />
    </Form>
  );
}
