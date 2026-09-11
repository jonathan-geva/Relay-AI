# Design and implementation plan

Research reviewed on 11 September 2026. Relay is a Raycast extension, so it uses native lists, forms, Markdown detail views, metadata, semantic color, and action panels. These inherit the user's Raycast appearance and keyboard behavior.

## Research informing the scope

- [Raycast AI Chat](https://manual.raycast.com/ai/ai-chat): persistent history and continuation. Relay now saves, searches, resumes, and organizes conversations.
- [PromptLab](https://www.raycast.com/HelloImSteven/promptlab): reusable commands for repeated workflows. Relay provides curated and custom prompts.
- [ChatGPT extension](https://www.raycast.com/abielzulio/chatgpt): quick access and history controls. Relay unifies Quick Ask with full conversations and offers history-off mode.
- [Raycast AI presets](https://www.raycast.com/changelog/macos/1-72-0): explicit instructions and model choice. Relay previews prompt instructions and offers a model selector before submission.

Initial research included [Sider](https://sider.ai/home) and [Merlin](https://extension.getmerlin.in/). Once repository inspection established Raycast as the target, implementation scope shifted to native Raycast workflows.

## Implementation priorities

1. Reliable generation: cancellation, clear errors, retry, UTF-8 streaming, and JSON fallback.
2. Shared response behavior across Quick Ask, chat, and selected-text workflows.
3. A workspace with launch actions, pinned conversations, and recents.
4. Reusable workflows: ten categorized prompts and custom prompt editing.
5. Persistence and provider tests, local build, and documentation.

## UX decisions

- Group launch actions separately from saved work.
- Blue conversation icons, purple prompts, orange models, and yellow pins.
- Short prompt descriptions with full instructions in a preview pane.
- Model and generation status next to the response.
- One generation at a time, with Stop as the primary action while running.
- Preview selected text before generation; paste remains an explicit action.
- Explain empty, disconnected, failed, and history-disabled states.
- Preserve the configured default when model discovery fails.
- Keep custom prompts independent of conversation history deletion.

## Deferred

Browser control, autonomous tools, image generation, attachments, synchronization, and provider-specific comparisons need additional contracts beyond the existing text API. This iteration focuses on everyday text work.
