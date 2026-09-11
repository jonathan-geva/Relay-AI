import { Clipboard, getSelectedText, showHUD } from "@raycast/api";
import { ChatMessage, complete, getDefaultModel } from "./api";

export default async function Command() {
  try {
    const selected = await getSelectedText();
    if (!selected.trim()) {
      await showHUD("No text selected");
      return;
    }

    const model = await getDefaultModel();
    const messages: ChatMessage[] = [
      {
        role: "user",
        content:
          "Improve the following writing. Preserve the original meaning and language. Fix grammar and clarity. Return only the rewritten text, with no commentary.\n\n" +
          selected,
      },
    ];
    const answer = await complete(messages, model);
    if (!answer.trim()) throw new Error("The model returned an empty response.");
    await Clipboard.paste(answer.trim());
    await showHUD("Writing improved");
  } catch (error) {
    await showHUD(error instanceof Error ? error.message : String(error));
  }
}
