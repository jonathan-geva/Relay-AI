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
import { AgentPreset, Project } from "./domain";
import { getAgents, getProjects, saveAgent, saveProject } from "./storage";
import { discoverTools } from "./mcp";
function Editor({
  kind,
  item,
  onSave,
}: {
  kind: string;
  item?: AgentPreset | Project;
  onSave: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [error, setError] = useState(""),
    [tools, setTools] = useState<string[]>([]);
  useEffect(() => {
    if (kind !== "agent") return;
    let active = true;
    void discoverTools()
      .then((t) => {
        if (active) setTools(t.map((t) => t.name));
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [kind]);
  return (
    <Form
      navigationTitle={`${item ? "Edit" : "Create"} ${kind === "agent" ? "Agent" : "Project"}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            onSubmit={async (v: {
              title: string;
              instruction: string;
              model: string;
              tools: string[];
            }) => {
              try {
                if (!v.title.trim()) throw new Error("Enter a name.");
                const base = {
                  id: item?.id || randomUUID(),
                  title: v.title.trim(),
                  instruction: v.instruction.trim(),
                  updatedAt: Date.now(),
                };
                if (kind === "agent")
                  await saveAgent({
                    ...base,
                    model: v.model.trim() || undefined,
                    toolNames: v.tools || [],
                  });
                else await saveProject(base);
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
        defaultValue={item?.title}
        error={error || undefined}
      />
      <Form.TextArea
        id="instruction"
        title="Shared Instructions"
        defaultValue={item?.instruction}
      />
      {kind === "agent" && (
        <>
          <Form.TextField
            id="model"
            title="Default Model (optional)"
            defaultValue={(item as AgentPreset)?.model}
          />
          <Form.TagPicker
            id="tools"
            title="Allowed MCP Tools"
            defaultValue={(item as AgentPreset)?.toolNames || []}
          >
            {tools.map((t) => (
              <Form.TagPicker.Item key={t} value={t} title={t} />
            ))}
          </Form.TagPicker>
          <Form.Description text="An agent is a saved instruction/model/tool preset. Turn on tools in Chat Settings to use its allowed tools; every call asks for confirmation. An empty tool list grants no tools." />
        </>
      )}
    </Form>
  );
}
export default function Organize() {
  const { push } = useNavigation();
  const [projects, setProjects] = useState<Project[]>([]),
    [agents, setAgents] = useState<AgentPreset[]>([]);
  async function refresh() {
    const [p, a] = await Promise.all([getProjects(), getAgents()]);
    setProjects(p);
    setAgents(a);
  }
  useEffect(() => {
    void refresh();
  }, []);
  const create = (
    <>
      <Action
        title="Create Project"
        icon={Icon.Plus}
        onAction={() => push(<Editor kind="project" onSave={refresh} />)}
      />
      <Action
        title="Create Agent"
        icon={Icon.Stars}
        onAction={() => push(<Editor kind="agent" onSave={refresh} />)}
      />
    </>
  );
  return (
    <List
      navigationTitle="Projects & Agents"
      searchBarPlaceholder="Search projects and agents…"
    >
      <List.EmptyView
        title="Give related work a home"
        description="Projects share instructions across chats. Agents save a model and allowed tools."
        actions={<ActionPanel>{create}</ActionPanel>}
      />
      {[
        { kind: "project", items: projects },
        { kind: "agent", items: agents },
      ].map((group) => (
        <List.Section
          key={group.kind}
          title={group.kind === "project" ? "Projects" : "Agents"}
        >
          {group.items.map((item) => (
            <List.Item
              key={item.id}
              title={item.title}
              subtitle={item.instruction.slice(0, 80)}
              icon={group.kind === "project" ? Icon.Folder : Icon.Stars}
              actions={
                <ActionPanel>
                  <Action
                    title="Edit"
                    icon={Icon.Pencil}
                    onAction={() =>
                      push(
                        <Editor
                          kind={group.kind}
                          item={item}
                          onSave={refresh}
                        />,
                      )
                    }
                  />
                  {create}
                  <Action
                    title="Delete"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={async () => {
                      if (
                        await confirmAlert({
                          title: `Delete ${item.title}?`,
                          primaryAction: { title: "Delete" },
                        })
                      ) {
                        const deleted = { ...item, deletedAt: Date.now() };
                        if (group.kind === "agent")
                          await saveAgent(deleted as AgentPreset);
                        else await saveProject(deleted);
                        await refresh();
                      }
                    }}
                  />
                  <Action.CopyToClipboard title="Copy ID" content={item.id} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
