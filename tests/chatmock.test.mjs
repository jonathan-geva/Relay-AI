import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
const directory = await mkdtemp(join(tmpdir(), "relay-setup-test-"));
const output = await build({
  entryPoints: ["src/chatmock-manager.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const entry = join(directory, "manager.cjs");
await writeFile(entry, output.outputFiles[0].text);
const { ChatMockManager, installerAsset, verifyDownload, loginUrl } =
  createRequire(import.meta.url)(entry);
try {
  await test("setup chooses a pinned, checksummed installer for each supported platform", () => {
    for (const platform of ["win32", "darwin"])
      for (const arch of ["x64", "arm64"]) {
        const asset = installerAsset(platform, arch);
        assert.match(
          asset.url,
          /^https:\/\/github.com\/astral-sh\/uv\/releases\/download\/0\.12\.13\//,
        );
        assert.match(asset.sha, /^[a-f0-9]{64}$/);
      }
    assert.throws(
      () => installerAsset("linux", "x64"),
      /supports Windows and macOS/,
    );
  });
  await test("tampered downloads are rejected before extraction", () => {
    const data = Buffer.from("trusted data");
    const hash = createHash("sha256").update(data).digest("hex");
    assert.doesNotThrow(() => verifyDownload(data, hash));
    assert.throws(
      () => verifyDownload(Buffer.from("tampered"), hash),
      /verification failed/,
    );
  });
  await test("sign-in opens only the expected HTTPS authorization page", () => {
    assert.equal(
      loginUrl("Visit https://auth.openai.com/oauth/authorize?state=test\n"),
      "https://auth.openai.com/oauth/authorize?state=test",
    );
    for (const url of [
      "https://evil.test/oauth/authorize",
      "https://auth.openai.com.evil.test/oauth/authorize",
      "http://auth.openai.com/oauth/authorize",
      "https://auth.openai.com/unrelated",
    ])
      assert.equal(loginUrl(url), undefined);
  });
  await test("the server key is stable across concurrent requests", async () => {
    const manager = new ChatMockManager(join(directory, "keys"), "unused.py");
    const [a, b] = await Promise.all([manager.token(), manager.token()]);
    assert.match(a, /^[a-f0-9]{64}$/);
    assert.equal(a, b);
  });
  await test("repeat installation skips downloads and releases its lock", async () => {
    const root = join(directory, "installed");
    const manager = new ChatMockManager(root, "unused.py");
    manager.installed = async () => true;
    const steps = [];
    await manager.install((step) => steps.push(step));
    await manager.install(() => {});
    assert.deepEqual(steps, ["ChatMock is installed"]);
    await assert.rejects(access(join(root, "setup.lock")));
  });
  await test("a running setup cannot be overwritten or have its lock reset", async () => {
    const root = join(directory, "locked");
    const manager = new ChatMockManager(root, "unused.py");
    await manager.token();
    await writeFile(join(root, "setup.lock"), String(process.pid));
    await assert.rejects(
      manager.install(() => {}),
      /Another ChatMock operation/,
    );
    await assert.rejects(manager.resetLock(), /still running/);
  });
  await test("unrelated local services are not treated as Relay or stopped", async () => {
    let stops = 0;
    const server = createServer((req, res) => {
      if (req.method === "POST") stops++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ service: "another-app" }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const manager = new ChatMockManager(
        join(directory, "foreign"),
        "unused.py",
        server.address().port,
      );
      await manager.token();
      assert.equal(await manager.running(), false);
      await manager.stop();
      assert.equal(stops, 0);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
  await test("a cancelled start does not launch a process", async () => {
    const manager = new ChatMockManager(
      join(directory, "cancelled"),
      "unused.py",
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      manager.start(() => {}, controller.signal),
      { name: "AbortError" },
    );
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
