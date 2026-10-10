# Validation

Updated 10 October 2026 for `feat/relay-complete-workspace`, based on main `e2d1490` and audit fix `fed7ad7`.

## Automated checks

- TypeScript, source ESLint, Prettier and the native Raycast release build pass.
- All thirteen command entry points compile.
- The original forty tests continue to pass.
- The complete local suite passes 69 tests, including seven React interaction tests and twenty-one feature/integration tests.
- Feature tests cover branching/editing, restore/trash, concurrent prompt records, variables, summaries, schema rejection, deletion-aware merges, secret exclusion, provider default isolation, bounded text/image files, sync exchange, SSE framing, all three protocols, citations, tool fragments, signed provider continuation, context budgets and import rollback.
- React interaction tests mount the real ChatView under StrictMode with mocked Raycast controls and provider services. They cover persistent input, visible transcript, sending without navigation, draft preservation during streaming, queued context, Stop, development remounts, model switching, editing branches, restored drafts and cancellation of summaries.
- The MCP test uses an actual local HTTP JSON-RPC fixture and the official client SDK. It verifies discovery, the model/tool/result loop, explicit approval, decline and default denial.

The React tests use a renderer for Raycast's component contracts. They are not native window acceptance tests. They emit a react-test-renderer deprecation warning; it is a development-only dependency.

## Live Windows checks

- The current API client discovers three models through the existing authenticated ChatMock 1.40 installation.
- `gpt-5.6-sol` returned the exact answer `Relay audit OK`.
- Managed web search used Responses, streamed 25 updates, and returned a source annotation linking to the official Raycast AI Chat manual.
- A real image-input request described the replacement icon as two interlocking blue/purple speech bubbles.
- The previous live continuation check correctly used earlier conversation context.
- The old icon failed both Pillow verification and upstream image decoding. The replacement passes decoding and Raycast's 512×512 validation; attachment tests reject the damaged legacy file.
- The development watcher builds and loads all thirteen commands with `ray develop -t release` using Node 24.19.0.
- No user history was cleared or imported during testing; data tests use in-memory storage and disposable files. Existing ChatMock credentials were reused without being printed or exported.

Raycast still exposes no targetable window to Windows computer use, so no new native screenshot/interactive acceptance claim is made. Live Anthropic and other paid API accounts were not used; those adapters are tested through protocol fixtures. Folder merge tests are local, not a claim that a particular cloud service was exercised.

## Remaining release gates

- Full Store lint fails only on the inherited author handle `jonathan-geva`, which returns 404. A real author handle is requested from the user.
- Native Windows visual acceptance, native macOS/ARM acceptance and genuine Store screenshots remain pending.
- The CI workflow targets Windows and macOS with Node 24; its remote execution status must be checked after pushing the branch.
- Two low findings remain in Raycast's esbuild dependency. No forced incompatible transitive override is installed; the high-severity brace-expansion finding was resolved.
- The system Node is 22.13.1, below the required minimum. The bundled 24.19.0 runtime and `start-relay.ps1` provide a compatible development path on this PC.

See [RELEASE.md](RELEASE.md) for the native acceptance and Store checklist.
