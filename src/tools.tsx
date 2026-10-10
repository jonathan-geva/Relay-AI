import {
  Action,
  ActionPanel,
  confirmAlert,
  Form,
  Icon,
  List,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { randomUUID } from "node:crypto";
import { AvailableTool, discoverTools, getServers, saveServer } from "./mcp";
import { MCPServer } from "./domain";
function Editor({
  server,
  onSave,
}: {
  server?: MCPServer;
  onSave: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [error, setError] = useState("");
  return (
    <Form
      navigationTitle="MCP Server"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Server"
            onSubmit={async (v: {
              title: string;
              url: string;
              keyEnv: string;
            }) => {
              try {
                if (!v.title.trim()) throw new Error("Enter a name.");
                await saveServer({
                  id: server?.id || randomUUID(),
                  title: v.title.trim(),
                  url: v.url.trim(),
                  keyEnv: v.keyEnv.trim() || undefined,
                  updatedAt: Date.now(),
                });
                await onSave();
                pop();
              } catch (e) {
                setError(String(e));
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Name"
        defaultValue={server?.title}
        error={error || undefined}
      />
      <Form.TextField
        id="url"
        title="Streamable HTTP Endpoint"
        defaultValue={server?.url}
        placeholder="https://example.com/mcp"
      />
      <Form.TextField
        id="keyEnv"
        title="Bearer Token Environment Variable"
        defaultValue={server?.keyEnv}
      />
      <Form.Description text="Relay supports Streamable HTTP MCP servers. Tool discovery lists available tools. Turn tools on per chat; every proposed call shows its arguments and requires confirmation. Authentication must already be configured; OAuth sign-in and stdio servers are not handled here." />
    </Form>
  );
}
export default function Tools() {
  const { push } = useNavigation();
  const [servers, setServers] = useState<MCPServer[]>([]),
    [tools, setTools] = useState<AvailableTool[]>([]),
    [error, setError] = useState("");
  async function refresh() {
    setServers(await getServers());
  }
  useEffect(() => {
    void refresh();
  }, []);
  const create = (
    <Action
      title="Add MCP Server"
      icon={Icon.Plus}
      onAction={() => push(<Editor onSave={refresh} />)}
    />
  );
  return (
    <List navigationTitle="MCP Connections" isShowingDetail>
      <List.EmptyView
        title="Connect tools for your agents"
        description="Add an existing Streamable HTTP MCP server."
        actions={<ActionPanel>{create}</ActionPanel>}
      />
      <List.Section title="Servers">
        {servers.map((s) => (
          <List.Item
            key={s.id}
            title={s.title}
            icon={Icon.Network}
            detail={
              <List.Item.Detail
                markdown={`# ${s.title}\n\n${s.url}\n\n${error ? `Connection error: ${error}` : "Discover tools to inspect this connection. Chat tools remain off until you enable them."}`}
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title="Discover Tools"
                  onAction={async () => {
                    try {
                      setTools(await discoverTools());
                      setError("");
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                />
                <Action
                  title="Edit Server"
                  onAction={() => push(<Editor server={s} onSave={refresh} />)}
                />
                {create}
                <Action
                  title="Remove Server"
                  style={Action.Style.Destructive}
                  icon={Icon.Trash}
                  onAction={async () => {
                    if (
                      await confirmAlert({
                        title: `Remove ${s.title}?`,
                        primaryAction: { title: "Remove" },
                      })
                    ) {
                      await saveServer({ ...s, deletedAt: Date.now() });
                      await refresh();
                    }
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Available Tools">
        {tools.map((t) => (
          <List.Item
            key={t.name}
            title={t.originalName}
            subtitle={t.server.title}
            detail={
              <List.Item.Detail
                markdown={`# ${t.originalName}\n\n${t.description}\n\n\`\`\`json\n${JSON.stringify(t.parameters, null, 2)}\n\`\`\``}
              />
            }
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy Tool ID" content={t.name} />
                {create}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
