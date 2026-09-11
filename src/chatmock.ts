import { environment, LocalStorage } from "@raycast/api";
import { join } from "node:path";
import { ChatMockManager } from "./chatmock-manager";
export const MANAGED_KEY = "chatmock-managed-enabled";
export function chatMockManager() {
  return new ChatMockManager(
    join(environment.supportPath, "chatmock"),
    join(environment.assetsPath, "chatmock-runner.py"),
  );
}
let starting: Promise<void> | undefined;
export async function managedConnection() {
  if (!(await LocalStorage.getItem<boolean>(MANAGED_KEY))) return undefined;
  const manager = chatMockManager();
  if (!starting)
    starting = manager.start().finally(() => {
      starting = undefined;
    });
  await starting;
  return { baseUrl: manager.baseUrl, apiKey: await manager.token() };
}
export async function activateChatMock() {
  const manager = chatMockManager();
  const response = await fetch(`${manager.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${await manager.token()}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `ChatMock returned an error (${response.status}). Try signing in again.`,
    );
  const body = (await response.json()) as { data?: { id?: string }[] };
  const models = (body.data || [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!models.length)
    throw new Error(
      "ChatMock is running but returned no models. Try signing in again, then retry setup.",
    );
  const stored = await LocalStorage.getItem<string>("chatmock-default-model");
  if (!stored || !models.includes(stored))
    await LocalStorage.setItem("chatmock-default-model", models[0]);
  await LocalStorage.setItem(MANAGED_KEY, true);
  return models.length;
}
