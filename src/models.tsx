import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  chooseAvailableModel,
  fetchModels,
  getDefaultModel,
  resetDefaultModel,
  setDefaultModel,
} from "./api";
import {
  activeProviderId,
  favorites,
  getProviders,
  toggleFavorite,
} from "./providers";
import { ProviderProfile } from "./domain";
import { Compose } from "./compose";
import ProviderSettings from "./provider-settings";
import ChatMockSetup from "./setup-chatmock";
export default function Models() {
  const { push } = useNavigation();
  const [provider, setProvider] = useState(""),
    [profiles, setProfiles] = useState<ProviderProfile[]>([]),
    [models, setModels] = useState<string[]>([]),
    [current, setCurrent] = useState(""),
    [preferred, setPreferred] = useState<string[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([getProviders(), activeProviderId()])
      .then(([p, id]) => {
        if (active) {
          setProfiles(p);
          setProvider(id);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    if (!provider) return;
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      const [saved, fav] = await Promise.all([
        getDefaultModel(provider),
        favorites(provider),
      ]);
      if (active) {
        setCurrent(saved);
        setPreferred(fav);
      }
      try {
        const available = await fetchModels(provider);
        if (active) {
          setModels(available);
          const chosen = chooseAvailableModel(saved, available);
          setCurrent(chosen);
          if (chosen !== saved) await setDefaultModel(chosen, provider);
        }
      } catch (e) {
        if (active) {
          setModels([]);
          setError(String(e));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [provider, revision]);
  const connection = (
    <>
      <Action
        title="Provider Profiles"
        icon={Icon.Network}
        onAction={() =>
          push(<ProviderSettings />, () => setRevision((r) => r + 1))
        }
      />
      <Action
        title="Set up ChatMock"
        icon={Icon.Download}
        onAction={() =>
          push(<ChatMockSetup />, () => setRevision((r) => r + 1))
        }
      />
      <Action
        title="Refresh Models"
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={() => setRevision((r) => r + 1)}
      />
      <Action
        title="Open API Preferences"
        icon={Icon.Gear}
        onAction={openExtensionPreferences}
      />
    </>
  );
  return (
    <List
      navigationTitle="Models & Providers"
      isLoading={loading}
      searchBarPlaceholder="Search model IDs…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Provider"
          value={provider}
          onChange={setProvider}
        >
          {profiles.map((p) => (
            <List.Dropdown.Item key={p.id} value={p.id} title={p.title} />
          ))}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        title={error ? "Model discovery unavailable" : "No models returned"}
        description={error || "Your fallback model remains usable."}
        actions={
          <ActionPanel>
            <Action
              title="Chat with Fallback Model"
              onAction={() =>
                push(<Compose model={current} providerId={provider} />)
              }
            />
            {connection}
          </ActionPanel>
        }
      />
      {[true, false].map((favorite) => (
        <List.Section
          key={String(favorite)}
          title={favorite ? "Favorites" : "Available Models"}
        >
          {models
            .filter((m) => preferred.includes(m) === favorite)
            .map((m) => (
              <List.Item
                key={m}
                title={m}
                icon={
                  m === current
                    ? Icon.CheckCircle
                    : favorite
                      ? Icon.Star
                      : Icon.Stars
                }
                accessories={m === current ? [{ text: "Default" }] : []}
                actions={
                  <ActionPanel>
                    <Action
                      title="Set as Default"
                      onAction={async () => {
                        await setDefaultModel(m, provider);
                        setCurrent(m);
                        await showToast({
                          title: "Default model changed",
                          message: m,
                        });
                      }}
                    />
                    <Action
                      title="Start Chat with This Model"
                      icon={Icon.Message}
                      onAction={() =>
                        push(<Compose model={m} providerId={provider} />)
                      }
                    />
                    <Action
                      title={favorite ? "Remove Favorite" : "Favorite Model"}
                      icon={Icon.Star}
                      onAction={async () => {
                        await toggleFavorite(provider, m);
                        setPreferred(await favorites(provider));
                      }}
                    />
                    {connection}
                    <Action
                      title="Reset Default"
                      onAction={async () => {
                        await resetDefaultModel(provider);
                        setCurrent(await getDefaultModel(provider));
                      }}
                    />
                  </ActionPanel>
                }
              />
            ))}
        </List.Section>
      ))}
    </List>
  );
}
