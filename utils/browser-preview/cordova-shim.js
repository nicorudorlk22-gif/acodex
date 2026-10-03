/**
 * Browser preview shim (development only).
 *
 * Acode is an Android app: it boots on Cordova's `deviceready` event and talks to
 * native plugins for storage (`System`, `SDcard`, cordova-plugin-file). This file
 * emulates that native layer in a normal browser so the app can be developed and
 * inspected in the Base44 preview, served by `utils/scripts/preview-dev.js`.
 *
 * It is never loaded by the Android build: the preview dev server injects it into
 * the served `www/index.html` only.
 *
 * Emulated:
 *  - `window.resolveLocalFileSystemURL` backed by IndexedDB (file:/// URLs, so the
 *    app's own `fileSystem` providers match them).
 *  - `cordova.file` paths.
 *  - Cordova service proxies: System (encodings, permissions, app info),
 *    SDcard (file stats/read/write), Clipboard.
 *  - BuildInfo globals.
 *  - Live reload over Server-Sent Events.
 */
(function () {
	"use strict";

	const log = (...args) => console.log("[preview]", ...args);

	/* ------------------------------------------------------------------ *
	 * Live reload
	 * ------------------------------------------------------------------ */

	try {
		const source = new EventSource("/__acode-livereload");
		source.onmessage = (event) => {
			if (event.data === "reload") location.reload();
		};
	} catch (error) {
		log("live reload unavailable", error);
	}

	/* ------------------------------------------------------------------ *
	 * IndexedDB backed file system
	 * ------------------------------------------------------------------ */

	const DB_NAME = "acode-preview";
	const STORE = "entries";
	const ROOTS = [
		"file:///data",
		"file:///cache",
		"file:///sdcard",
		"file:///documents",
	];
	const FILE_ERROR = {
		NOT_FOUND_ERR: 1,
		SECURITY_ERR: 2,
		ABORT_ERR: 3,
		NOT_READABLE_ERR: 4,
		NOT_MODIFIED_ERR: 6,
		INVALID_MODIFICATION_ERR: 9,
		QUOTA_EXCEEDED_ERR: 10,
		TYPE_MISMATCH_ERR: 11,
		PATH_EXISTS_ERR: 12,
	};

	/** @type {Map<string, {path: string, isFile: boolean, blob?: Blob, lastModified: number}>} */
	const store = new Map();
	let databasePromise = null;
	let loadedPromise = null;

	function openDatabase() {
		if (databasePromise) return databasePromise;
		databasePromise = new Promise((resolve, reject) => {
			if (!window.indexedDB) {
				reject(new Error("IndexedDB unavailable"));
				return;
			}
			const request = indexedDB.open(DB_NAME, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE)) {
					db.createObjectStore(STORE, { keyPath: "path" });
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return databasePromise;
	}

	async function persist(record) {
		const db = await openDatabase();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE, "readwrite");
			transaction.objectStore(STORE).put(record);
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error);
		});
	}

	async function forget(paths) {
		const db = await openDatabase();
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(STORE, "readwrite");
			const objectStore = transaction.objectStore(STORE);
			paths.forEach((path) => objectStore.delete(path));
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error);
		});
	}

	async function ensureLoaded() {
		if (!loadedPromise) {
			loadedPromise = (async () => {
				try {
					const db = await openDatabase();
					await new Promise((resolve, reject) => {
						const transaction = db.transaction(STORE, "readonly");
						const request = transaction.objectStore(STORE).getAll();
						request.onsuccess = () => {
							(request.result || []).forEach((record) => {
								store.set(record.path, record);
							});
							resolve();
						};
						request.onerror = () => reject(request.error);
					});
				} catch (error) {
					log("persistence unavailable, using memory only", error);
				}
				ROOTS.forEach((path) => {
					if (!store.has(path)) {
						const record = { path, isFile: false, lastModified: Date.now() };
						store.set(path, record);
						persist(record).catch(() => {});
					}
				});
			})();
		}
		return loadedPromise;
	}

	function decodeSegment(segment) {
		try {
			return decodeURIComponent(segment);
		} catch (error) {
			return segment;
		}
	}

	/** Canonical, decoded `file:///` path without a trailing slash. */
	function toPath(url) {
		let path = String(url || "").split("?")[0];
		if (!/^file:/i.test(path)) return path;
		path = "file:///" + path.replace(/^file:\/+/i, "");
		path = path
			.split("/")
			.map((part, index) => (index < 3 ? part : decodeSegment(part)))
			.join("/");
		return path.replace(/\/+$/, "") || "file:///";
	}

	function childPath(parent, name) {
		return `${parent}/${decodeSegment(String(name)).replace(/^\/+|\/+$/g, "")}`;
	}

	function listChildren(path) {
		const prefix = `${path}/`;
		const children = [];
		store.forEach((record) => {
			if (!record.path.startsWith(prefix)) return;
			const rest = record.path.slice(prefix.length);
			if (!rest || rest.includes("/")) return;
			children.push(record.path);
		});
		return children.sort((a, b) => a.localeCompare(b));
	}

	function descendants(path) {
		const prefix = `${path}/`;
		const paths = [];
		store.forEach((record) => {
			if (record.path.startsWith(prefix)) paths.push(record.path);
		});
		return paths;
	}

	function error(code, message) {
		return { code, message: message || "" };
	}

	function asBlob(data) {
		if (data instanceof Blob) return data;
		if (data instanceof ArrayBuffer) return new Blob([data]);
		if (ArrayBuffer.isView(data)) return new Blob([data.buffer]);
		if (typeof data === "string") return new Blob([data]);
		if (data === undefined || data === null) return new Blob([]);
		return new Blob([String(data)]);
	}

	function objectUrl(path) {
		const record = store.get(path);
		if (!record || !record.isFile) return path;
		return URL.createObjectURL(record.blob || new Blob([]));
	}

	function createEntry(path) {
		const record = store.get(path);
		if (!record) return null;

		const isFile = !!record.isFile;
		const name = path.split("/").pop() || "";
		const size = record.blob ? record.blob.size : 0;

		const entry = {
			isFile,
			isDirectory: !isFile,
			name,
			fullPath: `/${path.replace(/^file:\/\/\//, "")}`,
			nativeURL: path,
			toURL: () => (isFile ? path : `${path}/`),
			toInternalURL: () => (isFile ? objectUrl(path) : `${path}/`),
			toNativeURL: () => (isFile ? path : `${path}/`),
			getMetadata: (onSuccess) => {
				onSuccess({
					name,
					fullPath: entry.fullPath,
					size,
					modificationTime: new Date(record.lastModified || Date.now()),
					isFile,
					isDirectory: !isFile,
				});
			},
			setMetadata: (onSuccess, onError) => onError && onError(error(6)),
			getParent: (onSuccess) => {
				const parent = path.split("/").slice(0, -1).join("/");
				if (!parent || parent === "file:") return onSuccess(entry);
				onSuccess(createEntry(parent) || entry);
			},
			remove: async (onSuccess, onError) => {
				await ensureLoaded();
				if (!isFile && listChildren(path).length) {
					return onError(error(FILE_ERROR.INVALID_MODIFICATION_ERR));
				}
				store.delete(path);
				forget([path]).catch(() => {});
				onSuccess();
			},
			removeRecursively: async (onSuccess) => {
				await ensureLoaded();
				const paths = [path, ...descendants(path)];
				paths.forEach((item) => store.delete(item));
				forget(paths).catch(() => {});
				onSuccess();
			},
			moveTo: (parentEntry, newName) =>
				transfer(path, parentEntry, newName, false),
			copyTo: (parentEntry, newName) =>
				transfer(path, parentEntry, newName, true),
		};

		if (isFile) {
			entry.file = (onSuccess) => {
				onSuccess(
					new File([record.blob || new Blob([])], name, {
						lastModified: record.lastModified || Date.now(),
						type: record.blob ? record.blob.type : "",
					}),
				);
			};

			entry.createWriter = (onSuccess) => {
				const writer = {
					position: 0,
					length: size,
					readyState: 1,
					onwriteend: null,
					onerror: null,
					onwritestart: null,
					onprogress: null,
					abort() {},
					seek(position) {
						writer.position = position;
					},
					truncate(length) {
						const blob = store.get(path)?.blob || new Blob([]);
						const next = blob.slice(0, length || 0);
						store.set(path, { path, isFile: true, blob: next, lastModified: Date.now() });
						persist(store.get(path)).catch(() => {});
						if (writer.onwriteend) writer.onwriteend({ target: writer });
					},
					async write(data) {
						try {
							await ensureLoaded();
							const blob = asBlob(data);
							store.set(path, {
								path,
								isFile: true,
								blob,
								lastModified: Date.now(),
							});
							await persist(store.get(path));
							writer.length = blob.size;
							if (writer.onwriteend) writer.onwriteend({ target: writer });
						} catch (writeError) {
							if (writer.onerror) {
								writer.onerror({
									target: { error: error(FILE_ERROR.INVALID_MODIFICATION_ERR, String(writeError)) },
								});
							}
						}
					},
				};
				onSuccess(writer);
			};
			return entry;
		}

		entry.createReader = () => ({
			readEntries: async (onSuccess) => {
				await ensureLoaded();
				onSuccess(
					listChildren(path)
						.map((child) => createEntry(child))
						.filter(Boolean),
				);
			},
		});

		const addChild = (name, create, exclusive, isDir, onSuccess, onError) => {
			const target = childPath(path, name);
			const existing = store.get(target);
			if (existing) {
				if (!!existing.isFile !== !isDir) return onError(error(FILE_ERROR.TYPE_MISMATCH_ERR));
				if (create && exclusive) return onError(error(FILE_ERROR.PATH_EXISTS_ERR));
				return onSuccess(createEntry(target));
			}
			if (!create) return onError(error(FILE_ERROR.NOT_FOUND_ERR));
			const record = {
				path: target,
				isFile: !isDir,
				blob: isDir ? undefined : new Blob([]),
				lastModified: Date.now(),
			};
			store.set(target, record);
			persist(record).catch(() => {});
			onSuccess(createEntry(target));
		};

		entry.getFile = async (name, options, onSuccess, onError) => {
			await ensureLoaded();
			const opts = options || {};
			addChild(name, !!opts.create, !!opts.exclusive, false, onSuccess, onError);
		};

		entry.getDirectory = async (name, options, onSuccess, onError) => {
			await ensureLoaded();
			const opts = options || {};
			addChild(name, !!opts.create, !!opts.exclusive, true, onSuccess, onError);
		};

		return entry;
	}

	function transfer(path, parentEntry, newName, isCopy) {
		ensureLoaded().then(() => {
			const record = store.get(path);
			if (!record) return;
			const parent = parentEntry ? toPath(parentEntry.nativeURL) : path.split("/").slice(0, -1).join("/");
			const target = childPath(parent, newName || record.path.split("/").pop());
			if (target === path) return;
			if (store.has(target)) return;

			const paths = [path, ...descendants(path)];
			paths.forEach((item) => {
				const source = store.get(item);
				if (!source) return;
				const moved = { ...source, path: target + item.slice(path.length) };
				store.set(moved.path, moved);
				persist(moved).catch(() => {});
				if (!isCopy) {
					store.delete(item);
					forget([item]).catch(() => {});
				}
			});
		});
	}

	function resolveLocalFileSystemURL(url, onSuccess, onError) {
		const path = toPath(url);
		ensureLoaded().then(() => {
			const entry = createEntry(path);
			if (!entry) return onError && onError(error(FILE_ERROR.NOT_FOUND_ERR));
			onSuccess(entry);
		});
	}

	const cordovaFilePaths = {
		applicationDirectory: location.origin + "/",
		applicationStorageDirectory: null,
		dataDirectory: "file:///data/",
		cacheDirectory: "file:///cache/",
		externalApplicationStorageDirectory: null,
		externalDataDirectory: null,
		externalCacheDirectory: null,
		externalRootDirectory: "file:///sdcard/",
		documentsDirectory: "file:///documents/",
		sharedDirectory: null,
		syncedDataDirectory: null,
		tempDirectory: "file:///cache/",
	};

	function applyFileSystem() {
		ensureLoaded();
		window.resolveLocalFileSystemURL = resolveLocalFileSystemURL;
		if (window.cordova) window.cordova.file = { ...cordovaFilePaths };
	}

	applyFileSystem();

	/* ------------------------------------------------------------------ *
	 * Native globals
	 * ------------------------------------------------------------------ */

	if (typeof window.BuildInfo === "undefined") {
		window.BuildInfo = {
			baseUrl: null,
			packageName: "com.foxdebug.acode",
			basePackageName: "com.foxdebug.acode",
			displayName: "Acode",
			name: "Acode",
			version: "1.13.5",
			versionCode: 1013005,
			debug: true,
			buildType: "debug",
			flavor: "browser",
		};
	}

	if (typeof window.iap === "undefined") {
		const unsupported = () => {};
		window.iap = new Proxy(
			{},
			{
				get: () => unsupported,
			},
		);
	}

	/* ------------------------------------------------------------------ *
	 * Cordova service proxies
	 * ------------------------------------------------------------------ */

	const ENCODINGS = {
		"UTF-8": {
			label: "UTF-8",
			name: "UTF-8",
			aliases: ["utf8", "utf-8", "unicode-1-1-utf-8"],
		},
		"UTF-16LE": {
			label: "UTF-16LE",
			name: "UTF-16LE",
			aliases: ["utf16", "utf-16", "unicode", "utf-16le"],
		},
		"UTF-16BE": {
			label: "UTF-16BE",
			name: "UTF-16BE",
			aliases: ["utf-16be"],
		},
		"ISO-8859-1": {
			label: "ISO-8859-1",
			name: "ISO-8859-1",
			aliases: ["latin1", "iso8859-1", "iso_8859-1", "iso-8859-1"],
		},
		"windows-1252": {
			label: "windows-1252",
			name: "windows-1252",
			aliases: ["cp1252", "windows1252"],
		},
		"US-ASCII": {
			label: "US-ASCII",
			name: "US-ASCII",
			aliases: ["ascii", "usascii"],
		},
	};

	function decodeBuffer(buffer, charset) {
		try {
			return new TextDecoder(charset || "utf-8").decode(buffer);
		} catch (error) {
			return new TextDecoder("utf-8").decode(buffer);
		}
	}

	function encodeText(text, charset) {
		const name = (charset || "UTF-8").toUpperCase();
		if (name === "UTF-16LE" || name === "UTF-16BE") {
			const bytes = new Uint8Array(text.length * 2);
			const little = name === "UTF-16LE";
			for (let i = 0; i < text.length; i++) {
				const code = text.charCodeAt(i);
				bytes[i * 2] = little ? code & 0xff : code >> 8;
				bytes[i * 2 + 1] = little ? code >> 8 : code & 0xff;
			}
			return bytes.buffer;
		}
		return new TextEncoder().encode(text).buffer;
	}

	function statOf(path) {
		const record = store.get(toPath(path));
		if (!record) return null;
		return {
			name: record.path.split("/").pop() || "",
			url: record.path,
			uri: record.path,
			isFile: !!record.isFile,
			isDirectory: !record.isFile,
			isLink: false,
			size: record.blob ? record.blob.size : 0,
			modifiedDate: record.lastModified || Date.now(),
			canRead: true,
			canWrite: true,
		};
	}

	async function writeFile(path, data, encoding) {
		await ensureLoaded();
		const blob = data instanceof Blob ? data : asBlob(data);
		const record = {
			path: toPath(path),
			isFile: true,
			blob: encoding ? asBlob(decodeBuffer(await blob.arrayBuffer(), encoding)) : blob,
			lastModified: Date.now(),
		};
		store.set(record.path, record);
		await persist(record);
		return record.path;
	}

	function removePath(path) {
		const target = toPath(path);
		const paths = [target, ...descendants(target)];
		paths.forEach((item) => store.delete(item));
		forget(paths).catch(() => {});
		return true;
	}

	const systemProxy = {
		"get-available-encodings": (onSuccess) => onSuccess(ENCODINGS),
		decode: (onSuccess, onError, args) => {
			try {
				onSuccess(decodeBuffer(args[0], args[1]));
			} catch (error) {
				onError(String(error));
			}
		},
		encode: (onSuccess, onError, args) => {
			try {
				onSuccess(encodeText(args[0], args[1]));
			} catch (error) {
				onError(String(error));
			}
		},
		hasPermission: (onSuccess) => onSuccess(true),
		requestPermission: (onSuccess) => onSuccess(1),
		isManageExternalStorageDeclared: (onSuccess) => onSuccess(false),
		hasGrantedStorageManager: (onSuccess) => onSuccess(false),
		requestStorageManager: (onSuccess) => onSuccess(false),
		getInstaller: (onSuccess) => onSuccess("browser-preview"),
		getAndroidVersion: (onSuccess) => onSuccess(34),
		getArch: (onSuccess) => onSuccess("browser"),
		getFilesDir: (onSuccess) => onSuccess("file:///data"),
		getNativeLibraryPath: (onSuccess) => onSuccess("file:///data"),
		clearCache: (onSuccess) => onSuccess(true),
		isPowerSaveMode: (onSuccess) => onSuccess(false),
		getWebviewInfo: (onSuccess) =>
			onSuccess({ version: navigator.userAgent, package: navigator.vendor }),
		getAppInfo: (onSuccess) =>
			onSuccess({
				packageName: window.BuildInfo.packageName,
				versionName: window.BuildInfo.version,
				versionCode: window.BuildInfo.versionCode,
			}),
		"get-app-info": (onSuccess) => systemProxy.getAppInfo(onSuccess),
		getGlobalSetting: (onSuccess, onError) => onError("unsupported in browser preview"),
		fileExists: (onSuccess, onError, args) => {
			ensureLoaded().then(() => onSuccess(store.has(toPath(args[0]))));
		},
		mkdirs: (onSuccess, onError, args) => {
			ensureLoaded().then(() => {
				const target = toPath(args[0]);
				if (!store.has(target)) {
					const record = { path: target, isFile: false, lastModified: Date.now() };
					store.set(target, record);
					persist(record).catch(() => {});
				}
				onSuccess(true);
			});
		},
		deleteFile: (onSuccess, onError, args) => {
			ensureLoaded().then(() => onSuccess(removePath(args[0])));
		},
		writeText: (onSuccess, onError, args) => {
			writeFile(args[0], args[1]).then(() => onSuccess(true), onError);
		},
		setExec: (onSuccess) => onSuccess(true),
		compareTexts: (onSuccess) => onSuccess(0),
		compareFileText: (onSuccess) => onSuccess(0),
		openInBrowser: (onSuccess, onError, args) => {
			window.open(args[0], "_blank", "noopener");
			onSuccess(true);
		},
		getParentPath: (onSuccess, onError, args) => {
			const path = toPath(args[0]);
			onSuccess(path.split("/").slice(0, -1).join("/"));
		},
		listChildren: (onSuccess, onError, args) => {
			ensureLoaded().then(() => onSuccess(listChildren(toPath(args[0]))));
		},
		shareText: (onSuccess, onError, args) => {
			if (navigator.share) return navigator.share({ text: args[0] }).then(onSuccess, onError);
			onError("sharing unsupported in browser preview");
		},
		setInputType: (onSuccess) => onSuccess(true),
		setUiTheme: (onSuccess) => onSuccess(true),
		setNativeContextMenuDisabled: (onSuccess) => onSuccess(true),
		setIntentHandler: (onSuccess) => onSuccess(true),
		getCordovaIntent: (onSuccess) => onSuccess(null),
		getRewardStatus: (onSuccess) => onSuccess({ adsRequired: 0 }),
	};

	const sdcardProxy = {
		stats: (onSuccess, onError, args) => {
			ensureLoaded().then(() => {
				const stat = statOf(args[0]);
				if (!stat) return onError(error(FILE_ERROR.NOT_FOUND_ERR));
				onSuccess(stat);
			});
		},
		exists: (onSuccess, onError, args) => {
			ensureLoaded().then(() => onSuccess(store.has(toPath(args[0]))));
		},
		"list directory": (onSuccess, onError, args) => {
			ensureLoaded().then(() => {
				onSuccess(
					listChildren(toPath(args[0]))
						.map((child) => statOf(child))
						.filter(Boolean),
				);
			});
		},
		read: (onSuccess, onError, args) => {
			ensureLoaded().then(async () => {
				const record = store.get(toPath(args[0]));
				if (!record || !record.isFile) return onError(error(FILE_ERROR.NOT_READABLE_ERR));
				onSuccess(await (record.blob || new Blob([])).arrayBuffer());
			});
		},
		readAsText: (onSuccess, onError, args) => {
			ensureLoaded().then(async () => {
				const record = store.get(toPath(args[0]));
				if (!record || !record.isFile) return onError(error(FILE_ERROR.NOT_READABLE_ERR));
				onSuccess(decodeBuffer(await (record.blob || new Blob([])).arrayBuffer(), args[1]));
			});
		},
		write: (onSuccess, onError, args) => {
			writeFile(args[0], args[1]).then(onSuccess, onError);
		},
		writeText: (onSuccess, onError, args) => {
			writeFile(args[0], args[1]).then(onSuccess, onError);
		},
		"create file": (onSuccess, onError, args) => {
			writeFile(`${toPath(args[0])}/${decodeSegment(args[1])}`, new Blob([])).then(
				onSuccess,
				onError,
			);
		},
		"create directory": (onSuccess, onError, args) => {
			ensureLoaded().then(() => {
				const target = childPath(toPath(args[0]), args[1]);
				const record = { path: target, isFile: false, lastModified: Date.now() };
				store.set(target, record);
				persist(record).catch(() => {});
				onSuccess(target);
			});
		},
		delete: (onSuccess, onError, args) => {
			ensureLoaded().then(() => onSuccess(removePath(args[0])));
		},
		rename: (onSuccess, onError, args) => {
			ensureLoaded().then(() => {
				const source = toPath(args[0]);
				transfer(source, undefined, args[1], false);
				onSuccess(childPath(source.split("/").slice(0, -1).join("/"), args[1]));
			});
		},
		move: (onSuccess, onError, args) => {
			ensureLoaded().then(() => {
				const target = toPath(args[1]);
				transfer(toPath(args[0]), createEntry(target.split("/").slice(0, -1).join("/")), target.split("/").pop(), false);
				onSuccess(target);
			});
		},
		copy: (onSuccess, onError, args) => {
			ensureLoaded().then(() => {
				const target = toPath(args[1]);
				transfer(toPath(args[0]), createEntry(target.split("/").slice(0, -1).join("/")), target.split("/").pop(), true);
				onSuccess(target);
			});
		},
		"format uri": (onSuccess, onError, args) => onSuccess(args[0]),
		"list volumes": (onSuccess) => onSuccess([]),
		"list encodings": (onSuccess) => onSuccess(ENCODINGS),
		"watch file": (onSuccess) => onSuccess(true),
		"unwatch file": (onSuccess) => onSuccess(true),
		"get path": (onSuccess, onError, args) => onSuccess(args[0]),
	};

	const clipboardProxy = {
		copy: (onSuccess, onError, args) => {
			navigator.clipboard
				? navigator.clipboard.writeText(args[0]).then(() => onSuccess(args[0]), onError)
				: onError("clipboard unsupported in browser preview");
		},
		paste: (onSuccess, onError) => {
			navigator.clipboard
				? navigator.clipboard.readText().then(onSuccess, onError)
				: onError("clipboard unsupported in browser preview");
		},
		clear: (onSuccess, onError) => {
			navigator.clipboard
				? navigator.clipboard.writeText("").then(() => onSuccess(true), onError)
				: onError("clipboard unsupported in browser preview");
		},
	};

	function registerProxies() {
		if (!window.cordova || !window.cordova.require) return;
		let proxy;
		try {
			proxy = window.cordova.require("cordova/exec/proxy");
		} catch (error) {
			log("exec proxy module unavailable", error);
			return;
		}
		// Cordova resolves a proxy by service + action, so each service is
		// registered as a map of action name -> handler.
		proxy.add("System", systemProxy);
		proxy.add("SDcard", sdcardProxy);
		proxy.add("Clipboard", clipboardProxy);
	}

	registerProxies();

	/* ------------------------------------------------------------------ *
	 * Boot hooks
	 * ------------------------------------------------------------------ */

	document.addEventListener("deviceready", () => {
		registerProxies();
		applyFileSystem();
		log("native layer emulated (filesystem, system, sdcard, clipboard)");
	});

	document.addEventListener("filePluginIsReady", applyFileSystem);
})();
