import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  Icon,
  Keyboard,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { ChatMessage, complete } from "./api";
import {
  Conversation,
  conversationMarkdown,
  historyEnabled,
  newConversation,
  saveConversation,
} from "./storage";

function FollowUpForm({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string>();
  return (
    <Form
      navigationTitle="Continue Conversation"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send Message"
            icon={Icon.ArrowRight}
            onSubmit={(v: { prompt: string }) => {
              if (!v.prompt.trim()) {
                setError("Enter a message to continue.");
                return;
              }
              pop();
              onSubmit(v.prompt.trim());
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="prompt"
        title="Message"
        placeholder="Ask a follow-up, explore an idea, or refine the answer…"
        error={error}
        onChange={() => setError(undefined)}
        autoFocus
      />
    </Form>
  );
}

export function ChatView({
  initialPrompt = "",
  model,
  conversation,
  initialTitle,
}: {
  initialPrompt?: string;
  model: string;
  conversation?: Conversation;
  initialTitle?: string;
}) {
  const { push } = useNavigation();
  const [chat, setChat] = useState<Conversation>(() => {
    const fresh = conversation || newConversation(initialPrompt, model);
    return initialTitle && !conversation
      ? { ...fresh, title: initialTitle }
      : fresh;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [stopped, setStopped] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const current = useRef(chat);
  function update(next: Conversation) {
    current.current = next;
    if (mounted.current) setChat(next);
  }
  async function persist(next: Conversation) {
    try {
      await saveConversation(next);
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not save conversation",
        message: "Copy the response to keep it.",
      });
    }
  }
  async function send(base: ChatMessage[]) {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(undefined);
    setStopped(false);
    const start = { ...current.current, messages: base, updatedAt: Date.now() };
    update(start);
    let partial = "";
    try {
      const answer = await complete(
        base,
        model,
        (text) => {
          partial = text;
          update({
            ...start,
            messages: [...base, { role: "assistant", content: text }],
          });
        },
        request.signal,
      );
      if (!answer.trim())
        throw new Error(
          "The model returned no text. Retry or choose another model.",
        );
      const finished = { ...current.current, updatedAt: Date.now() };
      update(finished);
      await persist(finished);
    } catch (e) {
      if (request.signal.aborted) {
        if (mounted.current) setStopped(true);
      } else if (mounted.current)
        setError(e instanceof Error ? e.message : String(e));
      const saved = {
        ...start,
        messages: partial
          ? [...base, { role: "assistant" as const, content: partial }]
          : base,
      };
      update(saved);
      await persist(saved);
    } finally {
      controller.current = null;
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (!conversation) void send(current.current.messages);
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
    // Each view owns a single conversation and cancels its request on navigation.
  }, []);
  const answer = [...chat.messages]
    .reverse()
    .find((m) => m.role === "assistant")?.content;
  const retryBase =
    chat.messages.at(-1)?.role === "assistant"
      ? chat.messages.slice(0, -1)
      : chat.messages;
  const body = chat.messages
    .filter((m) => m.role !== "system")
    .map((m) => `### ${m.role === "user" ? "You" : "Relay"}\n\n${m.content}`)
    .join("\n\n---\n\n");
  return (
    <Detail
      navigationTitle={chat.title}
      isLoading={loading}
      markdown={`${body}${loading ? "\n\n_Responding…_" : ""}${stopped ? "\n\n_Response stopped. You can retry or continue._" : ""}${error ? `\n\n---\n\n### Could not complete response\n\n${error}\n\nCheck your endpoint and model in extension preferences, then retry.` : ""}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Model" text={model} icon={Icon.Stars} />
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item
              text={
                loading
                  ? "Responding"
                  : error
                    ? "Needs attention"
                    : stopped
                      ? "Stopped"
                      : "Ready"
              }
              color={error ? Color.Orange : Color.Green}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label
            title="Messages"
            text={String(chat.messages.length)}
          />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="History"
            text={historyEnabled() ? "Local saving enabled" : "Not saved"}
            icon={Icon.Shield}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Conversation">
            {loading ? (
              <Action
                title="Stop Response"
                icon={Icon.Stop}
                onAction={() => controller.current?.abort()}
              />
            ) : (
              <>
                <Action
                  title="Continue Conversation"
                  icon={Icon.Message}
                  onAction={() =>
                    push(
                      <FollowUpForm
                        onSubmit={(prompt) =>
                          void send([
                            ...chat.messages,
                            { role: "user", content: prompt },
                          ])
                        }
                      />,
                    )
                  }
                />
                <Action
                  title={error ? "Retry Request" : "Regenerate Response"}
                  icon={Icon.ArrowClockwise}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  onAction={() => void send(retryBase)}
                />
              </>
            )}
          </ActionPanel.Section>
          {answer && (
            <ActionPanel.Section title="Use Response">
              <Action.CopyToClipboard
                title="Copy Response"
                content={answer}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
              <Action.Paste title="Paste Response" content={answer} />
            </ActionPanel.Section>
          )}
          <ActionPanel.Section title="Keep">
            <Action.CopyToClipboard
              title="Copy Conversation as Markdown"
              content={conversationMarkdown(chat)}
            />
            {!loading && historyEnabled() && (
              <Action
                title={chat.pinned ? "Unpin Conversation" : "Pin Conversation"}
                icon={Icon.Pin}
                onAction={async () => {
                  const next = { ...chat, pinned: !chat.pinned };
                  update(next);
                  await persist(next);
                }}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
