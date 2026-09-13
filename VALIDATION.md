# Validation

Last updated 13 September 2026 for branch `feat/relay-workspace`.

## Automated checks

The current implementation passes:

- TypeScript type checking with `tsc --noEmit`.
- ESLint across `src` and `tests`.
- A native Raycast release build for all seven command entry points.
- 30 automated tests: 12 stream parsing cases, eight API and storage cases, eight ChatMock setup and lifecycle cases, and two React request-lifecycle cases.

The API suite uses a temporary local HTTP server and exercises the real fetch and stream parsing paths. Only Raycast preferences and LocalStorage are mocked. Coverage includes authentication headers, system prompts, selected models, model defaults, HTTP failures, cancellation, JSON fallback, malformed streams, UTF-8 chunk boundaries, reasoning separation, history operations, and legacy `<think>` migration.

The request-lifecycle tests cover Raycast's React development remount and real navigation away from an active response. This guards against the first request being incorrectly shown as stopped.

## Live Windows verification

- `npm run dev` compiles, imports, and watches the extension with Raycast's release target on Windows.
- The automatic setup downloaded the pinned uv archive, verified its SHA-256 digest, installed managed Python and ChatMock 1.40 in a path containing spaces, and completed repeat installation without another download.
- The actual runner passed start, authenticated health, rejection of unauthenticated requests, repeat start, stop, and restart checks.
- An occupied-port test confirmed Relay reports the conflict without stopping the unrelated service.
- A Python login fixture verified browser URL handoff, cancellation, and lock cleanup.
- The managed ChatMock endpoint returned a real completion from `gpt-5.6-sol` through Relay's authenticated local configuration.
- Native Raycast use confirmed automatic setup, conversation generation, Quick Ask, selected-text generation, separate reasoning display, and the corrected first-response lifecycle.

## Current limitations

- macOS and ARM archives use verified upstream hashes but have not received native interactive acceptance testing.
- Full Raycast Store lint cannot validate the inherited `jonathan-geva` author handle because Raycast's remote author lookup returns 404. Source lint and local builds pass.
- The dependency audit reports two low-severity findings in the Raycast API's transitive esbuild dependency. No forced transitive override is applied.
- Tools, images, attachments, browser actions, and cross-device synchronization are not implemented.

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
