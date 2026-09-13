# Relay AI

Relay AI is a native Raycast workspace for ChatMock and other OpenAI-compatible APIs. It brings conversations, selected-text actions, reusable prompts, model choice, and local history into one keyboard-first interface on Windows and macOS.

## Features

- Streaming answers with model reasoning rendered separately while the response is generated.
- Searchable conversation history with resume, pin, rename, delete, and Markdown export.
- Quick Ask plus dedicated actions for understanding and improving selected text.
- Ten categorized prompt templates and a custom prompt library with create, edit, duplicate, and delete actions.
- Model discovery, persistent defaults, graceful fallback, and readable connection errors.
- Stop, retry, regenerate, continue, copy, and paste from every response.
- Optional local history and independently stored custom prompts.
- One-step ChatMock installation, sign-in, server startup, and model selection.

## Commands

| Command                      | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| **Relay AI**                 | Open the workspace, start conversations, and manage history.             |
| **Quick Ask**                | Send a prompt directly from Raycast.                                     |
| **Ask About Selected Text**  | Capture selected text, review the prompt, and ask Relay about it.        |
| **Improve Selected Writing** | Improve selected text while preserving its meaning, language, and voice. |
| **Models**                   | Browse available models and choose the default.                          |
| **Prompt Library**           | Run curated prompts or manage your own reusable prompts.                 |
| **Set Up ChatMock**          | Install and connect the managed local ChatMock server.                   |

## Automatic ChatMock setup

On first launch, Relay offers the setup screen automatically. Choose **Set Up Automatically** and keep the screen open while it works.

Relay downloads a checksum-verified uv archive, creates a private Python 3.12 environment, and installs ChatMock 1.40 inside Raycast's extension support directory. It does not require administrator access or install Python globally.

If ChatMock finds a saved session, it reuses it. Otherwise, Relay opens the official browser sign-in and waits for you to finish. ChatMock handles the account credentials; Relay does not display or copy them.

After setup, Relay:

1. Starts an authenticated server on `127.0.0.1:8317`.
2. Discovers the models available to the signed-in account.
3. Selects a valid default model.
4. Restarts the server on demand after Raycast or the computer restarts.

The server accepts connections only from the local computer and requires a random per-install access key. Custom API preferences and their model default remain stored separately, so you can switch back with **Stop Server and Use Custom API**.

The setup page also provides status refresh, reauthentication, cancellation, server logs, the ChatMock data folder, and recovery from a stale setup lock. Setup downloads require access to GitHub, PyPI, Astral's Python downloads, and the ChatGPT sign-in service.

## Use another provider

Choose **Use My Custom API Instead** during setup, then configure these extension preferences:

- **API Base URL**: an OpenAI-compatible `/v1` endpoint.
- **API Key**: optional authorization token for the endpoint.
- **Fallback Model**: used before model discovery or when discovery is unavailable.
- **System Prompt**: optional instruction prepended to conversations.
- **Conversation History**: controls whether future chats are saved locally.

The default custom endpoint is `http://127.0.0.1:8000/v1`. Relay supports OpenAI Chat Completions responses as SSE streams or JSON. Model discovery is optional when a fallback model is configured.

## Run from source

Install Raycast and Node.js 22.22.2 or newer. Node.js 24 LTS is supported.

```powershell
git clone https://github.com/jonathan-geva/Relay-AI.git
cd Relay-AI
npm ci
npm run dev
```

`npm run dev` uses Raycast's Windows-compatible release target, imports the development extension, and watches source changes. Keep that terminal open, then search Raycast for **Relay AI**. If Raycast does not become visible automatically, open it yourself; the watcher can still be running correctly.

Create a production bundle with:

```powershell
npm run build
```

The output is written to `dist/`.

## Everyday workflows

1. Open **Relay AI**, choose **New Conversation**, enter a message, select a model, and send.
2. Watch reasoning and answer text stream in separate sections.
3. Use the action menu to stop, continue, regenerate, copy, or paste the answer.
4. Return to the workspace to search, resume, pin, rename, export, or delete conversations.
5. Open **Prompt Library** to run a template with typed or selected text.

Selected-text commands first show the captured content in an editable form. Relay never replaces the source text automatically; use **Paste Response** when you want to insert the result.

## Data and privacy

Messages and the optional system prompt are sent to the configured provider. Conversation history and custom prompts use Raycast LocalStorage. API keys and ChatMock account credentials are not written into conversation records or Markdown exports.

Disabling history stops future conversations from being saved. Existing history remains until you delete it. Partial answers and reasoning are retained when a request is stopped or fails after streaming begins.

## Troubleshooting

- **A command is missing:** run `npm run dev`, keep the terminal open, and reopen Raycast.
- **Missing executable:** run `npm ci` followed by `npm run build`, then restart `npm run dev`.
- **Response stops immediately:** update to the latest branch build and open a fresh command window. Relay includes a remount-safe request lifecycle for Raycast development mode.
- **ChatMock is unavailable:** open **Set Up ChatMock**, refresh its status, and inspect **Open Server Log** if startup fails.
- **No models appear:** reauthenticate ChatMock or verify the custom API URL and key. The configured fallback remains usable when only discovery fails.
- **Selection cannot be read:** select text in another application before launching the command, then use **Read Selection Again**.

Generation times out after three minutes and model discovery after 15 seconds. Tools, images, attachments, browsing, and synchronization are outside the current text-chat scope.

## Development checks

```powershell
npm run typecheck
npm run lint:code
npm test
npm run build
npm run lint
```

The first four checks pass locally. Full Raycast Store lint also validates the author account; the inherited `jonathan-geva` handle currently receives a 404 from that remote validation. This does not affect local builds.

See [DESIGN.md](DESIGN.md) for architecture and product decisions and [VALIDATION.md](VALIDATION.md) for the current verification record.
