import { Action, ActionPanel, Detail, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { ChatMessage, complete } from "./api";

function renderConversation(messages: ChatMessage[]) {
  const visible = messages.filter((m) => m.role !== "system");
  if (!visible.length) return "";

  return visible
    .map((message) => {
      if (message.role === "user") {
        return `### You\n\n${message.content}`;
      }
      return `### AI\n\n${message.content || "_Thinking…_"}`;
    })
    .join("\n\n---\n\n");
}

function FollowUpForm({ onSubmit }: { onSubmit: (prompt: string) => Promise<void> }) {
  const { pop } = useNavigation();
  const [sending, setSending] = useState(false);

  return (
    <Form
      isLoading={sending}
      navigationTitle="Follow Up"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Send"
            icon={Icon.ArrowRight}
            onSubmit={async (values: { prompt: string }) => {
              const prompt = values.prompt?.trim();
              if (!prompt) return;
              setSending(true);
              pop();
              await onSubmit(prompt);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea id="prompt" title="Message" placeholder="Ask a follow-up…" autoFocus />
    </Form>
  );
}

export function ChatView({ initialPrompt, model }: { initialPrompt: string; model: string }) {
  const { push } = useNavigation();
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "user", content: initialPrompt }]);
  const [loading, setLoading] = useState(true);

  async function sendFrom(baseMessages: ChatMessage[], prompt?: string) {
    const nextBase = prompt ? [...baseMessages, { role: "user", content: prompt } as ChatMessage] : baseMessages;
    const pending = [...nextBase, { role: "assistant", content: "" } as ChatMessage];
    setMessages(pending);
    setLoading(true);

    try {
      const answer = await complete(nextBase, model, (full) => {
        setMessages([...nextBase, { role: "assistant", content: full }]);
      });
      setMessages([...nextBase, { role: "assistant", content: answer || "_No text returned._" }]);
    } catch (error) {
      setMessages(nextBase);
      await showToast({
        style: Toast.Style.Failure,
        title: "AI request failed",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void sendFrom([{ role: "user", content: initialPrompt }]);
    // The initial prompt should only run once for this pushed chat view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";

  return (
    <Detail
      navigationTitle={`${model} · AI Chat`}
      isLoading={loading}
      markdown={renderConversation(messages)}
      actions={
        <ActionPanel>
          <Action
            title="Follow Up"
            icon={Icon.Message}
            onAction={() => push(<FollowUpForm onSubmit={(prompt) => sendFrom(messages, prompt)} />)}
          />
          {lastAssistant ? <Action.CopyToClipboard title="Copy Last Response" content={lastAssistant} /> : null}
          {lastAssistant ? <Action.Paste title="Paste Last Response" content={lastAssistant} /> : null}
        </ActionPanel>
      }
    />
  );
}
