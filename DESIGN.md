# Relay design

Updated 10 October 2026.

## Continuous native chat

Raycast's Detail view has no editable input. Relay therefore uses a List with a controlled message bar, disabled filtering, a timeline and Markdown details. Typing does not navigate. Enter sends; during generation it queues the next turn. Latest Response and Full Transcript provide two views of the same conversation while the draft stays visible.

The shared ChatView owns request cancellation, queued inputs and transient attachments. A mounted ref and deferred abort protect React development remounts; a request controller prevents overlapping generations. New requests take a snapshot of their model, settings and context. Streaming updates preserve newer draft/settings state. Editing creates a branch, and summaries preserve original messages.

## Data and provider boundaries

`domain.ts` defines versioned records and validates portable data. Conversation, prompt, project and agent records each have their own LocalStorage key. Legacy conversations normalize on read; the old prompt array migrates without overwriting individual records. Archive is a flag; deletion retains timestamped records for restore and sync. Backup import validates first and rolls back failed writes.

Provider profiles and secrets use separate keys. Portable exports intentionally exclude both. Provider fingerprints scope model defaults and identify the destination of a conversation. Unknown legacy destinations and changed endpoints require confirmation before sending existing history.

`api.ts` manages generation and approved tool loops. `protocols.ts` serializes Chat Completions, Responses and Anthropic requests and streams their results. `sse.ts` handles UTF-8 and complete event framing with legacy JSON-line tolerance. Raw provider thinking/output items are retained for valid tool continuation. MCP uses the official SDK with Streamable HTTP; each call requires approval. Agents restrict the discovered tool set.

`attachments.ts` bounds text/image input and validates image containers before building provider content parts. Web-search requests use provider capability controls and render source annotations. Managed ChatMock search uses Responses because its Chat Completions translation omits those annotations.

Folder sync is an opt-in exchange through a user-selected, already-synced directory. Each device writes a separate atomic JSON file. Records merge by modified/deleted timestamps, with deterministic ties. API keys, server keys and account sessions stay device-local. This avoids inventing a Relay service or cloud account.

## Research

The September research is preserved in [AUDIT.md](AUDIT.md) and the earlier “Build out Relay AI extension” chat. Current implementation draws on [Raycast AI Chat](https://manual.raycast.com/ai/ai-chat), [PromptLab](https://www.raycast.com/HelloImSteven/promptlab), and [ChatGPT for Raycast](https://www.raycast.com/abielzulio/chatgpt). Native UI contracts come from the [Raycast List API](https://developers.raycast.com/api-reference/user-interface/list). Provider contracts were checked against [OpenAI streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events), [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), and [ChatMock](https://github.com/RayBytes/ChatMock).

## Icon

The inherited icon PNG was truncated despite passing Raycast's dimension check. A new icon was created with the built-in ImageGen tool and prepared as `assets/icon-relay-512.png` for Raycast's required 512×512 size. The old asset is retained without being referenced.

Generation prompt: “A polished square app icon for the Relay AI Raycast extension: a compact luminous blue-to-violet connected speech-bubble / relay-loop symbol on a rich dark navy rounded square. Two connected nodes suggest continuous conversation. Subtle dimensional lighting, crisp thick contours, centered with generous padding. No letters, words, watermark, surrounding mockup or devices. Single opaque square icon.”

## Boundaries

The main input is Raycast's single-line message bar; no custom bottom composer is available in this API. Screenshots are selected files, not automatic screen capture. Cloud exchange needs an existing synced folder. MCP needs existing HTTP endpoints and authentication; hosted services, OAuth login flows, stdio servers, PDF/audio/video extraction and arbitrary shell execution are not part of this build. External author identity, native macOS verification and genuine Store screenshots remain release gates.
