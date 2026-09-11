# Relay AI

A native Raycast AI workspace for ChatMock and other OpenAI-compatible APIs, on Windows and macOS.

## Features

- Searchable conversation history, resume, pin, rename, delete, and Markdown copy.
- Ten categorized prompt templates plus custom prompt creation, editing, duplication, and deletion.
- Streaming responses, follow-ups, stop, retry/regenerate, copy, and paste.
- Selected-text workflows with input review before sending.
- Quick Ask using the same full conversation interface.
- Model discovery, persistent defaults, fallback, and connection errors.
- Optional local conversation history, independently stored custom prompts.

## Run locally

Requires Raycast and Node.js 22.22.2 or newer (Node 24 LTS works).

```powershell
npm ci
npm run dev
```

Search Raycast for **Relay AI** or **Prompt Library**. The CLI builds and imports the extension and watches source changes. If Raycast does not appear, open it manually.

Configure API Base URL, API Key, Fallback Model, System Prompt, and Conversation History in extension preferences. The default endpoint is `http://127.0.0.1:8000/v1`. For a manually managed provider, start its server yourself. For automatic ChatMock setup, use the flow below.

## Automatic ChatMock setup

Open **Relay AI → Set Up ChatMock → Set Up Automatically** (or launch the **Set Up ChatMock** command directly).

Relay downloads a checksum-verified uv installer, creates a private Python 3.12 environment, and installs ChatMock 1.40. Nothing needs to be installed globally and no administrator access is needed. Keep the setup screen open; downloads can take a few minutes.

If ChatMock finds an existing saved session, it can reuse it. Otherwise Relay opens the official browser sign-in and waits for you to finish. You can also choose **Sign In Again**. Relay does not display or copy your account tokens.

After setup, Relay uses its managed server at `http://127.0.0.1:8317/v1`, protected by a generated local access key. It selects an available model and restarts the server when a chat or model request needs it. There is no startup service or scheduled task. Your custom API URL, key, and model selection are preserved separately.

Use **Stop Server and Use Custom API** to turn off on-demand startup and return to your original settings. The server otherwise continues running after the setup screen closes. Closing setup cancels installation or sign-in in progress. Retry resumes from the installed environment; a stale lock after a crashed process can be cleared with **Reset Setup Lock**.

Files live in Raycast's extension support folder under `chatmock/`. Use **Show ChatMock Files** or **Open Server Log** for troubleshooting. The runner stores new ChatMock sign-ins in its own account folder; ChatMock may also discover existing sessions using its built-in fallback behavior.

Automatic installation targets Windows and macOS, Intel and ARM. Windows installation and server lifecycle were tested locally; macOS and ARM installers have verified upstream asset hashes but still need native acceptance testing. Requires access to GitHub, PyPI, Astral's Python downloads, and the ChatGPT sign-in service.

## Workflows

1. Open Relay AI, choose New Conversation, enter a question, choose a model, and send.
2. Use the response action menu to stop, continue, regenerate, copy, or paste.
3. Browse Prompt Library to preview instructions and add your text, or choose Use Selected Text.
4. Return to the workspace to resume and organize conversations. Refresh History picks up changes from other command instances.
5. Create custom prompts for repeated work; input is appended separately on each use.

New, refresh, and copy actions use native platform shortcuts.

## Data and compatibility

Messages and system instructions are sent to your configured endpoint. History uses Raycast LocalStorage and is not encrypted by this extension. API keys are not included in conversation records or Markdown copies. Turning history off stops future saves; existing conversations remain until deleted. Custom prompts are stored independently. Partial responses are retained after cancellation or failure.

Model discovery times out after 15 seconds; generation after 3 minutes. OpenAI Chat Completions SSE and JSON responses are supported. Model discovery is optional when a fallback is configured. Tools, images, attachments, and browsing are not implemented.

## Checks

```powershell
npm run typecheck
npm run lint:code
npm test
npm run build
npm run lint
```

Full Store lint additionally checks the author handle. The inherited `jonathan-geva` handle currently returns 404 from Raycast author validation; a registered Raycast handle is needed before publishing. Local builds are unaffected.

See [DESIGN.md](DESIGN.md) and [VALIDATION.md](VALIDATION.md).
