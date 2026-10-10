import { Detail } from "@raycast/api";
import { useEffect, useState } from "react";
import { getDefaultModel, friendlyError } from "./api";
import { ChatView } from "./chat-view";
export function Compose({
  instruction = "",
  title = "New Conversation",
  initialText = "",
  conversationTitle,
  model: preferredModel,
  providerId,
}: {
  instruction?: string;
  title?: string;
  initialText?: string;
  conversationTitle?: string;
  model?: string;
  providerId?: string;
}) {
  const [model, setModel] = useState(preferredModel || ""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!preferredModel)
      void getDefaultModel(providerId)
        .then((m) => {
          if (active) setModel(m);
        })
        .catch((e) => {
          if (active) setError(friendlyError(e));
        });
    return () => {
      active = false;
    };
  }, [preferredModel, providerId]);
  return model ? (
    <ChatView
      model={model}
      instruction={instruction}
      initialTitle={conversationTitle || (instruction ? title : undefined)}
      initialDraft={initialText}
      providerId={providerId}
    />
  ) : (
    <Detail isLoading={!error} markdown={error || "Preparing Relay…"} />
  );
}
