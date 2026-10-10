/**
 * Restorable version history for open files.
 * Snapshots are stored under the app data dir whenever a file is saved
 * (listens to editorManager "save-file"). Max 20 versions per file (FIFO).
 */
import fsOperation from "fileSystem";
import { getDocText } from "cm/editorUtils";
import Url from "utils/Url";

const HISTORY_DIR_NAME = "acodex-history";
const MAX_VERSIONS = 20;

let started = false;

const historyDir = () => Url.join(window.DATA_STORAGE, HISTORY_DIR_NAME);

/**
 * Simple stable hash of a file uri (djb2).
 * @param {string} uri
 * @returns {string}
 */
function hashUri(uri) {
	let hash = 5381;
	for (let i = 0; i < uri.length; i++) {
		hash = ((hash << 5) + hash + uri.charCodeAt(i)) | 0;
	}
	return (hash >>> 0).toString(36);
}

/**
 * @param {string} uri
 * @returns {string} history folder for the file
 */
const fileHistoryDir = (uri) => Url.join(historyDir(), hashUri(uri));

/**
 * @param {string} uri
 * @returns {string} metadata index path
 */
const metadataPath = (uri) => Url.join(fileHistoryDir(uri), "meta.json");

/**
 * Ensures the history directories exist.
 * @param {string} uri
 */
async function ensureDirs(uri) {
	const root = fsOperation(historyDir());
	if (!(await root.exists())) {
		await fsOperation(window.DATA_STORAGE).createDirectory(HISTORY_DIR_NAME);
	}
	const fileDir = fsOperation(fileHistoryDir(uri));
	if (!(await fileDir.exists())) {
		await fsOperation(historyDir()).createDirectory(hashUri(uri));
	}
}

/**
 * Reads the metadata index (list of versions) of a file.
 * @param {string} uri
 * @returns {Promise<Array<{id: string, timestamp: number, size: number}>>}
 */
export async function getVersions(uri) {
	if (!uri) return [];
	try {
		const fs = fsOperation(metadataPath(uri));
		if (!(await fs.exists())) return [];
		const raw = await fs.readFile("utf-8");
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/**
 * Writes the metadata index.
 * @param {string} uri
 * @param {Array} versions
 */
async function writeMetadata(uri, versions) {
	const metaUri = metadataPath(uri);
	const existing = fsOperation(metaUri);
	if (await existing.exists()) await existing.delete();
	await fsOperation(fileHistoryDir(uri)).createFile(
		"meta.json",
		JSON.stringify(versions),
	);
}

/**
 * Stores a snapshot of the given content for the file.
 * @param {string} uri
 * @param {string} content
 * @returns {Promise<boolean>}
 */
export async function recordVersion(uri, content) {
	if (!uri || typeof content !== "string") return false;
	try {
		await ensureDirs(uri);
		const versions = await getVersions(uri);
		const id = `${Date.now()}`;
		await fsOperation(fileHistoryDir(uri)).createFile(`${id}.txt`, content);

		versions.push({ id, timestamp: Number(id), size: content.length });
		while (versions.length > MAX_VERSIONS) {
			const removed = versions.shift();
			try {
				const old = fsOperation(
					Url.join(fileHistoryDir(uri), `${removed.id}.txt`),
				);
				if (await old.exists()) await old.delete();
			} catch {
				// best effort cleanup
			}
		}
		await writeMetadata(uri, versions);
		return true;
	} catch (error) {
		console.warn("[fileHistory] record failed:", error?.message);
		return false;
	}
}

/**
 * Reads the content of a stored version.
 * @param {string} uri
 * @param {string} versionId
 * @returns {Promise<string|null>}
 */
export async function getVersionContent(uri, versionId) {
	try {
		const fs = fsOperation(Url.join(fileHistoryDir(uri), `${versionId}.txt`));
		return await fs.readFile("utf-8");
	} catch {
		return null;
	}
}

/**
 * Starts listening for file saves and records versions.
 */
export function startFileHistory() {
	if (started) return;
	started = true;
	editorManager.on("save-file", (file) => {
		if (!file?.uri || file.readOnly) return;
		try {
			recordVersion(file.uri, getDocText(file.session));
		} catch {
			// never break saving because of history
		}
	});
}

export default {
	startFileHistory,
	getVersions,
	getVersionContent,
	recordVersion,
	MAX_VERSIONS,
};
