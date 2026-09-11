import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Form,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { ChatView } from "./chat-view";
import { Compose } from "./compose";
import PromptLibrary from "./prompts";
import Models from "./models";
import ChatMockSetup from "./setup-chatmock";
import {
  clearHistory,
  Conversation,
  conversationMarkdown,
  deleteConversation,
  getConversations,
  historyEnabled,
  saveConversation,
} from "./storage";
function Rename({
  chat,
  onSave,
}: {
  chat: Conversation;
  onSave: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string>();
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
              await saveConversation({ ...chat, title: v.title.trim() });
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
        error={error}
        defaultValue={chat.title}
      />
    </Form>
  );
}
export default function Command() {
  const { push } = useNavigation();
  const [chats, setChats] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  async function refresh() {
    try {
      setChats(await getConversations());
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not load history",
        message: String(e),
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
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
        title="Refresh History"
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
        title="Clear Conversation History"
        icon={Icon.Trash}
        style={Action.Style.Destructive}
        onAction={async () => {
          if (
            await confirmAlert({
              title: "Clear all conversation history?",
              message:
                "This removes Relay conversations saved on this device, including pinned conversations.",
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
  const visible = chats.filter((c) => filter !== "pinned" || c.pinned);
  return (
    <List
      navigationTitle="Relay AI"
      isLoading={loading}
      searchBarPlaceholder="Search conversations, prompts, or actions…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Show conversations"
          value={filter}
          onChange={setFilter}
        >
          <List.Dropdown.Item title="All Conversations" value="all" />
          <List.Dropdown.Item title="Pinned Only" value="pinned" />
        </List.Dropdown>
      }
    >
      <List.Section
        title="Your Workspace"
        subtitle="Think clearly. Make progress."
      >
        <List.Item
          title="Set Up ChatMock"
          subtitle="Automatic install, sign-in, and local connection"
          icon={{ source: Icon.Download, tintColor: Color.Green }}
          actions={
            <ActionPanel>
              <Action
                title="Set up ChatMock"
                icon={Icon.Stars}
                onAction={() => push(<ChatMockSetup />)}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="New Conversation"
          subtitle="Start with a question or an idea"
          icon={{ source: Icon.Plus, tintColor: Color.Blue }}
          actions={
            <ActionPanel>
              <Action
                title="Start Conversation"
                icon={Icon.Message}
                onAction={() => push(<Compose />, () => void refresh())}
              />
              {globalActions}
            </ActionPanel>
          }
        />
        <List.Item
          title="Prompt Library"
          subtitle="Write, summarize, translate, and build"
          icon={{ source: Icon.Book, tintColor: Color.Purple }}
          actions={
            <ActionPanel>
              <Action
                title="Browse Prompts"
                icon={Icon.Book}
                onAction={() => push(<PromptLibrary />, () => void refresh())}
              />
              {globalActions}
            </ActionPanel>
          }
        />
        <List.Item
          title="Models & Connection"
          subtitle="Choose the right model for your work"
          icon={{ source: Icon.Stars, tintColor: Color.Orange }}
          actions={
            <ActionPanel>
              <Action
                title="Browse Models"
                icon={Icon.Stars}
                onAction={() => push(<Models />)}
              />
              {globalActions}
            </ActionPanel>
          }
        />
      </List.Section>
      {!chats.length && (
        <List.Section title="Make Room for Your Ideas">
          <List.Item
            title={
              historyEnabled()
                ? "Your conversations will appear here"
                : "Conversation history is off"
            }
            subtitle={
              historyEnabled()
                ? "Start a chat, then return here to pick up where you left off"
                : "Enable history in preferences to save future chats"
            }
            icon={{ source: Icon.Clock, tintColor: Color.SecondaryText }}
            actions={<ActionPanel>{globalActions}</ActionPanel>}
          />
        </List.Section>
      )}
      {[true, false].map((pinned) => (
        <List.Section
          key={String(pinned)}
          title={pinned ? "Pinned" : "Recent Conversations"}
        >
          {visible
            .filter((c) => c.pinned === pinned)
            .map((chat) => (
              <List.Item
                key={chat.id}
                title={chat.title}
                subtitle={chat.model}
                keywords={chat.messages.map((m) => m.content)}
                icon={{
                  source: pinned ? Icon.Pin : Icon.Message,
                  tintColor: pinned ? Color.Yellow : Color.Blue,
                }}
                accessories={[
                  {
                    text: `${chat.messages.filter((m) => m.role === "user").length} turns`,
                  },
                  { date: new Date(chat.updatedAt) },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Continue Conversation"
                      icon={Icon.Message}
                      onAction={() =>
                        push(
                          <ChatView conversation={chat} model={chat.model} />,
                          () => void refresh(),
                        )
                      }
                    />
                    {historyEnabled() && (
                      <Action
                        title={
                          pinned ? "Unpin Conversation" : "Pin Conversation"
                        }
                        icon={Icon.Pin}
                        onAction={async () => {
                          await saveConversation({ ...chat, pinned: !pinned });
                          await refresh();
                        }}
                      />
                    )}
                    {historyEnabled() && (
                      <Action
                        title="Rename Conversation"
                        icon={Icon.Pencil}
                        onAction={() =>
                          push(<Rename chat={chat} onSave={refresh} />)
                        }
                      />
                    )}
                    <Action.CopyToClipboard
                      title="Copy as Markdown"
                      content={conversationMarkdown(chat)}
                    />
                    <Action
                      title="Delete Conversation"
                      style={Action.Style.Destructive}
                      icon={Icon.Trash}
                      onAction={async () => {
                        if (
                          await confirmAlert({
                            title: "Delete this conversation?",
                            message: chat.title,
                            primaryAction: {
                              title: "Delete",
                              style: Alert.ActionStyle.Destructive,
                            },
                          })
                        ) {
                          await deleteConversation(chat.id);
                          await refresh();
                        }
                      }}
                    />
                    {globalActions}
                  </ActionPanel>
                }
              />
            ))}
        </List.Section>
      ))}
    </List>
  );
}
