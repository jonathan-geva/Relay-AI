import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Icon,
  LocalStorage,
  open,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { join } from "node:path";
import {
  activateChatMock,
  chatMockManager,
  MANAGED_KEY,
  SETUP_DISMISSED_KEY,
} from "./chatmock";
import { CHATMOCK_VERSION } from "./chatmock-manager";
import { Compose } from "./compose";

export default function ChatMockSetup({
  onUseCustomApi,
}: {
  onUseCustomApi?: () => void;
} = {}) {
  const { pop, push } = useNavigation();
  const [status, setStatus] = useState({
    installed: false,
    session: false,
    running: false,
    enabled: false,
  });
  const [checking, setChecking] = useState(true);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  async function refresh() {
    const manager = chatMockManager();
    try {
      const [installed, session, running, enabled] = await Promise.all([
        manager.installed(),
        manager.hasSession(),
        manager.running(),
        LocalStorage.getItem<boolean>(MANAGED_KEY),
      ]);
      if (mounted.current)
        setStatus({ installed, session, running, enabled: Boolean(enabled) });
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setChecking(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      operation.current?.abort();
    };
  }, []);
  async function run(
    job: (
      signal: AbortSignal,
      update: (message: string) => void,
    ) => Promise<void>,
  ) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setProgress("Getting ready");
    setError("");
    try {
      await job(controller.signal, (message) => {
        if (mounted.current) setProgress(message);
      });
    } catch (e) {
      if (mounted.current)
        setError(
          controller.signal.aborted
            ? "Setup cancelled. Run setup again to continue."
            : e instanceof Error
              ? e.message
              : String(e),
        );
    } finally {
      operation.current = null;
      if (mounted.current) {
        setProgress("");
        await refresh();
      }
    }
  }
  const setup = () =>
    run(async (signal, update) => {
      const manager = chatMockManager();
      await manager.install(update, signal);
      signal.throwIfAborted();
      if (!(await manager.hasSession())) {
        update("Finish signing in in your browser");
        await manager.login(async (url) => {
          await open(url);
        }, signal);
      }
      signal.throwIfAborted();
      await manager.start(update, signal);
      signal.throwIfAborted();
      update("Checking the connection and choosing a model");
      const count = await activateChatMock();
      await showToast({
        style: Toast.Style.Success,
        title: "ChatMock is ready",
        message: `${count} models available`,
      });
    });
  const steps = [
    [
      status.installed,
      "Install ChatMock",
      "Python and ChatMock stay in Relay's folder. No terminal commands or administrator access needed.",
    ],
    [
      status.session,
      "Connect your account",
      "Relay opens ChatMock's browser sign-in when needed. Complete sign-in yourself; credentials are handled by ChatMock.",
    ],
    [
      status.running && status.enabled,
      "Start chatting",
      "Relay configures the local connection and selects an available model. The server restarts on demand after a reboot.",
    ],
  ] as const;
  const ready = status.enabled && status.running;
  return (
    <Detail
      navigationTitle="Set Up ChatMock"
      isLoading={checking || Boolean(progress)}
      markdown={`# ${ready ? "Your local connection is ready" : "Your AI, ready in a few steps"}\n\n${ready ? "Open a conversation and get to work. Relay will start ChatMock whenever you need it." : "Set up ChatMock once. Relay handles the downloads, Python environment, server, and connection settings."}\n\n${steps.map(([done, title, description], i) => `### ${done ? "✓" : `${i + 1}.`} ${title}\n\n${description}`).join("\n\n")}\n\n${progress ? `---\n\n**${progress}…**\n\nKeep this screen open while setup runs.` : ""}${error ? `\n\n---\n\n### Something needs attention\n\n${error}` : ""}\n\n---\n\nChatMock uses your ChatGPT account and its available models and limits. First setup downloads software from Astral's GitHub releases and PyPI. The server is accessible only on this computer and requires Relay's local access key. Your custom API preferences stay available.`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Connection">
            <Detail.Metadata.TagList.Item
              text={ready ? "Ready" : progress ? "Setting up" : "Not active"}
              color={ready ? Color.Green : Color.Orange}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label
            title="ChatMock"
            text={status.installed ? CHATMOCK_VERSION : "Not installed"}
          />
          <Detail.Metadata.Label
            title="Account"
            text={status.session ? "Saved session found" : "Sign-in needed"}
          />
          <Detail.Metadata.Label
            title="Server"
            text={status.running ? "Running" : "Stopped"}
          />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Address" text="127.0.0.1:8317" />
          <Detail.Metadata.Label
            title="Startup"
            text={status.enabled ? "On demand" : "Off"}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {progress ? (
            <Action
              title="Cancel Setup"
              icon={Icon.Stop}
              onAction={() => operation.current?.abort()}
            />
          ) : (
            <>
              {ready ? (
                <Action
                  title="Start Chatting"
                  icon={Icon.Message}
                  onAction={() => push(<Compose />)}
                />
              ) : (
                <Action
                  title={
                    status.installed
                      ? "Connect ChatMock"
                      : "Set up Automatically"
                  }
                  icon={Icon.Stars}
                  onAction={setup}
                />
              )}
              <Action
                title="Refresh Status"
                icon={Icon.ArrowClockwise}
                onAction={refresh}
              />
              {status.installed && (
                <Action
                  title="Sign in Again"
                  icon={Icon.Person}
                  onAction={() =>
                    run(async (signal, update) => {
                      const manager = chatMockManager();
                      update("Finish signing in in your browser");
                      await manager.login(async (url) => {
                        await open(url);
                      }, signal);
                      signal.throwIfAborted();
                      await manager.stop();
                      await manager.start(update, signal);
                      await activateChatMock();
                    })
                  }
                />
              )}
              {status.running && (
                <Action
                  title="Stop Server and Use Custom API"
                  icon={Icon.Stop}
                  onAction={() =>
                    run(async () => {
                      await LocalStorage.setItem(MANAGED_KEY, false);
                      await chatMockManager().stop();
                    })
                  }
                />
              )}
              {status.enabled && !status.running && (
                <Action
                  title="Use Custom API Preferences"
                  icon={Icon.Gear}
                  onAction={async () => {
                    await LocalStorage.setItem(MANAGED_KEY, false);
                    await refresh();
                  }}
                />
              )}
              {!status.enabled && (
                <Action
                  title="Use My Custom API Instead"
                  icon={Icon.Gear}
                  onAction={async () => {
                    await LocalStorage.setItem(SETUP_DISMISSED_KEY, true);
                    if (onUseCustomApi) onUseCustomApi();
                    else pop();
                  }}
                />
              )}
              {status.installed && (
                <Action.ShowInFinder
                  title="Show ChatMock Files"
                  path={chatMockManager().root}
                />
              )}
              {status.installed && (
                <Action.Open
                  title="Open Server Log"
                  target={join(chatMockManager().root, "server.log")}
                />
              )}
              <Action
                title="Reset Setup Lock"
                icon={Icon.ArrowCounterClockwise}
                onAction={async () => {
                  try {
                    await chatMockManager().resetLock();
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              />
              <Action.OpenInBrowser
                title="About ChatMock"
                url="https://github.com/RayBytes/ChatMock"
              />
            </>
          )}
        </ActionPanel>
      }
    />
  );
}
