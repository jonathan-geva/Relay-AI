# Validation

## Passed

- TypeScript typecheck and source/test ESLint checks.
- Native Raycast build for all six command entry points.
- 15 automated tests: nine streaming cases and six API/storage integration cases.
- API tests use a temporary local HTTP server and the real fetch path, mocking only Raycast preferences/storage.
- Development CLI compiled and started watching the extension.

## Limits

- Native UI: the computer-use helper did not expose a targetable Raycast window after launch. Visual and interactive acceptance remains unverified.
- Actual AI output: no server listened at the default ChatMock endpoint during validation. Automated tests do not use a real model.
- Full Store lint: inherited author `jonathan-geva` fails the remote author check with 404. Source lint passes separately.
- Dependency audit reports two low-severity entries for the Raycast API's transitive esbuild dependency. No forced version override was applied.

## Manual acceptance

1. Start your provider and open Relay AI in Raycast.
2. Check workspace spacing, icons, truncation, and keyboard navigation in your theme.
3. Send a question, stop, regenerate, and continue.
4. Resume, rename, pin, copy, and delete a test conversation.
5. Run a selected-text prompt; create, duplicate, edit, and delete a custom test prompt.
6. Disable future history saving and verify fresh chats are not saved.
7. Check disconnected endpoints and invalid models for readable errors and retry.
8. Verify selection capture and paste in your normal applications.
