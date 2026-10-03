#!/usr/bin/env node

/**
 * Acode browser preview server (development only).
 *
 * Acode ships as an Android app, but its UI, editor and business logic are a
 * plain web bundle. This script makes the app runnable in a browser:
 *
 *   1. copies the Cordova runtime (cordova.js, cordova_plugins.js, plugins/) that
 *      `cordova prepare browser` generated into `www/`, so `www/index.html` can
 *      boot outside of the Android WebView;
 *   2. runs `rspack --watch` to compile `src/` into `www/build/`;
 *   3. serves `www/` on PORT and injects `utils/browser-preview/cordova-shim.js`,
 *      which emulates the native layer the app expects;
 *   4. pushes a "reload" event over Server-Sent Events whenever the bundle is
 *      recompiled, so the preview refreshes like a dev server would.
 *
 * Everything it writes stays inside the gitignored `www/build`, `www/cordova.js`,
 * `www/cordova_plugins.js` and `www/plugins` paths.
 */

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const WWW = path.join(ROOT, "www");
const BUILD = path.join(WWW, "build");
const PLATFORM_WWW = path.join(ROOT, "platforms", "browser", "www");
const SHIM_PATH = path.join(ROOT, "utils", "browser-preview", "cordova-shim.js");
const SHIM_URL = "/__acode-browser-shim.js";
const RELOAD_URL = "/__acode-livereload";
const CORDOVA_BIN = path.join(ROOT, "node_modules", "cordova", "bin", "cordova");
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

const MIME = {
	".html": "text/html",
	".js": "application/javascript",
	".mjs": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".map": "application/json",
};

const CORDOVA_RUNTIME = ["cordova.js", "cordova_plugins.js", "plugins"];

function log(...args) {
	console.log(`[preview]`, ...args);
}

function runCordova(args) {
	log(`cordova ${args.join(" ")}`);
	execFileSync(process.execPath, [CORDOVA_BIN, ...args], {
		cwd: ROOT,
		stdio: "inherit",
	});
}

/**
 * `platforms/` is gitignored, so a fresh checkout has no browser platform.
 * Regenerate it (cordova.js, cordova_plugins.js and the plugin modules this
 * server copies into www/) the first time the preview starts.
 */
function ensureCordovaRuntime() {
	if (fs.existsSync(path.join(PLATFORM_WWW, "cordova.js"))) return;
	runCordova(["platform", "add", "browser", "--nosave"]);
	runCordova(["prepare", "browser"]);
}

function copyCordovaRuntime() {
	ensureCordovaRuntime();

	for (const name of CORDOVA_RUNTIME) {
		const source = path.join(PLATFORM_WWW, name);
		const target = path.join(WWW, name);
		if (!fs.existsSync(source)) continue;
		fs.rmSync(target, { recursive: true, force: true });
		fs.cpSync(source, target, { recursive: true });
	}
	log("copied cordova runtime into www/");
}

function startRspack() {
	const rspackBin = path.join(
		ROOT,
		"node_modules",
		"@rspack",
		"cli",
		"bin",
		"rspack.js",
	);
	const rspack = spawn(
		process.execPath,
		[rspackBin, "--watch", "--mode", "development"],
		{ cwd: ROOT, stdio: "inherit" },
	);
	rspack.on("close", (code) => {
		log(`rspack exited with code ${code}`);
		process.exit(code || 1);
	});
	return rspack;
}

/* -------------------------------------------------------------- *
 * Live reload
 * -------------------------------------------------------------- */

const clients = new Set();

function broadcastReload() {
	clients.forEach((client) => client.write("data: reload\n\n"));
}

function handleReloadRequest(req, res) {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-store",
		Connection: "keep-alive",
	});
	res.write("data: connected\n\n");
	clients.add(res);
	req.on("close", () => clients.delete(res));
}

function watchBundle() {
	let timer = null;
	const schedule = () => {
		clearTimeout(timer);
		timer = setTimeout(broadcastReload, 300);
	};

	try {
		fs.watch(BUILD, { recursive: true }, schedule);
	} catch (error) {
		log("falling back to watching www/build/main.js", error.message);
		fs.watch(path.join(BUILD, "main.js"), schedule);
	}
}

/* -------------------------------------------------------------- *
 * Static server
 * -------------------------------------------------------------- */

const CORDOVA_TAG = /<script\s+src=["'](?:\.\/)?cordova\.js["']\s*><\/script>/i;

/**
 * Load the shim right after `cordova.js` (so `window.cordova` and the exec
 * proxy module exist when it runs) and never add a second copy of it.
 */
function injectShim(html) {
	if (html.includes(SHIM_URL)) return html;
	const tag = `<script src="${SHIM_URL}"></script>`;
	if (CORDOVA_TAG.test(html)) {
		return html.replace(CORDOVA_TAG, (match) => `${match}\n  ${tag}`);
	}
	return html.replace("</head>", `  ${tag}\n</head>`);
}

function resolveFile(urlPath) {
	let relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
	if (relative.startsWith("www/")) relative = relative.slice(4);
	const filePath = path.join(WWW, path.normalize(relative));
	if (!filePath.startsWith(WWW)) return null;
	return filePath;
}

const server = http.createServer((req, res) => {
	const urlPath = req.url.split("?")[0];

	if (urlPath === RELOAD_URL) return handleReloadRequest(req, res);

	if (urlPath === SHIM_URL) {
		res.writeHead(200, {
			"Content-Type": "application/javascript",
			"Cache-Control": "no-store",
		});
		return res.end(fs.readFileSync(SHIM_PATH));
	}

	const requested = urlPath === "/" ? "/index.html" : urlPath;
	const filePath = resolveFile(requested);
	if (!filePath) {
		res.writeHead(403);
		return res.end("Forbidden");
	}

	fs.readFile(filePath, (error, data) => {
		if (error) {
			log("404", requested);
			res.writeHead(404);
			return res.end("Not found");
		}

		const isHtml = path.extname(filePath) === ".html";
		res.writeHead(200, {
			"Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
			"Cache-Control": "no-store",
			"Access-Control-Allow-Origin": "*",
		});
		res.end(isHtml ? injectShim(data.toString()) : data);
	});
});

copyCordovaRuntime();
startRspack();
watchBundle();
server.listen(PORT, HOST, () => {
	log(`serving www/ on http://${HOST}:${PORT}`);
});
