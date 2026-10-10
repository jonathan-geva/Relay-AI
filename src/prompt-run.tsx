import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  LaunchProps,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { Prompt, renderPrompt, variables } from "./domain";
import { getPrompts } from "./storage";
import { builtins } from "./builtin-prompts";
import { Compose } from "./compose";
export function promptDeeplink(id: string) {
  return `raycast://extensions/jonathan-geva/relay-ai/prompt-run?launchContext=${encodeURIComponent(JSON.stringify({ promptId: id }))}`;
}
export function PromptRun({
  prompt,
  initialText = "",
}: {
  prompt: Prompt;
  initialText?: string;
}) {
  const { push, pop } = useNavigation();
  const names = variables(prompt.instruction),
    [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({
    input: initialText,
    selectedText: initialText,
  });
  if (!names.length)
    return (
      <Compose
        instruction={prompt.instruction}
        title={prompt.title}
        initialText={initialText}
        model={prompt.model}
        providerId={prompt.providerId}
      />
    );
  return (
    <Form
      navigationTitle={prompt.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Open Chat with Preset"
            onSubmit={(v: Record<string, string>) => {
              try {
                const instruction = renderPrompt(prompt.instruction, {
                  ...v,
                  date: new Date().toLocaleDateString(),
                });
                pop();
                push(
                  <Compose
                    instruction={instruction}
                    title={prompt.title}
                    initialText={v.input || initialText}
                    model={prompt.model}
                    providerId={prompt.providerId}
                  />,
                );
              } catch (e) {
                setError(String(e));
              }
            }}
          />
          <Action
            title="Use Clipboard for Context"
            onAction={async () => {
              const text = (await Clipboard.readText()) || "";
              setValues((v) => ({
                ...v,
                input: text,
                selectedText: text,
                clipboard: text,
              }));
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        text={
          prompt.description ||
          "Fill in this preset's variables, then continue in the chat with history visible."
        }
      />
      {names
        .filter((n) => n !== "date")
        .map((name, i) => (
          <Form.TextArea
            key={name}
            id={name}
            title={name}
            value={values[name] || ""}
            onChange={(text) => setValues((v) => ({ ...v, [name]: text }))}
            error={i === 0 ? error || undefined : undefined}
          />
        ))}
      {!names.includes("input") && (
        <Form.TextArea
          id="input"
          title="Your Text"
          value={values.input || ""}
          onChange={(text) => setValues((v) => ({ ...v, input: text }))}
        />
      )}
    </Form>
  );
}
export default function Command(
  props: LaunchProps<{
    arguments: { prompt?: string };
    launchContext: { promptId?: string };
  }>,
) {
  const [prompt, setPrompt] = useState<Prompt>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getPrompts()
      .then((custom) => {
        const id = props.launchContext?.promptId || props.arguments.prompt;
        const p = [...builtins, ...custom].find(
          (p) => p.id === id || p.title.toLowerCase() === id?.toLowerCase(),
        );
        if (active) {
          if (p) setPrompt(p);
          else
            setError(
              "Prompt not found. Copy a fresh prompt quicklink from the Prompt Library.",
            );
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [props.launchContext?.promptId, props.arguments.prompt]);
  return prompt ? (
    <PromptRun prompt={prompt} />
  ) : (
    <Detail isLoading={!error} markdown={error || "Loading preset…"} />
  );
}
