import { useEffect, useRef, useState } from "react";
import {
  FetchSubscription,
  GetClipboardText,
  GetConnectionStatus,
  GetLANAddresses,
  GetTrafficStats,
  GetXrayBinaryPath,
  OpenTelegramChannel,
  PingServer,
  SelectConfigFile,
  StartXray,
  StartXrayWithURI,
  StopXray,
  ValidateProxyURI,
  ValidateXrayConfig,
} from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/app";

interface TrafficStats {
  uploadBytes: number;
  downloadBytes: number;
  uploadBytesPerSecond: number;
  downloadBytesPerSecond: number;
}

type ConnectionMode = "proxy" | "lan" | "tunnel";
type PageId = "home" | "profiles" | "logs" | "settings" | "about";
type ThemeId = "blue" | "graphite" | "aurora" | "ember";

interface ConnectionNode {
  id: string;
  name: string;
  uri: string;
}

interface ConnectionProfile {
  id: string;
  name: string;
  subscriptionURL: string;
  configPath?: string;
  nodes: ConnectionNode[];
  selectedNodeId: string;
}

const storageKeys = {
  profiles: "zirgozar-profiles",
  selectedProfile: "zirgozar-selected-profile",
  theme: "zirgozar-theme",
  mode: "zirgozar-mode",
  proxyAddress: "zirgozar-address",
  lanAddress: "zirgozar-lan-address",
  lanPort: "zirgozar-lan-port",
};

const legacyStorageKeys = {
  profiles: "packet-drift-profiles",
  selectedProfile: "packet-drift-selected-profile",
  theme: "packet-drift-theme",
  mode: "packet-drift-mode",
  proxyAddress: "packet-drift-address",
  lanAddress: "packet-drift-lan-address",
  lanPort: "packet-drift-lan-port",
};

const themes: { id: ThemeId; name: string; color: string }[] = [
  { id: "blue", name: "Midnight blue", color: "#78aef8" },
  { id: "graphite", name: "Graphite", color: "#a8c9c4" },
  { id: "aurora", name: "Aurora", color: "#6bd4b2" },
  { id: "ember", name: "Ember", color: "#e9ae69" },
];

const pages: { id: PageId; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "profiles", label: "Profiles", icon: "layers" },
  { id: "logs", label: "Logs", icon: "list" },
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "about", label: "About", icon: "info" },
];

const emptyTraffic: TrafficStats = {
  uploadBytes: 0,
  downloadBytes: 0,
  uploadBytesPerSecond: 0,
  downloadBytesPerSecond: 0,
};

