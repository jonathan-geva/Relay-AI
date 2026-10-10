# Relay AI audit and roadmap

This is the historical audit before the complete-workspace implementation. Its feature gaps and local-check counts are superseded by [CHANGELOG.md](CHANGELOG.md), [README.md](README.md), and [VALIDATION.md](VALIDATION.md).

Reviewed 10 October 2026. Baseline: [jonathan-geva/Relay-AI](https://github.com/jonathan-geva/Relay-AI), `main` commit `e2d1490`. Local fixes are on `fix/relay-audit-polish` and have not been pushed or installed into Raycast.

Relay already has a useful text workspace. The next release should improve conversation control and reusable workflows, then add richer context. Store readiness and native acceptance need work before calling it finished.

## What is done

All seven command entry points compile. The features below are present in source; test evidence and interactive limitations are listed separately.

| Area         | Implemented                                                                                                                                     | Remaining gap                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Workspace    | Launch actions, title/content search, pinned and recent chats                                                                                   | Projects, tags, archive, undo deletion                                      |
| Chat         | Streaming, follow-ups, stop, retry, last-answer regeneration, copy and paste                                                                    | Change model in an open chat, edit a user message, branch a conversation    |
| Thinking     | Separate reasoning and answer fields; live Markdown rendering; legacy history migration                                                         | Collapse/hide control; native recheck of the current build                  |
| Quick access | Quick Ask argument, Ask About Selected Text, Improve Selected Writing                                                                           | Clipboard input, deep links to custom prompts                               |
| Prompts      | Ten built-in templates; custom create, edit, duplicate, delete; selection input                                                                 | Variables, per-prompt model/instructions, sharing/import/export             |
| Models       | Discovery, persistent defaults, fallback; independent managed/custom defaults                                                                   | Favorites, provider profiles, capability controls, validated stale defaults |
| History      | Local storage, resume, pin, rename, confirmed deletion; disable future saves                                                                    | JSON backup/restore and migration versioning                                |
| Export       | Copy one response or the conversation as Markdown                                                                                               | Save to a file, JSON import/export; current “export” is clipboard-based     |
| ChatMock     | Pinned installer, verified downloads, isolated Python, login handoff, loopback server, local key, on-demand startup, logs and recovery controls | Managed upgrade flow; fresh macOS/ARM acceptance                            |
| Custom APIs  | Chat Completions via SSE or JSON, optional API key/system prompt                                                                                | Native Anthropic/Responses APIs; provider-specific features                 |

## Fixes prepared in this audit

- Handle `reasoning_content` in streamed and JSON responses. That field is documented by [DeepSeek](https://api-docs.deepseek.com/guides/thinking_mode/); the fix supports its response shape without claiming live DeepSeek account testing.
- Preserve `<thinker>`, incomplete tags, and literal `<think>` examples in ordinary answers. Only a leading reasoning block is parsed as legacy protocol markup.
- Normalize model discovery: trim IDs, remove duplicates, skip invalid entries, and explain malformed lists. Custom discovery and managed activation share the parser.
- Validate saved conversations before rendering. Invalid records stay stored until explicit deletion.
- Clear every history key, including unreadable records, while keeping model settings and prompts.
- Reject malformed prompt libraries before editing, preserving the original data instead of crashing or overwriting it.
- Apply five compatible brace-expansion dependency patches, resolving the high-severity audit finding without a major SDK upgrade.
- Fix the Store command-title warning and configure formatting to respect Windows line endings.
- Add ten regression tests and update README, design, and validation notes.

## Testing and release status

| Check                                   | Result                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Clean baseline installation             | Passed; system npm warned about old system Node                                          |
| Existing tests before edits             | 30/30 passed                                                                             |
| New regression tests before fixes       | Nine failures reproduced in the first 40-test run                                        |
| Tests after fixes                       | 40/40 passed: 17 stream, 13 API/storage, eight setup, two lifecycle-helper cases         |
| TypeScript                              | Passed                                                                                   |
| Source ESLint                           | Passed                                                                                   |
| Prettier                                | Passed                                                                                   |
| Raycast release build                   | Passed for all seven commands                                                            |
| Full Store lint                         | Fails only on author `jonathan-geva`; Raycast lookup returns 404                         |
| Dependency audit after compatible fixes | Zero high/critical; two low findings remain through esbuild/Raycast API                  |
| Real managed provider                   | Three models discovered; exact completion, streamed answer, and follow-up context passed |
| New native UI acceptance                | Not completed: Raycast exposes no targetable window to computer use                      |
| macOS/ARM native acceptance             | Not completed this session                                                               |

Live tests used the real authenticated local ChatMock server with `gpt-5.6-sol`, through the current API client. No credentials were printed or exported. The server was running beforehand and remained running. The live prompts produced no reasoning events, so they verify the answer and continuation path; automated fixtures verify reasoning formats.

The system Node.js is **22.13.1**, below the required **22.22.2**. Testing used bundled **24.19.0**. Install a supported Node version before relying on ordinary `npm run dev` from the system shell.

Two low findings remain because the locked Raycast API uses the esbuild 0.27 range; the advisory's fix is outside that range. A major Raycast API migration deserves its own compatibility pass. See the [esbuild advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).

There is no CI workflow, standalone LICENSE file, release changelog, or Store screenshot set in the tracked repository. The manifest says MIT. Choose an existing Raycast account handle before publishing; do not guess a replacement identity.

## Research recovered

The original research is still in `DESIGN.md` and the September chat **“Build out Relay AI extension.”** It compared Raycast AI Chat, PromptLab, and ChatGPT for Raycast; Sider and Merlin were early references before the product surface was narrowed to Raycast. Most original recommendations—persistent chats, reusable prompts, selection previews, response controls, and optional history—are now implemented.

Current official pages were checked again on 10 October:

- [Raycast AI Chat](https://manual.raycast.com/ai/ai-chat) supports model switching, message editing, chat branching, attached context, and long-chat summarization. These are relevant directions for Relay, although the native AI product has a broader platform than a normal extension.
- [PromptLab](https://www.raycast.com/HelloImSteven/promptlab) emphasizes contextual placeholders, selected-file context, reusable configuration, and portable chat data. Relay currently stores plain instructions and appends typed input.
- [ChatGPT for Raycast](https://www.raycast.com/abielzulio/chatgpt) supports configurable presets and commands, including clipboard/context input. Relay has the core commands but fewer reusable settings.
- [ChatMock](https://github.com/RayBytes/ChatMock) documents reasoning effort, image input, tool calling, web search, and a Responses API. Those backend capabilities are not automatically Relay features: Relay's request contract and rendering are still text-only Chat Completions.

The priorities below are product judgments based on that research and the inspected code, rather than claims made by those projects.

## Recommended implementation order

| Priority     | Feature                                                                       | Why it is worth doing                                                                                                                                                     | Relative scope                             |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Release gate | Native Windows/macOS acceptance, valid Store author, CI checks                | Establish that commands, selection, keyboard actions, cancellation and setup work in the actual app                                                                       | Small engineering work plus device testing |
| 1            | Model switching in an open chat, including retry with another model           | A failed or unsuitable model currently requires a new chat; preserve useful context and recover directly                                                                  | Small–medium                               |
| 1            | Prompt presets with variables and per-prompt model/instructions               | Makes the existing library useful for repeated work: language, tone, audience, output format, selected text or clipboard                                                  | Medium                                     |
| 1            | Clipboard input and shortcuts/deep links for prompts                          | Extends the strongest current workflows with fewer steps; preview input before sending                                                                                    | Small                                      |
| 2            | Edit the last user message and branch a chat                                  | Makes refinement and alternative answers possible without overwriting the original conversation                                                                           | Medium                                     |
| 2            | Reasoning show/hide, response elapsed time, clear timeout/rate-limit recovery | Reduces visual noise while preserving the live thinking the user requested                                                                                                | Small–medium                               |
| 2            | JSON backup/restore and prompt import/export                                  | Protects useful local work and makes prompts portable; validate schema before importing                                                                                   | Medium                                     |
| 2            | Provider profiles with conversation provenance                                | Chats currently store only model IDs. Changing the global endpoint can send resumed history to a different provider; show the destination and require a deliberate switch | Medium                                     |
| 3            | Long-chat context management                                                  | Relay sends the whole history on each request. Start with context-limit feedback, then optional summaries that retain original messages                                   | Medium–large                               |
| 3            | Opt-in ChatMock web search with source links                                  | Valuable for current information; needs provider capability checks, request options, citation handling and errors                                                         | Medium–large                               |
| Later        | Text-file context, then images/screenshots                                    | Adds useful material beyond selection; implement size limits and explicit previews, then multimodal message storage                                                       | Medium–large                               |
| Later        | Projects/tags, cloud sync, tools/MCP, agents                                  | Higher cost and additional storage/provider contracts; revisit after the everyday text workflows are strong                                                               | Large                                      |

A focused next feature release should contain **model switching + prompt presets/variables + clipboard input**. Add branching after those. Avoid attempting all of Raycast AI's platform features in one extension release.

## Additional engineering gaps

- The stream parser is line-based rather than a full [SSE event parser](https://html.spec.whatwg.org/multipage/server-sent-events.html). Multiline `data:` fields and bare CR separators need explicit support and tests before claiming universal compatibility.
- Provider `finish_reason` values are ignored. Output cut off by a token limit can look complete; surface truncation and recovery before adding more providers.
- Default models are separated between managed and custom mode, but not between different custom endpoints. A stale model ID remains selectable even after discovery says it is absent.
- Custom prompts are stored in a single array with read/modify/write operations. Concurrent editors can overwrite each other's changes; use per-prompt records as conversation storage already does.
- ChatMock account status checks for saved tokens; it does not independently establish that the session is still valid. Improve authentication-expiry messages and recovery.
- History and prompt data have no schema version. Add versioned migrations before changing the conversation model for provider profiles, branching or attachments.

## Native acceptance still needed

Open every command from Raycast search. Test a fresh conversation and Quick Ask; stop/retry/regenerate/continue; run both selection commands in another app; resume/rename/pin/copy/delete a disposable chat; create/edit/duplicate/run/delete a disposable prompt; disable history and confirm no future writes; verify invalid endpoint/model recovery; and test setup/restart/cancellation on Windows and macOS. Existing user history should not be deleted for testing.
