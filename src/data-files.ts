import {
  mkdir,
  readFile,
  readdir,
  lstat,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PortableData, parsePortable, mergeRecords } from "./domain";
export async function writeExport(folder: string, name: string, text: string) {
  if (basename(name) !== name || !name)
    throw new Error("Invalid export filename.");
  await mkdir(folder, { recursive: true });
  const target = join(resolve(folder), name),
    temporary = target + `.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: "wx" });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return target;
}
export async function readBackup(path: string): Promise<PortableData> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 50 * 1024 * 1024)
    throw new Error("Choose a regular Relay JSON file below 50 MB.");
  return parsePortable(await readFile(path, "utf8"));
}
export async function mergeSyncFolder(
  folder: string,
  local: PortableData,
): Promise<PortableData> {
  const names = (await readdir(folder)).filter((n) =>
    /^relay-[a-f0-9-]+\.json$/.test(n),
  );
  if (names.length > 100)
    throw new Error("The sync folder contains too many device files.");
  let data = local;
  for (const name of names) {
    const incoming = await readBackup(join(folder, name));
    data = {
      ...data,
      conversations: mergeRecords(data.conversations, incoming.conversations),
      prompts: mergeRecords(data.prompts, incoming.prompts),
      projects: mergeRecords(data.projects, incoming.projects),
      agents: mergeRecords(data.agents, incoming.agents),
    };
  }
  return data;
}