function readStorage(key: string, legacyKey: string, fallback: string) {
  try {
    const current = window.localStorage.getItem(key);
    if (current !== null) return current;
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy !== null) {
      window.localStorage.setItem(key, legacy);
      return legacy;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function readProfiles(): ConnectionProfile[] {
  try {
    const current = window.localStorage.getItem(storageKeys.profiles);
    const legacy = window.localStorage.getItem(legacyStorageKeys.profiles);
    const raw = current ?? legacy ?? "[]";
    if (current === null && legacy !== null) {
      window.localStorage.setItem(storageKeys.profiles, legacy);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): ConnectionProfile[] => {
      if (typeof item?.id !== "string" || typeof item?.name !== "string") return [];
      const nodes = Array.isArray(item.nodes)
        ? item.nodes.filter((node: ConnectionNode) =>
          typeof node?.id === "string" && typeof node?.name === "string" && typeof node?.uri === "string",
        )
        : [];
      if (nodes.length === 0 && typeof item.uri === "string" && item.uri.trim()) {
        nodes.push({
          id: `${item.id}-legacy`,
          name: typeof item.tag === "string" && item.tag ? item.tag : profileTagFromURI(item.uri),
          uri: item.uri,
        });
      }
      const configPath = typeof item.configPath === "string" ? item.configPath : "";
      if (nodes.length === 0 && !configPath) return [];
      const selectedNodeId = nodes.some((node: ConnectionNode) => node.id === item.selectedNodeId)
        ? item.selectedNodeId as string
        : nodes[0]?.id ?? "";
      return [{
        id: item.id,
        name: item.name,
        subscriptionURL: typeof item.subscriptionURL === "string" ? item.subscriptionURL : "",
        configPath,
        nodes,
        selectedNodeId,
      }];
    });
  } catch {
    return [];
  }
}

function configFileName(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "Xray configuration";
}

function profileTagFromURI(uri: string) {
  const value = uri.trim();
  if (value.toLowerCase().startsWith("vmess://")) {
    try {
      const payload = value.slice("vmess://".length).split("#", 1)[0];
      const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      const node = JSON.parse(new TextDecoder().decode(
        Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
      ));
      if (typeof node.ps === "string" && node.ps.trim()) return node.ps.trim();
    } catch {
      return "Server";
    }
  }
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.hash.slice(1)).trim() || "Server";
  } catch {
    return "Server";
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let amount = bytes / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 100 ? 0 : 1)} ${units[unit]}`;
}

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "home":
      return <svg {...common}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></svg>;
    case "layers":
      return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></svg>;
    case "list":
      return <svg {...common}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.2 1-.9 1.6-1.5-.5a8 8 0 0 1-1.7 1l-.3 1.6h-1.9l-.3-1.6a8 8 0 0 1-1.8-1l-1.5.5-.9-1.6 1.2-1a7 7 0 0 1 0-2l-1.2-1 .9-1.6 1.5.5a8 8 0 0 1 1.8-1l.3-1.6h1.9l.3 1.6a8 8 0 0 1 1.7 1l1.5-.5.9 1.6-1.2 1a7 7 0 0 1 0 2Z" /></svg>;
    case "info":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "check":
      return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

export function Dashboard() {
  const { connectionStatus, setConnectionStatus } = useAppStore();
  const [page, setPage] = useState<PageId>("home");
  const [profiles, setProfiles] = useState<ConnectionProfile[]>(readProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState(() =>
    readStorage(storageKeys.selectedProfile, legacyStorageKeys.selectedProfile, ""),
  );
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = readStorage(storageKeys.theme, legacyStorageKeys.theme, "blue");
    return themes.some((item) => item.id === saved) ? saved as ThemeId : "blue";
  });
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(() => {
    const mode = readStorage(storageKeys.mode, legacyStorageKeys.mode, "proxy");
    return mode === "lan" || mode === "tunnel" ? mode : "proxy";
  });
  const [proxyAddress, setProxyAddress] = useState(() =>
    readStorage(storageKeys.proxyAddress, legacyStorageKeys.proxyAddress, "127.0.0.1:10808"),
  );
  const [lanAddresses, setLanAddresses] = useState<string[]>([]);
  const [lanBindAddress, setLanBindAddress] = useState(() =>
    readStorage(storageKeys.lanAddress, legacyStorageKeys.lanAddress, ""),
  );
  const [lanPort, setLanPort] = useState(() =>
    readStorage(storageKeys.lanPort, legacyStorageKeys.lanPort, "10808"),
  );
  const [binaryPath, setBinaryPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"connecting" | "disconnecting" | "switching">("connecting");
  const [error, setError] = useState("");
  const [traffic, setTraffic] = useState<TrafficStats>(emptyTraffic);
  const [statsUnavailable, setStatsUnavailable] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorURI, setEditorURI] = useState("");
  const [editorConfigPath, setEditorConfigPath] = useState("");
  const [editorSubscriptionURL, setEditorSubscriptionURL] = useState("");
  const [editorNodes, setEditorNodes] = useState<ConnectionNode[]>([]);
  const [fetchingSubscription, setFetchingSubscription] = useState(false);
  const [validatingConfig, setValidatingConfig] = useState(false);
  const [pingingNodeId, setPingingNodeId] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ nodeId: string; latency: number | null } | null>(null);
  const refreshInFlight = useRef(false);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedNode = selectedProfile?.nodes.find((node) => node.id === selectedProfile.selectedNodeId) ?? null;
  const isRunning = connectionStatus === "running";
  const usesImportedConfig = Boolean(selectedProfile?.configPath);
  const isLanPortValid = /^\d+$/.test(lanPort) && Number(lanPort) >= 1 && Number(lanPort) <= 65535;

  async function refreshDashboard() {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const status = await GetConnectionStatus();
      setConnectionStatus(status);
      if (status !== "running") {
        setTraffic(emptyTraffic);
        setStatsUnavailable(false);
        return;
      }
      try {
        setTraffic(await GetTrafficStats());
        setStatsUnavailable(false);
      } catch {
        setStatsUnavailable(true);
      }
    } catch (reason) {
      setConnectionStatus("unknown");
      setError(`Could not read the Xray connection state: ${String(reason)}`);
    } finally {
      refreshInFlight.current = false;
    }
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      const [pathResult, lanResult] = await Promise.allSettled([
        Promise.resolve().then(() => GetXrayBinaryPath()),
        Promise.resolve().then(() => GetLANAddresses()),
        refreshDashboard(),
      ]);
      if (!active) return;
      if (pathResult.status === "fulfilled") setBinaryPath(pathResult.value);
      else setError(`Could not locate the Xray executable: ${String(pathResult.reason)}`);
      if (lanResult.status === "fulfilled") {
        setLanAddresses(lanResult.value);
        setLanBindAddress((current) => lanResult.value.includes(current) ? current : lanResult.value[0] ?? "");
      } else {
        setError(`Could not list local network addresses: ${String(lanResult.reason)}`);
      }
      setLoading(false);
    }
    void initialize();
    const timer = window.setInterval(() => {
      if (active) void refreshDashboard();
    }, 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeys.profiles, JSON.stringify(profiles));
      window.localStorage.setItem(storageKeys.selectedProfile, selectedProfileId);
      window.localStorage.setItem(storageKeys.theme, theme);
      window.localStorage.setItem(storageKeys.mode, connectionMode);
      window.localStorage.setItem(storageKeys.proxyAddress, proxyAddress);
      window.localStorage.setItem(storageKeys.lanAddress, lanBindAddress);
      window.localStorage.setItem(storageKeys.lanPort, lanPort);
    } catch (reason) {
      setError(`Could not save local preferences: ${String(reason)}`);
    }
  }, [profiles, selectedProfileId, theme, connectionMode, proxyAddress, lanBindAddress, lanPort]);

  useEffect(() => {
    const runtimeWindow = window as Window & { runtime?: { EventsOnMultiple?: unknown } };
    if (typeof runtimeWindow.runtime?.EventsOnMultiple !== "function") return;
    return EventsOn("xray:log", (line: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setLogs((entries) => [...entries, `${timestamp}  ${line}`].slice(-500));
    });
  }, []);

  function startNewProfile() {
    setError("");
    setEditorName("");
    setEditorURI("");
    setEditorConfigPath("");
    setEditorSubscriptionURL("");
    setEditorNodes([]);
    setEditingProfileId("new");
  }

  function editProfile(profile: ConnectionProfile) {
    setError("");
    setEditorName(profile.name);
    setEditorURI("");
    setEditorConfigPath(profile.configPath ?? "");
    setEditorSubscriptionURL(profile.subscriptionURL);
    setEditorNodes(profile.nodes);
    setEditingProfileId(profile.id);
  }

  async function pasteEditorURI() {
    setError("");
    try {
      const text = await GetClipboardText();
      if (!text.trim()) {
        setError("The clipboard is empty.");
        return;
      }
      setEditorURI(text.trim());
      if (!editorName.trim()) setEditorName(profileTagFromURI(text.trim()));
    } catch (reason) {
      setError(`Could not read the clipboard: ${String(reason)}`);
    }
  }

  async function fetchEditorSubscription() {
    setError("");
    setFetchingSubscription(true);
    try {
      const imported = await FetchSubscription(editorSubscriptionURL.trim());
      if (imported.length === 0) {
        setError("The subscription did not contain any supported servers.");
        return;
      }
      setEditorConfigPath("");
      setEditorURI("");
      setEditorNodes(imported.map((node) => ({ id: crypto.randomUUID(), name: node.name, uri: node.uri })));
      if (!editorName.trim()) {
        try {
          setEditorName(new URL(editorSubscriptionURL).hostname);
        } catch {
          setEditorName("Subscription");
        }
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      setFetchingSubscription(false);
    }
  }

  async function importConfigFile() {
    setError("");
    try {
      const path = await SelectConfigFile();
      if (!path) return;
      setValidatingConfig(true);
      await ValidateXrayConfig(path);
      setEditorConfigPath(path);
      setEditorNodes([]);
      setEditorURI("");
      setEditorSubscriptionURL("");
      if (!editorName.trim()) setEditorName(configFileName(path).replace(/\.json$/i, ""));
    } catch (reason) {
      setError(`Could not import this Xray configuration: ${String(reason)}`);
    } finally {
      setValidatingConfig(false);
    }
  }

  async function addEditorURI() {
    const uri = editorURI.trim();
    if (!uri) return;
    setError("");
    try {
      await ValidateProxyURI(uri);
      setEditorConfigPath("");
      setEditorNodes((nodes) => [...nodes, {
        id: crypto.randomUUID(),
        name: profileTagFromURI(uri),
        uri,
      }]);
      setEditorURI("");
    } catch (reason) {
      setError(`This server URI is invalid or unsupported: ${String(reason)}`);
    }
  }

  async function saveProfile() {
    const nodes = [...editorNodes];
    const uri = editorURI.trim();
    if (uri) {
      try {
        await ValidateProxyURI(uri);
      } catch (reason) {
        setError(`This server URI is invalid or unsupported: ${String(reason)}`);
        return;
      }
      nodes.push({ id: crypto.randomUUID(), name: profileTagFromURI(uri), uri });
    }
    if (nodes.length === 0 && !editorConfigPath) {
      setError("Add a supported server URI, import an Xray JSON file, or fetch a subscription.");
      return;
    }
    if (editorConfigPath && nodes.length > 0) {
      setError("A profile can contain either a local Xray config or server URIs, not both.");
      return;
    }
    const id = editingProfileId === "new" ? crypto.randomUUID() : editingProfileId;
    if (!id) return;
    const previousProfile = profiles.find((item) => item.id === id);
    const profileName = editorName.trim() || editorSubscriptionURL.trim() || nodes[0]?.name || configFileName(editorConfigPath).replace(/\.json$/i, "");
    const profile: ConnectionProfile = {
      id,
      name: profileName,
      subscriptionURL: editorSubscriptionURL.trim(),
      configPath: editorConfigPath || undefined,
      nodes,
      selectedNodeId: nodes.length === 0
        ? ""
        : nodes.some((node) => node.id === previousProfile?.selectedNodeId)
          ? previousProfile?.selectedNodeId ?? nodes[0].id
          : nodes[0].id,
    };
    setProfiles((current) => {
      const index = current.findIndex((item) => item.id === id);
      return index < 0 ? [...current, profile] : current.map((item) => item.id === id ? profile : item);
    });
    if (!isRunning) setSelectedProfileId(id);
    setEditingProfileId(null);
    setError("");
  }

  async function selectProfile(profile: ConnectionProfile, nodeId = profile.selectedNodeId) {
    const node = profile.nodes.find((item) => item.id === nodeId);
    if (!node && !profile.configPath || busy) return;
    const startProfile = () => {
      if (profile.configPath) return StartXray(binaryPath, profile.configPath);
      if (node) return StartXrayWithURI(binaryPath, node.uri, connectionMode, connectionAddress());
      throw new Error("The selected profile has no server.");
    };
    if (isRunning) {
      setBusy(true);
      setBusyAction("switching");
      setError("");
      try {
        await StopXray();
        setConnectionStatus("stopped");
        setSelectedProfileId(profile.id);
        setProfiles((current) => current.map((item) =>
          item.id === profile.id ? { ...item, selectedNodeId: node?.id ?? "" } : item,
        ));
        await startProfile();
        await refreshDashboard();
      } catch (reason) {
        setError(`Could not switch servers: ${String(reason)}`);
        await refreshDashboard();
      } finally {
        setBusy(false);
      }
      return;
    }
    setSelectedProfileId(profile.id);
    setProfiles((current) => current.map((item) =>
      item.id === profile.id ? { ...item, selectedNodeId: node?.id ?? "" } : item,
    ));
    setPingResult(null);
  }

  function connectionAddress() {
    return connectionMode === "lan" ? `${lanBindAddress}:${lanPort}` : proxyAddress;
  }

  async function pingSelectedNode() {
    if (!selectedNode || pingingNodeId !== null) return;
    setPingingNodeId(selectedNode.id);
    setPingResult(null);
    try {
      const latency = await PingServer(selectedNode.uri);
      setPingResult({ nodeId: selectedNode.id, latency });
    } catch {
      setPingResult({ nodeId: selectedNode.id, latency: null });
    } finally {
      setPingingNodeId(null);
    }
  }

  function deleteProfile(profile: ConnectionProfile) {
    if (!window.confirm(`Delete profile "${profile.name}"?`)) return;
    const remaining = profiles.filter((item) => item.id !== profile.id);
    setProfiles(remaining);
    if (selectedProfileId === profile.id) setSelectedProfileId(remaining[0]?.id ?? "");
    if (editingProfileId === profile.id) setEditingProfileId(null);
  }

  async function connect() {
    if (!selectedProfile || (!selectedNode && !selectedProfile.configPath)) {
      setPage("profiles");
      setError("Add or select a connection profile first.");
      return;
    }
    if (connectionMode === "lan" && (!lanBindAddress || !isLanPortValid)) {
      setError("Choose an available LAN address and a port from 1 to 65535.");
      return;
    }
    setBusy(true);
    setBusyAction("connecting");
    setError("");
    try {
      if (selectedProfile.configPath) await StartXray(binaryPath, selectedProfile.configPath);
      else if (selectedNode) await StartXrayWithURI(binaryPath, selectedNode.uri, connectionMode, connectionAddress());
      else throw new Error("The selected profile has no supported server.");
      await refreshDashboard();
    } catch (reason) {
      setError(`Could not start Xray: ${String(reason)}`);
      await refreshDashboard();
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setBusyAction("disconnecting");
    setError("");
    try {
      await StopXray();
      await refreshDashboard();
    } catch (reason) {
      setError(`Could not stop Xray: ${String(reason)}`);
      await refreshDashboard();
    } finally {
      setBusy(false);
    }
  }

  async function openProjectChannel() {
    try {
      await OpenTelegramChannel();
    } catch (reason) {
      setError(`Could not open the project channel: ${String(reason)}`);
    }
  }

  function exportLogs() {
    if (logs.length === 0) return;
    const blob = new Blob([logs.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zirgozar-logs-${new Date().toISOString().replace(/:/g, "-")}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function changePage(nextPage: PageId) {
    setPage(nextPage);
    setError("");
  }

  const statusLabel = busy
    ? busyAction === "switching" ? "Switching" : busyAction === "connecting" ? "Connecting" : "Disconnecting"
    : isRunning ? "Connected" : error ? "Needs attention" : connectionStatus === "unknown" ? "Checking" : "Disconnected";

  return (
    <main className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /></div>
          <div><strong>ZirGozar</strong><small>XRAY CLIENT</small></div>
        </div>
        <div className="sidebar-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {pages.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${page === item.id ? "nav-item--active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => changePage(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "logs" && logs.length > 0 && <span className="nav-count">{logs.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className={`sidebar-connection ${isRunning ? "sidebar-connection--on" : ""}`}>
            <span className="connection-dot" />
            <span>{statusLabel}</span>
            <small>{isRunning ? "Xray core active" : "Xray core idle"}</small>
          </div>
          <div className="sidebar-version">ZirGozar · Desktop</div>
        </div>
      </aside>

      <div className="main-column">
        <header className="app-topbar">
          <div className="breadcrumb"><span>ZirGozar</span><span className="breadcrumb-separator">/</span><strong>{pages.find((item) => item.id === page)?.label}</strong></div>
          <div className="topbar-status" role="status" aria-live="polite">
            <span className={`connection-dot ${isRunning ? "connection-dot--on" : ""}`} />
            {statusLabel}
          </div>
        </header>

        <div className="page-scroll" aria-busy={loading}>
          {loading ? (
            <div className="page-loading"><span className="loading-spinner" />Connecting to the local runtime…</div>
          ) : page === "home" ? (
            <section className="page-content">
              <div className="page-heading">
                <div><p className="eyebrow">OVERVIEW</p><h1>Home</h1><p className="page-subtitle">Your connection, profile, and live runtime at a glance.</p></div>
                <button className="button button--quiet" type="button" onClick={() => changePage("profiles")}>Manage profiles <Icon name="arrow" /></button>
              </div>

              <section className={`connection-card ${isRunning ? "connection-card--connected" : ""}`} aria-labelledby="connection-title">
                <div className="connection-card__top">
                  <div className={`connection-emblem ${isRunning ? "connection-emblem--connected" : ""}`}>
                    <span className="connection-dot" />
                  </div>
                  <div className="connection-copy">
                    <p className="eyebrow">{busy ? "PLEASE WAIT" : "CONNECTION STATUS"}</p>
                    <h2 id="connection-title">{busy ? statusLabel : isRunning ? "Connected" : error ? "Connection needs attention" : "You’re disconnected"}</h2>
                    <p>{isRunning
                      ? `${usesImportedConfig ? "Imported Xray configuration" : `${connectionMode === "lan" ? "LAN share" : connectionMode === "tunnel" ? "TUN mode" : "Local proxy"} is running through ${selectedNode?.name ?? selectedProfile?.name ?? "the active server"}.`}`
                      : selectedProfile ? `${selectedProfile.name} is ready when you are.` : "Add a server profile to start your first connection."}</p>
                  </div>
                  <div className="connection-card__action">
                    {isRunning ? (
                      <button className="button button--danger" type="button" onClick={() => void disconnect()} disabled={busy}>Disconnect</button>
                    ) : (
                      <button className="button button--primary" type="button" onClick={() => void connect()} disabled={busy || (!selectedNode && !selectedProfile?.configPath) || (!usesImportedConfig && connectionMode === "lan" && (!lanBindAddress || !isLanPortValid))}>
                        {busy ? "Connecting…" : "Connect"} <Icon name="arrow" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="connection-card__footer">
                  <span><span className={`connection-dot ${isRunning ? "connection-dot--on" : ""}`} />{statusLabel}</span>
                  <span>{selectedNode ? `Server · ${selectedNode.name}` : selectedProfile?.configPath ? `Config · ${configFileName(selectedProfile.configPath)}` : "No active server selected"}</span>
                  <span>Mode · {usesImportedConfig ? "Defined by config" : connectionMode === "lan" ? "LAN share" : connectionMode === "tunnel" ? "TUN" : "Local proxy"}</span>
                </div>
              </section>

              {error && <div className="inline-alert" role="alert">{error}</div>}

              <div className="section-heading"><div><p className="eyebrow">ACTIVE PROFILE</p><h2>Connection profile</h2></div><button className="text-button" type="button" onClick={() => changePage("profiles")}>View all <Icon name="arrow" /></button></div>
              {selectedProfile ? (
                <section className="profile-summary">
                  <div className="profile-summary__icon"><Icon name="layers" /></div>
                  <div className="profile-summary__main"><strong>{selectedProfile.name}</strong><span>{selectedNode ? `${selectedNode.name} · ${selectedProfile.nodes.length} ${selectedProfile.nodes.length === 1 ? "server" : "servers"}` : `Imported Xray config · ${configFileName(selectedProfile.configPath ?? "")}`}</span></div>
                  {selectedNode && (
                    <>
                      <label className="select-wrap">
                        <span className="sr-only">Select active server</span>
                        <select
                          aria-label="Select active server"
                          value={selectedNode.id}
                          disabled={busy}
                          onChange={(event) => void selectProfile(selectedProfile, event.target.value)}
                        >
                          {selectedProfile.nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                        </select>
                      </label>
                      <button className="button button--quiet" type="button" onClick={() => void pingSelectedNode()} disabled={pingingNodeId !== null}>
                        {pingingNodeId === selectedNode.id ? "Testing…" : "Test server"}
                      </button>
                      {pingResult?.nodeId === selectedNode.id && <span className={`ping-chip ${pingResult.latency === null ? "ping-chip--failed" : ""}`}>{pingResult.latency === null ? "Unreachable" : `TCP ${pingResult.latency} ms`}</span>}
                    </>
                  )}
                </section>
              ) : (
                <section className="empty-panel">
                  <div className="empty-icon"><Icon name="layers" /></div>
                  <div><strong>No profile selected</strong><p>Import a supported server URI or subscription to get started.</p></div>
                  <button className="button button--secondary" type="button" onClick={() => { changePage("profiles"); startNewProfile(); }}>Add profile</button>
                </section>
              )}

              <div className="section-heading section-heading--compact"><div><p className="eyebrow">LIVE RUNTIME</p><h2>Traffic</h2></div><span className="section-meta">{isRunning ? "Since this Xray process started" : "Available while connected"}</span></div>
              <div className="stats-grid">
                <article className="stat-panel">
                  <span className="stat-label">Download speed</span>
                  <strong>{isRunning && !usesImportedConfig && !statsUnavailable ? `${formatBytes(traffic.downloadBytesPerSecond)}/s` : "Unavailable"}</strong>
                  <small>{isRunning && !usesImportedConfig && !statsUnavailable ? `${formatBytes(traffic.downloadBytes)} received` : isRunning ? usesImportedConfig ? "Unavailable for imported JSON configs" : "Xray stats unavailable" : "Connect to see live traffic"}</small>
                </article>
                <article className="stat-panel">
                  <span className="stat-label">Upload speed</span>
                  <strong>{isRunning && !usesImportedConfig && !statsUnavailable ? `${formatBytes(traffic.uploadBytesPerSecond)}/s` : "Unavailable"}</strong>
                  <small>{isRunning && !usesImportedConfig && !statsUnavailable ? `${formatBytes(traffic.uploadBytes)} sent` : isRunning ? usesImportedConfig ? "Unavailable for imported JSON configs" : "Xray stats unavailable" : "Connect to see live traffic"}</small>
                </article>
              </div>

              <div className="quick-actions">
                <button type="button" onClick={() => changePage("profiles")}><Icon name="layers" /><span><strong>Manage profiles</strong><small>{profiles.length} saved</small></span><Icon name="arrow" /></button>
                <button type="button" onClick={() => changePage("logs")}><Icon name="list" /><span><strong>View logs</strong><small>{logs.length ? `${logs.length} recent entries` : "Runtime output and diagnostics"}</small></span><Icon name="arrow" /></button>
              </div>
            </section>
          ) : page === "profiles" ? (
            <section className="page-content">
              <div className="page-heading">
                <div><p className="eyebrow">CONNECTION LIBRARY</p><h1>Profiles</h1><p className="page-subtitle">Import a local Xray JSON configuration or save supported server URIs on this device.</p></div>
                {!editingProfileId && <button className="button button--primary" type="button" onClick={startNewProfile}>Add profile <span aria-hidden="true">+</span></button>}
              </div>
              {error && <div className="inline-alert" role="alert">{error}</div>}
              {editingProfileId ? (
                <form className="editor-panel" onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
                  <div className="editor-heading"><div><p className="eyebrow">{editingProfileId === "new" ? "NEW PROFILE" : "EDIT PROFILE"}</p><h2>{editingProfileId === "new" ? "Add a profile" : "Edit profile"}</h2></div><button className="text-button" type="button" onClick={() => setEditingProfileId(null)}>Cancel</button></div>
                  <label className="field"><span>Profile name</span><input value={editorName} onChange={(event) => setEditorName(event.target.value)} placeholder="For example, Personal" maxLength={80} autoFocus /></label>
                  <div className="field-group">
                    <label className="field"><span>Subscription URL <small>Optional</small></span><input type="url" value={editorSubscriptionURL} onChange={(event) => setEditorSubscriptionURL(event.target.value)} placeholder="https://provider.example/subscription" spellCheck={false} /></label>
                    <button className="button button--secondary field-action" type="button" onClick={() => void fetchEditorSubscription()} disabled={fetchingSubscription || !editorSubscriptionURL.trim()}>{fetchingSubscription ? "Importing…" : "Fetch subscription"}</button>
                  </div>
                  <div className="field">
                    <span>Add a server URI</span>
                    <textarea value={editorURI} onChange={(event) => setEditorURI(event.target.value)} placeholder="vless://, vmess://, trojan://, or ss://" spellCheck={false} rows={3} />
                    <small>Credentials remain stored locally in the app profile. Do not share exported diagnostics containing private data.</small>
                  </div>
                  <div className="editor-actions">
                    <button className="button button--secondary" type="button" onClick={() => void pasteEditorURI()}>Paste URI</button>
                    <button className="button button--secondary" type="button" onClick={() => void addEditorURI()} disabled={!editorURI.trim()}>Validate & add server</button>
                    <button className="button button--secondary" type="button" onClick={() => void importConfigFile()} disabled={validatingConfig}>{validatingConfig ? "Validating…" : "Import Xray JSON"}</button>
                  </div>
                  {editorConfigPath && <p className="selected-config"><span className="connection-dot connection-dot--on" />Validated configuration · {configFileName(editorConfigPath)}<button className="text-button text-button--danger" type="button" onClick={() => setEditorConfigPath("")}>Remove</button></p>}
                  {editorNodes.length > 0 && (
                    <div className="node-list">
                      <div className="node-list__heading"><strong>Servers</strong><span>{editorNodes.length} imported</span></div>
                      {editorNodes.map((node) => (
                        <div className="node-row" key={node.id}>
                          <span className="node-indicator" />
                          <div><strong>{node.name}</strong><small>Supported URI</small></div>
                          <button className="text-button text-button--danger" type="button" onClick={() => setEditorNodes((current) => current.filter((item) => item.id !== node.id))} aria-label={`Remove ${node.name}`}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="editor-footer"><button className="button button--quiet" type="button" onClick={() => setEditingProfileId(null)}>Cancel</button><button className="button button--primary" type="submit" disabled={editorNodes.length === 0 && !editorURI.trim() && !editorConfigPath}>Save profile</button></div>
                </form>
              ) : profiles.length ? (
                <div className="profile-list">
                  {profiles.map((profile) => {
                    const active = profile.id === selectedProfileId;
                    const node = profile.nodes.find((item) => item.id === profile.selectedNodeId) ?? profile.nodes[0];
                    return (
                      <article className={`profile-card ${active ? "profile-card--active" : ""}`} key={profile.id}>
                        <div className="profile-card__icon"><Icon name="layers" /></div>
                        <div className="profile-card__details"><div className="profile-title-row"><h2>{profile.name}</h2>{active && <span className="active-badge"><Icon name="check" /> Active</span>}</div><p>{node?.name ?? (profile.configPath ? configFileName(profile.configPath) : "No server")} <span className="subtle-separator">·</span> {profile.configPath ? "Xray JSON configuration" : `${profile.nodes.length} ${profile.nodes.length === 1 ? "server" : "servers"}`}</p></div>
                        {profile.nodes.length > 0 && <label className="select-wrap profile-card__select"><span className="sr-only">Select server for {profile.name}</span><select value={node?.id ?? ""} disabled={busy} onChange={(event) => void selectProfile(profile, event.target.value)}>{profile.nodes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
                        {!active && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void selectProfile(profile)}>Select</button>}
                        <button className="icon-button" type="button" aria-label={`Edit ${profile.name}`} disabled={busy || isRunning} onClick={() => editProfile(profile)}>Edit</button>
                        <button className="icon-button icon-button--danger" type="button" aria-label={`Delete ${profile.name}`} disabled={busy || isRunning} onClick={() => deleteProfile(profile)}>Delete</button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <section className="empty-state">
                  <div className="empty-icon"><Icon name="layers" /></div>
                  <h2>Your profile library is empty</h2>
                  <p>Import an Xray JSON file, add a supported share URI, or fetch a subscription list.</p>
                  <button className="button button--primary" type="button" onClick={startNewProfile}>Add your first profile</button>
                </section>
              )}
              {isRunning && <p className="helper-note">Select a profile or server to switch the active connection. The current Xray process will be stopped before the new server starts.</p>}
            </section>
          ) : page === "logs" ? (
            <section className="page-content">
              <div className="page-heading">
                <div><p className="eyebrow">DIAGNOSTICS</p><h1>Logs</h1><p className="page-subtitle">Recent Xray process output captured during this app session.</p></div>
                <div className="heading-actions"><button className="button button--quiet" type="button" onClick={() => void refreshDashboard()}>Refresh status</button><button className="button button--secondary" type="button" onClick={exportLogs} disabled={logs.length === 0}>Export</button><button className="button button--quiet" type="button" onClick={() => setLogs([])} disabled={logs.length === 0}>Clear</button></div>
              </div>
              {error && <div className="inline-alert" role="alert">{error}</div>}
              <section className="log-panel">
                <div className="log-panel__header"><span className="log-live"><span className="connection-dot" /> SESSION OUTPUT</span><span>{logs.length} entries</span></div>
                <div className="log-list" role="log" aria-live="polite" aria-relevant="additions text">
                  {logs.length ? logs.map((line, index) => {
                    const level = /error|fatal/i.test(line) ? "error" : /warn/i.test(line) ? "warning" : "output";
                    return <div className={`log-entry log-entry--${level}`} key={`${index}-${line}`}><span className="log-level">{level.toUpperCase()}</span><code>{line}</code></div>;
                  }) : <div className="log-empty"><div className="empty-icon"><Icon name="list" /></div><strong>No runtime output yet</strong><p>Start Xray to see process logs here. This view keeps recent output in memory for this app session.</p></div>}
                </div>
              </section>
              <p className="helper-note">Logs are collected in memory and cleared when ZirGozar closes or when you clear them. Xray output can contain server details; review before sharing.</p>
            </section>
          ) : page === "settings" ? (
            <section className="page-content">
              <div className="page-heading"><div><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><p className="page-subtitle">A few practical options for how ZirGozar connects and looks.</p></div></div>
              {error && <div className="inline-alert" role="alert">{error}</div>}
              <section className="settings-group">
                <div className="settings-group__heading"><div><h2>Appearance</h2><p>Choose the app’s color accent.</p></div></div>
                <div className="theme-options">
                  {themes.map((item) => <button key={item.id} type="button" className={`theme-option ${theme === item.id ? "theme-option--active" : ""}`} aria-pressed={theme === item.id} onClick={() => setTheme(item.id)}><span className="theme-swatch" style={{ backgroundColor: item.color }} /><span>{item.name}</span>{theme === item.id && <Icon name="check" />}</button>)}
                </div>
              </section>
              <section className="settings-group">
                <div className="settings-group__heading"><div><h2>Connection</h2><p>Configure the local listener used by the selected profile.</p></div></div>
                <fieldset className="setting-fieldset" disabled={busy || isRunning || usesImportedConfig}>
                  <legend>Connection mode</legend>
                  <div className="mode-options">
                    {(["proxy", "lan", "tunnel"] as const).map((mode) => <button key={mode} type="button" className={connectionMode === mode ? "mode-option mode-option--active" : "mode-option"} aria-pressed={connectionMode === mode} onClick={() => { setConnectionMode(mode); if (mode === "lan" && !lanBindAddress) setLanBindAddress(lanAddresses[0] ?? ""); }}>{mode === "proxy" ? "Local proxy" : mode === "lan" ? "LAN share" : "TUN"}</button>)}
                  </div>
                </fieldset>
                {usesImportedConfig && <p className="helper-note">Connection mode and listener settings for an imported JSON profile come from that file and are not changed by ZirGozar.</p>}
                {!usesImportedConfig && (connectionMode === "proxy" ? (
                  <label className="field setting-address"><span>Proxy listen address</span><input value={proxyAddress} onChange={(event) => setProxyAddress(event.target.value)} placeholder="127.0.0.1:10808" spellCheck={false} disabled={busy || isRunning} /><small>Local SOCKS5 listener. This app does not configure system-wide proxy settings.</small></label>
                ) : connectionMode === "lan" ? (
                  <div className="field-group setting-address">
                    <label className="field"><span>LAN interface</span><select value={lanBindAddress} onChange={(event) => setLanBindAddress(event.target.value)} disabled={busy || isRunning || lanAddresses.length === 0}>{lanAddresses.length ? lanAddresses.map((address) => <option key={address} value={address}>{address}</option>) : <option value="">No private network found</option>}</select></label>
                    <label className="field field--short"><span>Port</span><input type="number" min="1" max="65535" value={lanPort} onChange={(event) => setLanPort(event.target.value)} disabled={busy || isRunning} /></label>
                    <small className="field-help">LAN sharing exposes an unauthenticated SOCKS5 listener on your private network. Use only a trusted network; do not enable router port forwarding.</small>
                  </div>
                ) : <p className="helper-note setting-address">TUN mode requires platform permissions and may need system network configuration. If startup fails, check the Xray log output.</p>)}
              </section>
              <section className="settings-group">
                <div className="settings-group__heading"><div><h2>Xray runtime</h2><p>Runtime information available to this installation.</p></div></div>
                <div className="runtime-info"><span>Executable</span><code>{binaryPath || "Not found"}</code><span>Status</span><strong>{statusLabel}</strong></div>
              </section>
            </section>
          ) : (
            <section className="page-content">
              <div className="page-heading"><div><p className="eyebrow">APPLICATION</p><h1>About ZirGozar</h1><p className="page-subtitle">A focused desktop interface for managing an Xray-core connection.</p></div></div>
              <section className="about-card">
                <div className="about-mark"><div className="brand-mark" aria-hidden="true"><span /><span /></div></div>
                <div><h2>ZirGozar</h2><p>Desktop Xray client</p><span className="about-build">Development build · version metadata is not configured</span></div>
              </section>
              <section className="settings-group about-details">
                <div className="settings-group__heading"><div><h2>About this app</h2><p>Use your own Xray server configuration or supported share URI. ZirGozar runs the Xray core locally and does not provide a proxy service.</p></div></div>
                <div className="runtime-info"><span>Desktop framework</span><strong>Wails</strong><span>Frontend</span><strong>React · TypeScript</strong><span>Xray executable</span><code>{binaryPath || "Unavailable"}</code><span>Active profile</span><strong>{selectedProfile?.name ?? "None selected"}</strong></div>
                <button className="button button--quiet about-link" type="button" onClick={() => void openProjectChannel()}>Telegram · @TheCommit <Icon name="arrow" /></button>
              </section>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
