/**
 * Live server: serves the opened folder over HTTP (cordova-plugin-server)
 * and live-reloads connected browsers on every file save.
 *
 * Browsers load pages from this server; an injected script polls
 * /__livereload and reloads when the version changes.
 */
import fsOperation from "fileSystem";
import toast from "components/toast";
import Url from "utils/Url";

const PORT = 8080;
let serverInstance = null;
let version = 0;
let watching = false;

/**
 * MIME types for the static server.
 * @param {string} pathname
 * @returns {string}
 */
export function getContentType(pathname) {
	const extension = pathname.split("?")[0].split(".").pop().toLowerCase();
	const types = {
		html: "text/html",
		htm: "text/html",
		css: "text/css",
		js: "application/javascript",
		mjs: "application/javascript",
		json: "application/json",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		svg: "image/svg+xml",
		ico: "image/x-icon",
		webp: "image/webp",
		woff: "font/woff",
		woff2: "font/woff2",
		ttf: "font/ttf",
		mp4: "video/mp4",
		webm: "video/webm",
		txt: "text/plain",
		md: "text/plain",
	};
	return types[extension] || "application/octet-stream";
}

/**
 * Injects the livereload polling script into an HTML document.
 * @param {string} html
 * @returns {string}
 */
export function injectReloadScript(html) {
	const script =
		'<script>(function(){var v="0";function poll(){fetch("/__livereload")' +
		'.then(function(r){return r.text()}).then(function(t){if(v==="0"){v=t;}else if(v!==t){location.reload();}})' +
		".catch(function(){});setTimeout(poll,1500);}poll();})();</script>";
	if (/<\/body>/i.test(html)) {
		return html.replace(/<\/body>/i, `${script}</body>`);
	}
	return `${html}${script}`;
}

/**
 * Resolves which file path should be served for a request path.
 * @param {string} rootDir url of the served root folder
 * @param {string} pathname request path, e.g. "/" or "/css/main.css"
 * @returns {string} file url to read
 */
export function resolveFilePath(rootDir, pathname) {
	const clean = pathname.split("?")[0].replace(/^\/+|\/+$/g, "");
	if (!clean || clean === "__livereload") {
		return Url.join(rootDir, "index.html");
	}
	return Url.join(rootDir, ...clean.split("/"));
}

/**
 * The current reload version (increments on each save).
 * @returns {number}
 */
export function getVersion() {
	return version;
}

/** @param {string} content @param {string} status @param {string} contentType */
function makeResponse(content, status, contentType) {
	return {
		status,
		headers: { "Content-Type": contentType },
		body: content,
	};
}

/**
 * Handles one HTTP request.
 * @param {object} req request from cordova-plugin-server
 * @returns {Promise<object>} response object
 */
export async function handleRequest(req) {
	const rootDir = getRootDir();
	if (!rootDir) {
		return makeResponse("Live server: no folder opened", 500, "text/plain");
	}
	if (req.path === "/__livereload") {
		return makeResponse(String(version), 200, "text/plain");
	}
	const fileUrl = resolveFilePath(rootDir, req.path);
	try {
		const file = fsOperation(fileUrl);
		if (!(await file.exists())) {
			return makeResponse("404 Not Found", 404, "text/plain");
		}
		let content = await file.readFile("utf-8");
		const contentType = getContentType(req.path);
		if (contentType === "text/html") {
			content = injectReloadScript(content);
		}
		return makeResponse(content, 200, contentType);
	} catch (error) {
		return makeResponse(`Error: ${error?.message}`, 500, "text/plain");
	}
}

/**
 * Root dir served by the live server: first added folder or active file dir.
 * @returns {string|null}
 */
export function getRootDir() {
	const addedFolder = window.addedFolder?.[0]?.url;
	if (addedFolder) return addedFolder;
	const activeFile = window.editorManager?.activeFile?.uri;
	if (activeFile && activeFile.startsWith("file:")) {
		return Url.dirname(activeFile);
	}
	return null;
}

/**
 * Starts the live server.
 * @returns {Promise<boolean>}
 */
export async function startLiveServer() {
	if (serverInstance) {
		toast(
			strings["live server already running"] || "Live server already running",
		);
		return true;
	}
	if (
		typeof cordova === "undefined" ||
		typeof window.CreateServer !== "function"
	) {
		toast("Live server not available on this device");
		return false;
	}
	if (!getRootDir()) {
		toast(strings["open a folder first"] || "Open a folder first");
		return false;
	}
	try {
		serverInstance = window.CreateServer(
			PORT,
			(req) => {
				handleRequest(req)
					.then((response) => {
						serverInstance?.send(req.requestId, response);
					})
					.catch((error) => {
						serverInstance?.send(
							req.requestId,
							makeResponse(`Error: ${error?.message}`, 500, "text/plain"),
						);
					});
			},
			(error) => {
				console.error("[liveServer]", error);
				serverInstance = null;
			},
		);
		if (!watching) {
			watching = true;
			window.editorManager.on("save-file", () => {
				version++;
			});
		}
		toast(
			(strings["live server started"] || "Live server") +
				` :${PORT} · ` +
				(strings["same wifi"] || "open from another device on the same Wi-Fi"),
		);
		return true;
	} catch (error) {
		serverInstance = null;
		toast(error?.message || "Live server failed to start");
		return false;
	}
}

/**
 * Stops the live server.
 * @returns {Promise<void>}
 */
export async function stopLiveServer() {
	if (!serverInstance) return;
	await new Promise((resolve) => serverInstance.stop(resolve, resolve));
	serverInstance = null;
	toast(strings["live server stopped"] || "Live server stopped");
}

/**
 * @returns {boolean} whether the server is running
 */
export function isRunning() {
	return serverInstance !== null;
}

export default { startLiveServer, stopLiveServer, isRunning };
