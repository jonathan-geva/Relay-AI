import { Clipboard, Detail } from "@raycast/api";
import { useEffect, useState } from "react";
import { Compose } from "./compose";
export default function Command() {
  const [text, setText] = useState<string>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Clipboard.readText()
      .then((value) => {
        if (active) {
          if (value?.trim()) setText(value);
          else setError("Copy some text first, then open this command again.");
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return text !== undefined ? (
    <Compose initialText={text} title="Ask About Clipboard" />
  ) : (
    <Detail isLoading={!error} markdown={error || "Reading clipboard…"} />
  );
}
