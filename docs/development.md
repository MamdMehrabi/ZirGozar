# Development guide

ZirGozar is a Wails v2 desktop application with a Go backend and a React/TypeScript frontend built by Vite.

## Requirements

- Go 1.25 or newer
- Node.js 22 and npm
- Wails CLI v2.16.0
- On Linux, `build-essential`, `pkg-config`, `libgtk-3-dev`, and `libwebkit2gtk-4.1-dev`

Install the pinned Wails CLI:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0
```

Install frontend dependencies and prepare the Xray executable for the build host:

```bash
cd frontend && npm ci
cd ..
bash scripts/download-xray.sh
```

The repository currently checks in the Linux amd64 Xray asset. The download script fetches the Xray release matching a supported Linux or macOS build host. This requires network access.

## Development and builds

Regenerate Wails bindings after changing exported methods on `App`:

```bash
wails generate module
```

Run the app in development mode:

```bash
wails dev
```

Build the frontend and desktop application:

```bash
cd frontend && npm run build
cd ..
wails build -tags webkit2_41
```

The Linux tag is not needed on macOS:

```bash
wails build
```

## Checks

```bash
cd frontend && npm run typecheck
cd ..
go test ./...
go vet ./...
```

`npm run build` includes the TypeScript check before creating Vite's production output. The GitHub Actions workflow builds Linux and macOS targets; Windows packaging is not currently configured.

## Frontend dependency recovery

If npm reports a platform-specific optional Rollup package missing, use the lockfile-based install from the target platform:

```bash
cd frontend
npm ci
```

Do not delete or regenerate `package-lock.json` as a first recovery step; it is the reproducible dependency manifest.
