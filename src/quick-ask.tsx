import { Detail } from "@raycast/api";
import { useEffect, useState } from "react";
import { getDefaultModel } from "./api";
import { ChatView } from "./chat-view";
export default function Command({
  arguments: args,
}: {
  arguments: { prompt: string };
}) {
  const [model, setModel] = useState("");
  useEffect(() => {
    void getDefaultModel().then(setModel);
  }, []);
  return model ? (
    <ChatView initialPrompt={args.prompt} model={model} />
  ) : (
    <Detail isLoading markdown="Preparing Relay…" />
  );
}
