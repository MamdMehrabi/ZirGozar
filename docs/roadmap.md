# ZirGozar roadmap

This roadmap describes the current implementation rather than the original project plan. Historical milestone notes remain in `docs/milestones/`.

## Current status

| Area | Status | Notes |
|---|---|---|
| Wails desktop foundation | Implemented | Go backend and embedded React frontend. |
| Connection lifecycle | Implemented | One Xray child process, explicit start/stop, backend-polled state, shutdown cleanup. “Connected” means the process is active, not that a remote endpoint has passed a protocol-level health check. |
| URI profiles | Implemented | `vless`, `vmess`, `trojan`, and `ss` links; local profile storage; server selection and TCP reachability test. |
| Subscription import | Implemented, limited | HTTP(S) text or Base64 lists of supported share URIs. No automatic refresh or provider-specific subscription formats. |
| Local Xray JSON profiles | Implemented, path-based | The selected file is validated by Xray test mode and its path is saved; ZirGozar does not copy or rewrite it. |
| Runtime traffic | Partial | URI-generated profiles expose Xray traffic counters. Imported JSON only reports counters if its own config enables the required API and stats. |
| Logs | Session-only | Recent process output is kept in memory and can be cleared or exported. There is no persistent log store or log retrieval after restart. |
| Linux packaging | Partial | Linux amd64 Xray files are checked in; Linux desktop launcher installation is available. |
| macOS packaging | CI build path | The build script downloads a matching Xray runtime for the host. Published releases are not configured. |
| Windows packaging | Not implemented | No Windows Xray download flow or CI build is configured. |
| TUN mode | Experimental / platform-dependent | Depends on OS permissions, routing, and the Xray configuration. |

## Next priorities

1. Publish and test reproducible Linux and macOS release artifacts.
2. Add platform-specific TUN setup and verification, or keep the feature clearly marked as experimental.
3. Add structured diagnostics without persisting or exposing configuration secrets.
4. Add Windows packaging only after the matching Xray assets and desktop build have reliable CI coverage.

## Engineering principles

- Keep Xray as a separate operating-system process managed by the Go service.
- Keep frontend state truthful to the backend process state.
- Validate configurations using the same Xray core that will run them.
- Keep user configuration separate from embedded application resources.
- Document platform constraints and avoid claiming unsupported protocol or subscription compatibility.
