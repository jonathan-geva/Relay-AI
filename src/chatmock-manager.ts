import { createHash, randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  open,
  readFile,
  writeFile,
  access,
} from "node:fs/promises";
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
export const CHATMOCK_VERSION = "1.40";
const UV_VERSION = "0.12.13";
const assets: Record<string, { target: string; sha: string }> = {
  "win32-x64": {
    target: "x86_64-pc-windows-msvc.zip",
    sha: "a86c9dc7bad9b03f388583b7187c05fe9951c2e0d392217e8fd43d97787f6ec2",
  },
  "win32-arm64": {
    target: "aarch64-pc-windows-msvc.zip",
    sha: "1efb2654b06e7063d4ac1fc9d49a9bda9a6704d82f035b589a2751a592f14151",
  },
  "darwin-arm64": {
    target: "aarch64-apple-darwin.tar.gz",
    sha: "7e6ddb9316acc00f2296c82ff4d99977870ee34b2f0ddcae9444d714db9364ed",
  },
  "darwin-x64": {
    target: "x86_64-apple-darwin.tar.gz",
    sha: "5e287ef61cb6a9b61b3a83fef124fd143e400468a7dac794230147a810e17119",
  },
};
export function installerAsset(
  platform = process.platform,
  arch: string = process.arch,
) {
  const asset = assets[`${platform}-${arch}`];
  if (!asset)
    throw new Error(
      "Automatic setup supports Windows and macOS on Intel and ARM.",
    );
  return {
    ...asset,
    url: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${asset.target}`,
  };
}
export function verifyDownload(data: Uint8Array, expected: string) {
  if (createHash("sha256").update(data).digest("hex") !== expected)
    throw new Error(
      "Installer verification failed. Nothing was executed. Try setup again.",
    );
}
export function loginUrl(text: string): string | undefined {
  for (const match of text.matchAll(/https:\/\/[^\s]+/g)) {
    try {
      const url = new URL(match[0]);
      if (
        url.hostname === "auth.openai.com" &&
        url.pathname === "/oauth/authorize"
      )
        return url.toString();
    } catch {
      /* Wait for a complete URL. */
    }
  }
}
export type Progress = (message: string) => void;
export class ChatMockManager {
  readonly baseUrl: string;
  readonly python: string;
  constructor(
    readonly root: string,
    readonly runner: string,
    readonly port = 8317,
  ) {
    this.baseUrl = `http://127.0.0.1:${port}/v1`;
    this.python = join(
      root,
      "venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
  }
  private env() {
    return {
      ...process.env,
      CHATGPT_LOCAL_HOME: join(this.root, "account"),
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
      UV_PYTHON_INSTALL_DIR: join(this.root, "python"),
      UV_CACHE_DIR: join(this.root, "cache"),
      UV_NO_MODIFY_PATH: "1",
    };
  }
  private async locked<T>(job: () => Promise<T>): Promise<T> {
    await mkdir(this.root, { recursive: true });
    const path = join(this.root, "setup.lock");
    let file;
    try {
      file = await open(path, "wx");
    } catch {
      throw new Error(
        "Another ChatMock operation is in progress. Wait for it to finish. If Raycast crashed, use Reset Setup Lock.",
      );
    }
    try {
      await file.writeFile(String(process.pid));
      return await job();
    } finally {
      await file.close();
      const { unlink } = await import("node:fs/promises");
      await unlink(path).catch(() => undefined);
    }
  }
  async resetLock() {
    const path = join(this.root, "setup.lock");
    let pid: number;
    try {
      pid = Number(await readFile(path, "utf8"));
    } catch {
      return;
    }
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        throw new Error(
          "Setup is still running. Wait or cancel it before resetting.",
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
      }
    } else {
      throw new Error(
        "The setup lock is incomplete. Restart Raycast and try again.",
      );
    }
    const { unlink } = await import("node:fs/promises");
    await unlink(path);
  }
  async installed(): Promise<boolean> {
    try {
      const { stdout } = await exec(
        this.python,
        ["-c", "from chatmock.version import __version__; print(__version__)"],
        { env: this.env(), windowsHide: true, timeout: 15000 },
      );
      return stdout.trim() === CHATMOCK_VERSION;
    } catch {
      return false;
    }
  }
  async token(): Promise<string> {
    const file = join(this.root, "server-token");
    const readToken = async () => {
      // Another command may have created the file and still be writing it.
      for (let attempt = 0; attempt < 20; attempt++) {
        const value = (await readFile(file, "utf8")).trim();
        if (/^[a-f0-9]{64}$/.test(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(
        "Relay's local access key is invalid. Open the ChatMock files folder to inspect the installation.",
      );
    };
    try {
      return await readToken();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    await mkdir(this.root, { recursive: true });
    const token = randomBytes(32).toString("hex");
    try {
      await writeFile(file, token, { flag: "wx", mode: 0o600 });
      return token;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        return await readToken();
      throw e;
    }
  }
  async running(): Promise<boolean> {
    try {
      const token = await readFile(join(this.root, "server-token"), "utf8");
      const response = await fetch(
        `${this.baseUrl.replace(/\/v1$/, "")}/relay/health`,
        {
          headers: { Authorization: `Bearer ${token.trim()}` },
          signal: AbortSignal.timeout(1500),
        },
      );
      if (!response.ok) return false;
      const body = (await response.json()) as { service?: string };
      return body.service === "relay-chatmock";
    } catch {
      return false;
    }
  }
  async hasSession(): Promise<boolean> {
    if (!(await this.installed())) return false;
    const { stdout } = await exec(this.python, [this.runner, "status"], {
      env: this.env(),
      windowsHide: true,
      timeout: 15000,
    });
    return stdout.trim() === "ready";
  }
  async install(progress: Progress, signal?: AbortSignal) {
    return this.locked(async () => {
      if (await this.installed()) {
        progress("ChatMock is installed");
        return;
      }
      const asset = installerAsset();
      const bin = join(this.root, `uv-${UV_VERSION}`);
      await mkdir(bin, { recursive: true });
      progress("Downloading the verified installer");
      const response = await fetch(asset.url, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(180000)])
          : AbortSignal.timeout(180000),
      });
      if (!response.ok)
        throw new Error(
          `Installer download failed (${response.status}). Check your connection and retry.`,
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      verifyDownload(bytes, asset.sha);
      const archive = join(
        bin,
        asset.target.endsWith("zip") ? "download.zip" : "download.tar.gz",
      );
      await writeFile(archive, bytes);
      await exec(
        process.platform === "win32"
          ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
          : "/usr/bin/tar",
        ["-xf", archive, "-C", bin],
        { windowsHide: true, timeout: 30000, signal },
      );
      const uv =
        process.platform === "win32"
          ? join(bin, "uv.exe")
          : join(bin, `uv-${asset.target.replace(/\.tar\.gz$/, "")}`, "uv");
      await access(uv);
      if (process.platform !== "win32") await chmod(uv, 0o700);
      progress("Installing Python in Relay's folder");
      await exec(
        uv,
        [
          "venv",
          "--python",
          "3.12",
          "--managed-python",
          "--allow-existing",
          join(this.root, "venv"),
        ],
        { env: this.env(), windowsHide: true, timeout: 300000, signal },
      );
      progress("Installing ChatMock and its dependencies");
      await exec(
        uv,
        [
          "pip",
          "install",
          "--python",
          this.python,
          "--index-url",
          "https://pypi.org/simple",
          `chatmock==${CHATMOCK_VERSION}`,
        ],
        { env: this.env(), windowsHide: true, timeout: 300000, signal },
      );
      if (!(await this.installed()))
        throw new Error(
          "ChatMock installation could not be verified. Retry setup.",
        );
    });
  }
  async login(onUrl: (url: string) => Promise<void>, signal?: AbortSignal) {
    return this.locked(
      () =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(this.python, [this.runner, "login"], {
            env: this.env(),
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
          let buffer = "",
            opened = false,
            settled = false;
          const timer = setTimeout(() => {
            child.kill();
            finish(new Error("Sign-in timed out. Try signing in again."));
          }, 600000);
          const abort = () => {
            child.kill();
            finish(new Error("Sign-in cancelled."));
          };
          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            if (error) reject(error);
            else resolve();
          };
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) abort();
          const read = (data: Buffer) => {
            if (settled) return;
            buffer = (buffer + data.toString("utf8")).slice(-16000);
            const newline = buffer.lastIndexOf("\n");
            const url = loginUrl(buffer.slice(0, newline));
            if (url && !opened) {
              opened = true;
              void onUrl(url).catch(() => {
                child.kill();
                finish(
                  new Error("Could not open the sign-in page. Try again."),
                );
              });
            }
          };
          child.stdout.on("data", read);
          child.stderr.on("data", read);
          child.on("error", () =>
            finish(new Error("Could not start sign-in. Run setup again.")),
          );
          child.on("close", (code) =>
            finish(
              code === 0
                ? undefined
                : new Error(
                    "Sign-in did not complete. Close any other ChatMock sign-in, then retry.",
                  ),
            ),
          );
        }),
    );
  }
  async start(progress: Progress = () => {}, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (await this.running()) return;
    return this.locked(async () => {
      if (await this.running()) return;
      if (!(await this.installed()))
        throw new Error("Open Set Up ChatMock to install the local server.");
      progress("Starting your local server");
      await this.token();
      signal?.throwIfAborted();
      const log = openSync(join(this.root, "server.log"), "w", 0o600);
      let child: ReturnType<typeof spawn> | undefined;
      let healthy = false;
      try {
        child = spawn(
          this.python,
          [
            this.runner,
            "serve",
            "--port",
            String(this.port),
            "--token-file",
            join(this.root, "server-token"),
          ],
          {
            env: this.env(),
            detached: true,
            windowsHide: true,
            stdio: ["ignore", log, log],
          },
        );
        await new Promise<void>((resolve, reject) => {
          child!.once("spawn", resolve);
          child!.once("error", reject);
        });
        for (let i = 0; i < 40; i++) {
          signal?.throwIfAborted();
          if (child.exitCode !== null) break;
          if (await this.running()) {
            healthy = true;
            child.unref();
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error(
          `ChatMock could not start on port ${this.port}. Another app may be using it. See the server log for details.`,
        );
      } finally {
        closeSync(log);
        if (!healthy) child?.kill();
      }
    });
  }
  async stop() {
    if (!(await this.running())) return;
    const response = await fetch(
      `${this.baseUrl.replace(/\/v1$/, "")}/relay/stop`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await this.token()}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      throw new Error("Could not stop Relay's ChatMock server.");
    for (let i = 0; i < 20; i++) {
      if (!(await this.running())) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("ChatMock has not stopped yet. Try refreshing status.");
  }
}
