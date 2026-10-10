import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { createHash } from "node:crypto";
import { managedConnection, MANAGED_KEY } from "./chatmock";
import type { ProviderProfile } from "./domain";
type Preferences = {
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  systemPrompt?: string;
};
export type Connection = ProviderProfile & {
  apiKey?: string;
  fingerprint: string;
  managed?: boolean;
};
export function providerFingerprint(
  p: Pick<ProviderProfile, "kind" | "baseUrl">,
) {
  return createHash("sha256")
    .update(`${p.kind}:${p.baseUrl.trim().replace(/\/+$/, "")}`)
    .digest("hex")
    .slice(0, 24);
}
export function validateProvider(p: ProviderProfile) {
  const url = new URL(p.baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use a plain HTTP or HTTPS API base URL without credentials, query parameters or a fragment.",
    );
  if (!p.title.trim() || !p.defaultModel.trim())
    throw new Error("A provider name and fallback model are required.");
  return { ...p, baseUrl: p.baseUrl.trim().replace(/\/+$/, "") };
}
export async function getProviders(): Promise<ProviderProfile[]> {
  const p = getPreferenceValues<Preferences>();
  const items = await LocalStorage.allItems();
  const saved: ProviderProfile[] = [];
  for (const [key, raw] of Object.entries(items))
    if (key.startsWith("relay-provider:") && typeof raw === "string") {
      try {
        const v = JSON.parse(raw) as ProviderProfile;
        if (
          v.id &&
          v.capabilities &&
          ["chat-completions", "responses", "anthropic"].includes(v.kind) &&
          !v.deletedAt
        )
          saved.push(validateProvider(v));
      } catch {
        /* Ignore damaged profiles without deleting them. */
      }
    }
  return [
    {
      id: "managed",
      title: "Managed ChatMock",
      kind: "chat-completions",
      baseUrl: "http://127.0.0.1:8317/v1",
      defaultModel: "gpt-5.6-sol",
      capabilities: {
        images: true,
        reasoning: true,
        webSearch: true,
        tools: true,
      },
      updatedAt: 0,
    },
    {
      id: "preferences",
      title: "Custom API Preferences",
      kind: "chat-completions",
      baseUrl: p.baseUrl.trim().replace(/\/+$/, ""),
      defaultModel: p.defaultModel,
      capabilities: {
        images: false,
        reasoning: false,
        webSearch: false,
        tools: false,
      },
      updatedAt: 0,
    },
    ...saved,
  ];
}
export async function activeProviderId() {
  return (
    (await LocalStorage.getItem<string>("relay-active-provider")) ||
    ((await LocalStorage.getItem<boolean>(MANAGED_KEY))
      ? "managed"
      : "preferences")
  );
}
export async function resolveConnection(id?: string): Promise<Connection> {
  id ||= await activeProviderId();
  const profile = (await getProviders()).find((v) => v.id === id);
  if (!profile)
    throw new Error(
      "This provider profile is unavailable. Choose another provider.",
    );
  let apiKey: string | undefined;
  if (id === "managed") {
    if (!(await LocalStorage.getItem<boolean>(MANAGED_KEY)))
      throw new Error("Open Set Up ChatMock to connect your account first.");
    const managed = await managedConnection();
    apiKey = managed?.apiKey;
  } else if (id === "preferences")
    apiKey = getPreferenceValues<Preferences>().apiKey;
  else
    apiKey = profile.keyEnv
      ? process.env[profile.keyEnv]
      : await LocalStorage.getItem<string>("relay-provider-secret:" + id);
  return {
    ...profile,
    apiKey,
    fingerprint: providerFingerprint(profile),
    managed: id === "managed",
  };
}
export async function setActiveProvider(id: string) {
  await LocalStorage.setItem("relay-active-provider", id);
}
export async function saveProvider(p: ProviderProfile, apiKey?: string) {
  p = validateProvider(p);
  await LocalStorage.setItem(
    "relay-provider:" + p.id,
    JSON.stringify({ ...p, updatedAt: Date.now() }),
  );
  if (apiKey !== undefined)
    await LocalStorage.setItem("relay-provider-secret:" + p.id, apiKey);
}
export async function removeProvider(p: ProviderProfile) {
  await LocalStorage.setItem(
    "relay-provider:" + p.id,
    JSON.stringify({ ...p, deletedAt: Date.now() }),
  );
  await LocalStorage.removeItem("relay-provider-secret:" + p.id);
  if ((await activeProviderId()) === p.id)
    await LocalStorage.removeItem("relay-active-provider");
}
export function globalInstruction() {
  return getPreferenceValues<Preferences>().systemPrompt?.trim() || "";
}
export async function favorites(providerId: string): Promise<string[]> {
  const raw = await LocalStorage.getItem<string>(
    "relay-favorites:" + providerId,
  );
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}
export async function toggleFavorite(providerId: string, model: string) {
  const current = await favorites(providerId);
  await LocalStorage.setItem(
    "relay-favorites:" + providerId,
    JSON.stringify(
      current.includes(model)
        ? current.filter((m) => m !== model)
        : [...current, model],
    ),
  );
}
