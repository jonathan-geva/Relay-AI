# Relay AI

A native Raycast AI workspace for Windows and macOS, with continuous chat input, provider profiles, reusable prompts, and local history.

## Chat without leaving the transcript

Open **Relay AI → New Conversation**, then type in the message bar at the top. **Enter sends your message.** The answer and conversation timeline remain visible while you reply; there is no follow-up form to open.

- **Latest Response** keeps the newest exchange readable. Select **Full Transcript** or an earlier message to review context while your draft stays in the message bar.
- Type the next message while Relay streams. Enter queues it and sends it after the current answer finishes, with that answer included in the context.
- Stop cancels the request and clears the queue. Partial answers and thinking are retained.
- The model dropdown changes the next response's model within the same conversation.
- Edit Last Message puts that message into the message bar and creates a new branch when you send it. The original chat is preserved.
- Show/Hide Thinking, elapsed time, copy/paste, regenerate, and export are in the action menu.
- Draft text is restored when you resume a saved conversation. Pending attachment selections and queues are session-only.

The message bar is Raycast's native single-line search control with filtering disabled. It accepts typed or pasted text; it is not a custom multiline composer docked below the transcript. This layout uses the supported [List API](https://developers.raycast.com/api-reference/user-interface/list).

## Commands

| Command                  | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| Relay AI                 | Workspace, continuous chat, history, archive and trash    |
| Quick Ask                | Send an initial question directly from root search        |
| Ask About Selected Text  | Preview a selection as a chat draft                       |
| Improve Selected Writing | Use persistent writing instructions with selected text    |
| Ask About Clipboard      | Preview clipboard text as a chat draft                    |
| Models                   | Discovery, favorites, provider switching and defaults     |
| Prompt Library           | Ten templates, custom presets, variables and sharing      |
| Run Prompt Preset        | Launch a preset by quicklink, name or ID                  |
| Provider Profiles        | Chat Completions, Responses and Anthropic configuration   |
| Projects & Agents        | Shared instructions and saved model/tool presets          |
| MCP Connections          | Existing Streamable HTTP MCP servers                      |
| Backup, Restore & Sync   | JSON backup/import and synced-folder exchange             |
| Set up ChatMock          | Automatic installation, login, repair and server controls |

## Setup and providers

On first launch, **Set up Automatically** installs pinned ChatMock 1.40 and private Python 3.12 using a checksum-verified uv archive. Sign in in your browser when prompted. Relay binds the server to `127.0.0.1:8317` and requires a random local key. It restarts on demand; repair/update reinstalls the bundled, tested ChatMock version and preserves the account folder.

Choose **Use My Custom API Instead** for another endpoint. The built-in Custom API Preferences profile uses extension preferences. Saved profiles support Chat Completions, Responses, and Anthropic Messages. Set the base URL, model and key, then enable only capabilities supported by that provider/model.

Provider keys stay in device-local Raycast LocalStorage, separate from portable records. Alternatively, specify an environment variable. Blank key fields preserve a saved key. Profiles, credentials and sessions are excluded from backups and sync, so configure providers independently on another device.

Chats record their provider and endpoint fingerprint. Changing a provider or endpoint requires confirmation before saved history is sent to the new destination. Defaults are scoped to endpoint fingerprints; model discovery selects an available model when a saved default has disappeared.

## Prompts, projects and agents

Custom prompts can save a model and provider ID plus reusable instructions. Use placeholders such as `{{language}}`, `{{tone}}`, `{{audience}}`, `{{input}}` and `{{selectedText}}`; missing values are collected before opening the chat. `{{date}}` fills automatically. Clipboard actions can fill input/selection/clipboard fields. Instructions remain active across follow-ups.

Copy a prompt quicklink from its action menu to launch it directly. JSON exports can be imported through **Backup, Restore & Sync**. Prompt records are stored individually, so simultaneous edits to different prompts do not overwrite one another.

Projects group chats under shared instructions. Agents save instructions, an optional model and an allowed MCP-tool list. Choose either in Chat Settings. Tags and projects appear in the workspace collection dropdown.

## Search, context and attachments

Turn on web search in Chat Settings for a capable provider. Managed ChatMock uses its Responses endpoint for search so source annotations remain available. Sources appear below the answer. Search requires upstream model/account support.

Attach text/code files or PNG/JPEG/GIF/WebP images through **Attach Files or Screenshot**. Review content before adding it, then inspect pending attachments in the chat before sending. Use a saved screenshot or a clipboard file; Relay does not silently capture your screen. Clipboard image data without a file path may need to be saved first.

Limits: text files 256 KB each; images 10 MB each; eight files and 15 MB per attachment selection. Binary text files and damaged image containers are rejected. PDF extraction, audio and video are not implemented.

Context limits use an approximate character-based token budget. **Summarize Earlier Context** replaces earlier turns only in future requests; the full original transcript stays stored. **Use Full Original Context** reverses this. Provider output-limit warnings offer continuation/settings recovery. Authentication, rate-limit, timeout and connection errors explain the next step.

## Tools and data

Add an existing Streamable HTTP MCP endpoint, then discover tools. Optional bearer authentication uses an environment variable. Enable tools per chat, and select a saved agent to restrict the available tool list. Every proposed tool call shows its arguments and requires confirmation. Declined tools do not execute. Runs are capped at eight model/tool rounds. OAuth sign-in and stdio MCP transports are not included.

History includes pins, rename, archive, branching and restorable Recently Deleted records. Disabling history stops future conversation and draft saves, and automatic folder sync. Permanent Clear History removes all local conversation/draft records; synced copies require separate clearing or disconnecting.

Exports include message text, thinking, attachments, prompts, projects and agents. JSON is versioned and validated before import; failed writes roll back. Import makes a local recovery backup first.

Folder sync uses a folder already managed by OneDrive, Dropbox, iCloud Drive or another sync service. Each device writes its own JSON file. Record timestamps resolve conflicts, including deletion markers; divergent simultaneous edits to the same record use deterministic last-write selection. Enable automatic sync explicitly, or merge manually. Relay does not create a hosted account or configure your cloud service.

## Run and verify

Use Node.js **22.22.2+**, preferably Node.js 24. On this PC, `start-relay.ps1` can select the bundled compatible runtime when the system Node is too old. Keep the development watcher running.

```powershell
npm ci
npm run dev
```

```powershell
npm run build
npm run typecheck
npm run lint:code
npm run format:check
npm test
npm audit --audit-level=high
```

`npm run lint` additionally checks Store author identity. The current `jonathan-geva` handle returns 404; publishing needs a valid Raycast author. Cross-platform CI is configured, but native macOS acceptance and Store screenshots still require a real device/session. See [VALIDATION.md](VALIDATION.md), [DESIGN.md](DESIGN.md), [RELEASE.md](RELEASE.md) and [CHANGELOG.md](CHANGELOG.md).
