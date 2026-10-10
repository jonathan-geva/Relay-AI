# Validation

Last updated 10 October 2026 for branch `fix/relay-audit-polish`, based on `main` at `e2d1490`.

## Automated checks

The current implementation passes:

- TypeScript type checking with `tsc --noEmit`.
- ESLint across `src` and `tests`.
- A native Raycast release build for all seven command entry points.
- 40 automated tests: 17 stream parsing cases, 13 API and storage cases, eight ChatMock setup and lifecycle cases, and two request-lifecycle helper cases.
- Prettier formatting, including Windows line endings.

The API suite uses a temporary local HTTP server and exercises the real fetch and stream parsing paths. Only Raycast preferences and LocalStorage are mocked. Coverage includes authentication headers, system prompts, selected models, model defaults, HTTP failures, cancellation, JSON fallback, malformed streams, UTF-8 chunk boundaries, reasoning separation, history operations, and legacy `<think>` migration.

The request-lifecycle tests exercise the abort scheduling helper used during a development remount and navigation. They do not render React components or operate the native Raycast UI.

The October regression tests cover `reasoning_content` in SSE and JSON responses, literal and incomplete think tags, invalid or duplicated model IDs, malformed model-list responses, invalid conversation records, complete history deletion, and preservation of unreadable prompt data. The first regression run reproduced nine failures before the fixes.

## October live verification

- The existing managed ChatMock 1.40 installation and saved session were detected without reinstalling or signing in.
- The current Relay API client discovered three models and received the exact response `Relay audit OK` from `gpt-5.6-sol` through the authenticated local connection.
- A second request streamed 65 answer updates and correctly calculated a 20% increase followed by a 20% decrease as 96, or 4% below the original. A follow-up correctly used that conversation context.
- These live prompts produced no reasoning events. Reasoning display compatibility is covered by automated protocol tests; it was not demonstrated by a new native UI test this session.
- The managed server was already running and remained running after testing.
- Windows computer use launched the installed Raycast app, but it exposed no targetable window. Interactive acceptance of the current patch remains outstanding.
- Checks used bundled Node.js 24.19.0. The system Node.js is 22.13.1, below the package's minimum 22.22.2.

## Earlier Windows verification (September)

- `npm run dev` compiles, imports, and watches the extension with Raycast's release target on Windows.
- The automatic setup downloaded the pinned uv archive, verified its SHA-256 digest, installed managed Python and ChatMock 1.40 in a path containing spaces, and completed repeat installation without another download.
- The actual runner passed start, authenticated health, rejection of unauthenticated requests, repeat start, stop, and restart checks.
- An occupied-port test confirmed Relay reports the conflict without stopping the unrelated service.
- A Python login fixture verified browser URL handoff, cancellation, and lock cleanup.
- The managed ChatMock endpoint returned a real completion from `gpt-5.6-sol` through Relay's authenticated local configuration.
- Native Raycast use confirmed automatic setup, conversation generation, Quick Ask, selected-text generation, separate reasoning display, and the corrected first-response lifecycle.

## Current limitations

- macOS and ARM archives use verified upstream hashes but have not received native interactive acceptance testing.
- Full Raycast Store lint fails only on the inherited `jonathan-geva` author handle because Raycast's remote author lookup returns 404. Manifest title casing, icons, source lint, formatting, and local builds pass.
- The dependency audit reports two low-severity findings in the Raycast API's transitive esbuild dependency. No forced transitive override is applied.
- Five compatible brace-expansion patches removed the high-severity dependency finding found during the October audit.
- Tools, images, attachments, browser actions, and cross-device synchronization are not implemented.
- Full SSE event framing (multiline data or bare CR separators) and provider finish-reason warnings are not yet covered. Current tests cover the line-based Chat Completions streams used by the managed provider.

## Manual release checklist

1. Run `npm ci`, `npm run typecheck`, `npm run lint:code`, `npm test`, and `npm run build` from a clean checkout.
2. Launch `npm run dev` and open every command from Raycast search.
3. Send a new message and confirm reasoning streams separately before the final answer.
4. Stop, retry, regenerate, and continue a conversation; verify the primary action changes appropriately.
5. Run Quick Ask, Ask About Selected Text, and Improve Selected Writing from a fresh command window.
6. Resume, rename, pin, export, and delete a test conversation.
7. Create, duplicate, edit, run, and delete a custom prompt.
8. Disable history and verify a new conversation is not persisted.
9. Test an invalid endpoint and model for readable recovery actions.
10. Repeat setup and chat acceptance on each release platform before publishing.
