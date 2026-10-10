import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Form,
  Icon,
  Keyboard,
  LaunchProps,
  List,
  LocalStorage,
  openExtensionPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { ChatView } from "./chat-view";
import { Compose } from "./compose";
import PromptLibrary from "./prompts";
import Models from "./models";
import ChatMockSetup from "./setup-chatmock";
import Organize from "./organize";
import Tools from "./tools";
import DataManagement, { autoSync } from "./data-management";
import { MANAGED_KEY, SETUP_DISMISSED_KEY } from "./chatmock";
import {
  clearHistory,
  Conversation,
  conversationMarkdown,
  deleteConversation,
  getConversations,
  getProjects,
  historyEnabled,
  restoreConversation,
  saveConversation,
} from "./storage";
import { Project, branchConversation } from "./domain";
function Rename({
  chat,
  onSave,
}: {
  chat: Conversation;
  onSave: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [error, setError] = useState("");
  return (
    <Form
      navigationTitle="Rename Conversation"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Title"
            onSubmit={async (v: { title: string }) => {
              if (!v.title.trim()) {
                setError("Enter a title.");
                return;
              }
              await saveConversation({
                ...chat,
                title: v.title.trim(),
                updatedAt: Date.now(),
              });
              await onSave();
              pop();
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
    </Form>
  );
}
export default function Command(
  props: LaunchProps<{ launchContext: { conversationId?: string } }>,
) {
  const { push } = useNavigation();
  const [chats, setChats] = useState<Conversation[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [loading, setLoading] = useState(true),
    [needsSetup, setNeedsSetup] = useState<boolean>(),
    [filter, setFilter] = useState("all");
  async function refresh() {
    try {
      const [c, p] = await Promise.all([getConversations(true), getProjects()]);
      setChats(c);
      setProjects(p);
    } catch (e) {
      await showToast({
        title: "Could not load workspace",
        message: String(e),
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await autoSync();
      } catch (e) {
        await showToast({
          title: "Folder sync needs attention",
          message: String(e),
        });
      }
      if (!active) return;
      await refresh();
      const [enabled, dismissed, profile] = await Promise.all([
        LocalStorage.getItem<boolean>(MANAGED_KEY),
        LocalStorage.getItem<boolean>(SETUP_DISMISSED_KEY),
        LocalStorage.getItem<string>("relay-active-provider"),
      ]);
      if (active) setNeedsSetup(!enabled && !dismissed && !profile);
      const id = props.launchContext?.conversationId;
      if (id && active) {
        const chat = (await getConversations()).find((c) => c.id === id);
        if (chat)
          push(
            <ChatView conversation={chat} model={chat.model} />,
            () => void refresh(),
          );
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const globalActions = (
    <ActionPanel.Section title="Workspace">
      <Action
        title="New Conversation"
        icon={Icon.Plus}
        shortcut={Keyboard.Shortcut.Common.New}
        onAction={() => push(<Compose />, () => void refresh())}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={refresh}
      />
      <Action
        title="Open Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
      <Action
        title="Clear All History Permanently"
        style={Action.Style.Destructive}
        icon={Icon.Trash}
        onAction={async () => {
          if (
            await confirmAlert({
              title: "Permanently clear all conversation history?",
              message:
                "Includes pinned, archived and deleted chats, plus saved drafts. Synced copies may restore data unless you also clear or disconnect the sync folder.",
              primaryAction: {
                title: "Clear History",
                style: Alert.ActionStyle.Destructive,
              },
            })
          ) {
            await clearHistory();
            await refresh();
          }
        }}
      />
    </ActionPanel.Section>
  );
  const visible = chats.filter((c) =>
    filter === "trash"
      ? Boolean(c.deletedAt)
      : !c.deletedAt &&
        (filter === "archive" ? c.archived : !c.archived) &&
        (filter === "pinned"
          ? c.pinned
          : filter.startsWith("project:")
            ? c.projectId === filter.slice(8)
            : filter.startsWith("tag:")
              ? c.tags?.includes(filter.slice(4))
              : true),
  );
  if (needsSetup === undefined)
    return <List isLoading navigationTitle="Relay AI" />;
  if (needsSetup)
    return <ChatMockSetup onUseCustomApi={() => setNeedsSetup(false)} />;
  const shortcuts = [
    {
      title: "New Conversation",
      subtitle: "Type and reply with your transcript visible",
      icon: Icon.Plus,
      view: <Compose />,
    },
    {
      title: "Prompt Library",
      subtitle: "Presets, variables, selections and clipboard",
      icon: Icon.Book,
      view: <PromptLibrary />,
    },
    {
      title: "Models & Providers",
      subtitle: "Models, favorites and API profiles",
      icon: Icon.Stars,
      view: <Models />,
    },
    {
      title: "Projects & Agents",
      subtitle: "Shared instructions and saved tool presets",
      icon: Icon.Folder,
      view: <Organize />,
    },
    {
      title: "MCP Connections",
      subtitle: "Connect tools with per-call approval",
      icon: Icon.Network,
      view: <Tools />,
    },
    {
      title: "Backup, Restore & Sync",
      subtitle: "Portable JSON and synced-folder exchange",
      icon: Icon.Download,
      view: <DataManagement />,
    },
    {
      title: "Set Up ChatMock",
      subtitle: "Install, connect, repair and restart",
      icon: Icon.Gear,
      view: <ChatMockSetup />,
    },
  ];
  return (
    <List
      navigationTitle="Relay AI"
      isLoading={loading}
      searchBarPlaceholder="Search titles, messages or tags…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Conversation collection"
          value={filter}
          onChange={setFilter}
        >
          {[
            { value: "all", title: "Recent" },
            { value: "pinned", title: "Pinned" },
            { value: "archive", title: "Archived" },
            { value: "trash", title: "Recently Deleted" },
            ...projects.map((p) => ({
              value: "project:" + p.id,
              title: p.title,
            })),
            ...[...new Set(chats.flatMap((c) => c.tags || []))].map((t) => ({
              value: "tag:" + t,
              title: "#" + t,
            })),
          ].map((item) => (
            <List.Dropdown.Item
              key={item.value}
              value={item.value}
              title={item.title}
            />
          ))}
        </List.Dropdown>
      }
    >
      <List.Section title="Workspace">
        {shortcuts.map((s) => (
          <List.Item
            key={s.title}
            title={s.title}
            subtitle={s.subtitle}
            icon={s.icon}
            actions={
              <ActionPanel>
                <Action
                  title={s.title}
                  onAction={() => push(s.view, () => void refresh())}
                />
                {globalActions}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section
        title={
          filter === "trash"
            ? "Recently Deleted"
            : filter === "archive"
              ? "Archived"
              : "Conversations"
        }
      >
        {visible.map((chat) => (
          <List.Item
            key={chat.id}
            title={chat.title}
            subtitle={chat.model}
            keywords={[
              ...chat.messages.map((m) => m.content),
              ...(chat.tags || []),
            ]}
            icon={
              chat.deletedAt
                ? Icon.Trash
                : chat.pinned
                  ? Icon.Pin
                  : Icon.Message
            }
            accessories={[
              {
                text: `${chat.messages.filter((m) => m.role === "user").length} turns`,
              },
              { date: new Date(chat.updatedAt) },
            ]}
            actions={
              <ActionPanel>
                {chat.deletedAt ? (
                  <Action
                    title="Restore Conversation"
                    icon={Icon.ArrowCounterClockwise}
                    onAction={async () => {
                      await restoreConversation(chat.id);
                      await refresh();
                    }}
                  />
                ) : (
                  <>
                    <Action
                      title="Open Conversation"
                      icon={Icon.Message}
                      onAction={() =>
                        push(
                          <ChatView conversation={chat} model={chat.model} />,
                          () => void refresh(),
                        )
                      }
                    />
                    {historyEnabled() && (
                      <>
                        <Action
                          title={chat.pinned ? "Unpin" : "Pin"}
                          icon={Icon.Pin}
                          onAction={async () => {
                            await saveConversation({
                              ...chat,
                              pinned: !chat.pinned,
                              updatedAt: Date.now(),
                            });
                            await refresh();
                          }}
                        />
                        <Action
                          title="Rename"
                          icon={Icon.Pencil}
                          onAction={() =>
                            push(<Rename chat={chat} onSave={refresh} />)
                          }
                        />
                        <Action
                          title={
                            chat.archived
                              ? "Move to Recent"
                              : "Archive Conversation"
                          }
                          icon={Icon.Folder}
                          onAction={async () => {
                            await saveConversation({
                              ...chat,
                              archived: !chat.archived,
                              updatedAt: Date.now(),
                            });
                            await refresh();
                          }}
                        />
                      </>
                    )}
                    <Action
                      title="Branch Conversation"
                      icon={Icon.CopyClipboard}
                      onAction={async () => {
                        const branch = branchConversation(chat);
                        await saveConversation(branch);
                        push(
                          <ChatView
                            conversation={branch}
                            model={branch.model}
                          />,
                          () => void refresh(),
                        );
                      }}
                    />
                    <Action
                      title="Move to Recently Deleted"
                      style={Action.Style.Destructive}
                      icon={Icon.Trash}
                      onAction={async () => {
                        if (
                          await confirmAlert({
                            title: `Delete ${chat.title}?`,
                            message:
                              "You can restore it from Recently Deleted.",
                            primaryAction: { title: "Delete" },
                          })
                        ) {
                          await deleteConversation(chat.id);
                          await refresh();
                        }
                      }}
                    />
                  </>
                )}
                <Action.CopyToClipboard
                  title="Copy as Markdown"
                  content={conversationMarkdown(chat)}
                />
                <Action.CopyToClipboard
                  title="Copy Conversation Quicklink"
                  content={`raycast://extensions/jonathan-geva/relay-ai/chat?launchContext=${encodeURIComponent(JSON.stringify({ conversationId: chat.id }))}`}
                />
                {globalActions}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {!visible.length && (
        <List.Section title="Your Work">
          <List.Item
            title={
              historyEnabled()
                ? "Start a conversation or choose another collection"
                : "History is off"
            }
            icon={Icon.Message}
            actions={<ActionPanel>{globalActions}</ActionPanel>}
          />
        </List.Section>
      )}
    </List>
  );
}
