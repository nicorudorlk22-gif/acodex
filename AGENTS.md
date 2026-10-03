# AGENTS.md

Notes for running this repository in the Base44 sandbox (browser preview).

## What this repo is

Acode is an **Android/Cordova** code editor. Its UI, editor and business logic
are a plain web bundle (`src/` → rspack → `www/build`), so it can be developed in
a browser. The Android build is not used in the sandbox.

## How the preview runs

`docker compose -f docker-compose.base44.yml up -d` starts a single `preview`
service (plain `node:22` image, repo bind-mounted at `/app`). Its start command
installs dependencies with `npm ci` when `node_modules` is empty, then runs
`utils/scripts/preview-dev.js`, which:

1. regenerates the Cordova browser runtime when it is missing
   (`cordova platform add browser --nosave` + `cordova prepare browser`) and
   copies `cordova.js`, `cordova_plugins.js` and `plugins/` into `www/`;
2. runs `rspack --watch --mode development` to compile `src/` into `www/build`;
3. serves `www/` on port 3000 and injects `utils/browser-preview/cordova-shim.js`
   into the served `index.html` (once, right after `cordova.js` — never twice);
4. pushes a reload over Server-Sent Events (`/__acode-livereload`) after every
   recompile, which the shim turns into `location.reload()`.

`www/build`, `www/cordova.js`, `www/cordova_plugins.js`, `plugins/` and
`platforms/` are gitignored build output — never edit them by hand.

## The native shim

`utils/browser-preview/cordova-shim.js` emulates what Android/Cordova would
provide: an IndexedDB-backed `file:///` filesystem (`resolveLocalFileSystemURL`,
`cordova.file`), the `System`, `SDcard`, `Clipboard`, `Iap` and
`CordovaHttpPlugin` service proxies, and the `BuildInfo` globals.

- Proxies are registered through `proxy.add(service, serviceProxy(...))`.
  Handlers may be named either `theAction` or `the-action`: lookup falls back to
  a dash/underscore/case-insensitive match, and an action with no handler answers
  with a benign no-op and a one-time `[preview]` log instead of Cordova's
  `Missing Command Error`.
- `CordovaHttpPlugin` is backed by `fetch`, so browser CORS applies to plugin
  downloads and update checks.

Not emulated (Android-only): real billing (`Iap.startConnection` reports
`BILLING_UNAVAILABLE`), file upload/download over the http plugin, intents,
shortcuts, app icons, the proot/terminal sandbox and workspace file watching.

## Verifying

- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` → `200`.
- The served HTML must contain `__acode-browser-shim.js` exactly once and the
  editor root (`#root`) must render editor panes.
- Browser console errors about `https://acode.app/api/...` (login, promotions)
  are expected: that account endpoint is not reachable from the sandbox.
- `docker compose -f docker-compose.base44.yml logs -f preview` shows the rspack
  watch output and the `[preview]` shim logs.

## Project commands

- `npm ci` — install dependencies (lockfile: `package-lock.json`).
- `npm test` — vitest suite.
- `npx biome check src` — lint/format check (`npm run check` writes changes).
- `npm run build` — production web bundle (not used by the preview).
