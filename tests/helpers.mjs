import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export async function bundle(
  contents,
  mock = "",
  extraPlugins = [],
  external = [],
) {
  const directory = await mkdtemp(join(tmpdir(), "relay-feature-"));
  const result = await build({
    stdin: { contents, resolveDir: process.cwd() },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    external,
    plugins: [
      {
        name: "mock-raycast",
        setup(b) {
          b.onResolve({ filter: /^@raycast\/api$/ }, () => ({
            path: "raycast",
            namespace: "test",
          }));
          b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents:
              mock ||
              `export const environment = { supportPath: "", assetsPath: "" }; export const getPreferenceValues = () => globalThis.__featurePreferences; export const LocalStorage = globalThis.__featureStorage;`,
          }));
        },
      },
      ...extraPlugins,
    ],
  });
  const path = join(directory, "bundle.cjs");
  await writeFile(path, result.outputFiles[0].text);
  const api = require(path);
  return {
    api,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
export function memoryStorage(items = new Map()) {
  return {
    getItem: async (k) => items.get(k),
    setItem: async (k, v) => {
      items.set(k, v);
    },
    removeItem: async (k) => {
      items.delete(k);
    },
    allItems: async () => Object.fromEntries(items),
    items,
  };
}
