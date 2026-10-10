# Release checklist

The feature implementation is ready for review; Store publication remains a separate release step.

1. Set the manifest author to the user's real Raycast account handle and run full Store lint.
2. Run CI on Windows and macOS. Successful compilation does not replace native interaction tests.
3. In Raycast, open Relay AI → New Conversation. Type directly in the message bar, send, and reply while the latest answer or Full Transcript stays visible.
4. Type during a stream; queue a follow-up; stop/retry; change model; hide/show thinking. Confirm drafts, partial text and cancellation behave as expected.
5. Run Quick Ask, selection, writing and clipboard commands from fresh root-search windows.
6. Create/edit/duplicate/run a variable prompt, test its quicklink, and export/import a disposable shared prompt.
7. Branch and edit a disposable conversation. Test archive/trash/restore, tags and project/agent instructions. Preserve existing user history.
8. Preview text and image files, then send to a capable provider. Test source links and web search. Copy and paste a response.
9. Use a configured test MCP server. Confirm allowed calls execute, declined calls do not, and failures remain readable.
10. Export/import a disposable backup; test a malformed file; test two devices in a chosen sync folder. Check that keys and account sessions never appear in portable data.
11. Test ChatMock restart, pinned repair/update, login handoff, cancellation and occupied-port recovery.
12. Repeat native acceptance on supported Windows/macOS architectures before publication.

Capture genuine Store screenshots from the running app:

- Continuous chat: message bar with a draft and the latest answer visible.
- Full transcript and the timeline, with model selection.
- Prompt Library with a custom preset and variable fields.
- Workspace with projects, pins, archive/trash and data controls.
- Provider settings and MCP connection settings, with secret fields empty.

Mockups should not be submitted as proof of native acceptance. Publish only after the author identity, platform checks and screenshots are complete.
