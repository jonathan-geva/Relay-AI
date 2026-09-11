import { Detail, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { ChatMessage, complete, getDefaultModel } from "./api";

export default function Command(props: { arguments: { prompt: string } }) {
  const prompt = props.arguments.prompt;
  const [markdown, setMarkdown] = useState("_Thinking…_");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const model = await getDefaultModel();
        const messages: ChatMessage[] = [{ role: "user", content: prompt }];
        const answer = await complete(messages, model, setMarkdown);
        setMarkdown(answer || "_No text returned._");
      } catch (error) {
        setMarkdown("### Request failed\n\nOpen ChatMock and make sure the local server is running.");
        await showToast({
          style: Toast.Style.Failure,
          title: "AI request failed",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [prompt]);

  return <Detail isLoading={loading} navigationTitle="Quick Ask" markdown={markdown} />;
}
