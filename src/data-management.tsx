import {
  Action,
  ActionPanel,
  confirmAlert,
  environment,
  Form,
  Icon,
  LocalStorage,
  showToast,
  Toast,
} from "@raycast/api";
import { useState } from "react";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PortableData, Prompt } from "./domain";
import { exportData, importData, historyEnabled } from "./storage";
import { mergeSyncFolder, readBackup, writeExport } from "./data-files";
export async function sharePrompt(prompt: Prompt) {
  const data: PortableData = {
    format: "relay-ai",
    version: 2,
    exportedAt: Date.now(),
    conversations: [],
    prompts: [prompt],
    projects: [],
    agents: [],
  };
  const path = await writeExport(
    join(environment.supportPath, "exports"),
    `prompt-${prompt.id.replace(/[^\w-]/g, "_")}.json`,
    JSON.stringify(data, null, 2),
  );
  await showToast({
    style: Toast.Style.Success,
    title: "Prompt exported",
    message: path,
  });
}
export async function syncFolder(folder: string) {
  await mkdir(folder, { recursive: true });
  const local = await exportData();
  const merged = await mergeSyncFolder(folder, local);
  await importData(merged);
  let id = await LocalStorage.getItem<string>("relay-sync-device");
  if (!id) {
    id = randomUUID();
    await LocalStorage.setItem("relay-sync-device", id);
  }
  await writeExport(
    folder,
    `relay-${id}.json`,
    JSON.stringify({ ...merged, exportedAt: Date.now() }, null, 2),
  );
  return merged;
}
export async function autoSync() {
  if (!historyEnabled()) return;
  const folder = await LocalStorage.getItem<string>("relay-sync-folder"),
    enabled = await LocalStorage.getItem<boolean>("relay-sync-auto");
  if (folder && enabled) await syncFolder(folder);
}
export default function DataManagement() {
  const [mode, setMode] = useState("export"),
    [incoming, setIncoming] = useState<PortableData>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Form
      navigationTitle="Backup, Restore & Sync"
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={
              mode === "export"
                ? "Export Backup"
                : mode === "import"
                  ? "Import Previewed Data"
                  : "Merge and Sync Folder"
            }
            icon={Icon.Download}
            onSubmit={async (v: {
              folder: string[];
              automatic: boolean;
              file: string[];
            }) => {
              setBusy(true);
              setError("");
              try {
                if (mode === "export") {
                  const data = await exportData();
                  const path = await writeExport(
                    v.folder[0] || join(environment.supportPath, "exports"),
                    `relay-backup-${Date.now()}.json`,
                    JSON.stringify(data, null, 2),
                  );
                  await showToast({
                    style: Toast.Style.Success,
                    title: "Backup exported",
                    message: path,
                  });
                } else if (mode === "import") {
                  if (!incoming)
                    throw new Error(
                      "Choose and preview a valid Relay backup first.",
                    );
                  if (
                    !(await confirmAlert({
                      title: "Merge this backup into Relay?",
                      message:
                        "Newer versions of matching records replace older ones. Deleted records stay deleted. A local recovery backup is saved first.",
                      primaryAction: { title: "Import" },
                    }))
                  )
                    return;
                  await writeExport(
                    join(environment.supportPath, "backups"),
                    `relay-before-import-${Date.now()}.json`,
                    JSON.stringify(await exportData()),
                  );
                  await importData(incoming);
                  await showToast({ title: "Backup imported" });
                } else {
                  const folder = v.folder[0];
                  if (!folder)
                    throw new Error(
                      "Choose a folder managed by your sync service.",
                    );
                  await syncFolder(folder);
                  await LocalStorage.setItem("relay-sync-folder", folder);
                  await LocalStorage.setItem("relay-sync-auto", v.automatic);
                  await showToast({
                    title: "Sync complete",
                    message: "Latest records merged; keys stay on this device.",
                  });
                }
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          />
          <Action
            title="Disable Automatic Sync"
            icon={Icon.Stop}
            onAction={async () => {
              await LocalStorage.setItem("relay-sync-auto", false);
              await showToast({ title: "Automatic sync disabled" });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="mode"
        title="Operation"
        value={mode}
        onChange={setMode}
      >
        <Form.Dropdown.Item value="export" title="Export JSON Backup" />
        <Form.Dropdown.Item
          value="import"
          title="Import Backup or Shared Prompt"
        />
        <Form.Dropdown.Item value="sync" title="Synced Folder" />
      </Form.Dropdown>
      {mode === "import" ? (
        <Form.FilePicker
          id="file"
          title="Relay JSON File"
          allowMultipleSelection={false}
          error={error || undefined}
          onChange={(paths) => {
            setIncoming(undefined);
            setError("");
            if (paths[0])
              void readBackup(paths[0])
                .then(setIncoming)
                .catch((e) => setError(String(e)));
          }}
        />
      ) : (
        <Form.FilePicker
          id="folder"
          title="Destination Folder"
          canChooseDirectories
          canChooseFiles={false}
          allowMultipleSelection={false}
          error={error || undefined}
        />
      )}
      {incoming && mode === "import" && (
        <Form.Description
          title="Preview"
          text={`${incoming.conversations.length} conversations · ${incoming.prompts.length} prompts · ${incoming.projects.length} projects · ${incoming.agents.length} agents. Nothing changes until you import.`}
        />
      )}
      {mode === "sync" && (
        <Form.Checkbox
          id="automatic"
          label="Sync when the workspace opens and after chats are saved"
          defaultValue={false}
        />
      )}
      <Form.Description
        text={
          mode === "sync"
            ? "Choose a folder synced by OneDrive, Dropbox, iCloud Drive or another service already configured on your devices. Each device writes its own file. Newer record versions win; deletion markers prevent deleted chats from reappearing. Conversation text, attachments, prompts, projects and agents are included. Provider keys and account sessions are excluded. This is folder-based exchange, not a hosted Relay account."
            : "Backups contain conversation text, thinking, attachments, prompts, projects and agents. Provider keys and account sessions are excluded. Version and every record are validated before import."
        }
      />
    </Form>
  );
}
