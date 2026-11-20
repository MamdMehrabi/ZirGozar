import type { ReactNode } from "react";

type PageId = "home" | "profiles" | "logs" | "settings" | "about";
type ThemeId = "blue" | "graphite" | "aurora" | "ember";

interface MainLayoutProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  theme: ThemeId;
  statusLabel: string;
  isRunning: boolean;
  logCount: number;
  loading: boolean;
  children: ReactNode;
}

const pages: { id: PageId; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "profiles", label: "Profiles", icon: "layers" },
  { id: "logs", label: "Logs", icon: "list" },
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "about", label: "About", icon: "info" },
];

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
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
  }
}

export function MainLayout({
  page,
  onNavigate,
  theme,
  statusLabel,
  isRunning,
  logCount,
  loading,
  children,
}: MainLayoutProps) {
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
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "logs" && logCount > 0 && <span className="nav-count">{logCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className={`sidebar-connection ${isRunning ? "sidebar-connection--on" : ""}`}>
            <span className={`connection-dot ${isRunning ? "connection-dot--on" : ""}`} />
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
          ) : children}
        </div>
      </div>
    </main>
  );
}