# Relay AI

A minimal Raycast extension for ChatMock and other OpenAI-compatible APIs.

## Features

- AI Chat with streaming responses and follow-ups
- Dynamic model list from `GET /v1/models`
- Choose and persist a default model
- Quick Ask
- Ask About Selected Text
- Improve Selected Writing and paste the result back into the frontmost app
- Configurable OpenAI-compatible endpoint, API key, fallback model, and system prompt
- Windows and macOS support

## ChatMock setup

Start ChatMock first:

```powershell
cd C:\Users\<you>\Tools\ChatMock
.\.venv\Scripts\Activate.ps1
chatmock serve
```

The default Relay AI endpoint is:

```text
http://127.0.0.1:8000/v1
```

## Install locally in Raycast

Node.js and npm are required.

```powershell
npm install
npm run dev
```

Raycast imports the development extension automatically. Open `Models` to fetch the available models and choose a default.

## Notes

- ChatMock must be running while Relay AI uses it.
- The API key can stay `chatmock` for ChatMock because it does not require a real OpenAI API key.
- Relay AI also works with other OpenAI-compatible endpoints by changing the extension preferences.
