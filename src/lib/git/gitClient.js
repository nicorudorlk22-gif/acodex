/**
 * Git integration for Acodex built on isomorphic-git with a filesystem
 * adapter over the app's fsOperation (works with SAF storage).
 */

import fsOperation from "fileSystem";
// biome-ignore lint/style/useNodejsImportProtocol: npm `buffer` is the browser polyfill used by isomorphic-git
import { Buffer } from "buffer";
import git from "isomorphic-git";
import Url from "utils/Url";

/**
 * Wraps a stat result into the shape isomorphic-git expects.
 * @param {object} stat raw stat from fsOperation
 * @returns {object}
 */
export function toGitStat(stat) {
	const isDir =
		stat.type === "dir" ||
		stat.isDirectory === true ||
		stat.type === "directory";
	return {
		isDirectory: () => isDir,
		isFile: () => !isDir,
		size: stat.size || 0,
		mtimeMs: new Date(stat.modifiedDate || Date.now()).getTime(),
		mtime: new Date(stat.modifiedDate || Date.now()),
		ino: 0,
		dev: 0,
		mode: isDir ? 0o40000 : 0o100644,
	};
}

/**
 * Builds an isomorphic-git fs adapter bound to a root directory.
 * @param {string} rootDir url of the git work tree root
 * @returns {object} fs with promises API
 */
export function createGitFs(rootDir) {
	const toUrl = (path) =>
		Url.join(rootDir, ...String(path).split("/").filter(Boolean));

	return {
		promises: {
			async readFile(path, options = {}) {
				const data = await fsOperation(toUrl(path)).readFile();
				const view = new Uint8Array(data || []);
				const buffer = Buffer.from(view);
				if (options.encoding === "utf8" || options.encoding === "utf-8") {
					return buffer.toString("utf8");
				}
				return buffer;
			},
			async writeFile(path, data) {
				const content =
					typeof data === "string"
						? Buffer.from(data, "utf8")
						: Buffer.from(data || []);
				await fsOperation(toUrl(path)).writeFile(content.buffer);
			},
			async unlink(path) {
				await fsOperation(toUrl(path)).delete();
			},
			async readdir(path) {
				const entries = await fsOperation(toUrl(path)).lsDir();
				return entries.map((entry) => entry.name || Url.basename(entry.url));
			},
			async mkdir(path) {
				await fsOperation(toUrl(path)).createDir?.();
			},
			async rmdir(path) {
				await fsOperation(toUrl(path)).deleteDir?.();
			},
			async stat(path) {
				const stat = await fsOperation(toUrl(path)).stat();
				return toGitStat(stat);
			},
			readlink: async (path) => path,
		},
	};
}

/** Returns the git work tree root (first opened folder) or null. */
export function getRootDir() {
	return window.addedFolder?.[0]?.url || null;
}

/**
 * Configures isomorphic-git call options for the current root.
 * @returns {Promise<object>} options for git.*
 */
async function gitOptions() {
	const dir = getRootDir();
	if (!dir) throw new Error("Open a folder first");
	return { fs: createGitFs(dir), dir: "/" };
}

/**
 * Initializes a repository in the opened folder.
 */
export async function gitInit() {
	return git.init({ ...(await gitOptions()), defaultBranch: "main" });
}

/**
 * Returns a textual status of the working tree.
 * @returns {Promise<Array<{file: string, code: string, staged: boolean}>>}
 */
export async function gitStatus() {
	const opts = await gitOptions();
	const matrix = await git.statusMatrix(opts);
	return matrix
		.filter(([_, head, workdir, stage]) => head !== workdir || head !== stage)
		.map(([file, head, workdir, stage]) => {
			let code = "M";
			if (head === 0 && stage === 0) code = "??";
			else if (workdir === 0) code = "D";
			else if (head === 0 && stage !== 0) code = "A";
			return { file, code, staged: stage !== head };
		});
}

/**
 * Stages every changed file and commits.
 * @param {string} message commit message
 * @param {{name: string, email: string}} author
 * @returns {Promise<string>} commit oid
 */
export async function gitCommit(message, author) {
	const opts = await gitOptions();
	const matrix = await git.statusMatrix(opts);
	for (const [file, head, workdir] of matrix) {
		if (head === workdir) continue;
		if (workdir === 0) {
			await git.remove({ ...opts, filepath: file });
		} else {
			await git.add({ ...opts, filepath: file });
		}
	}
	return git.commit({
		...opts,
		message,
		author: { name: author.name, email: author.email },
	});
}

/**
 * Returns the latest commits.
 * @param {number} [limit]
 * @returns {Promise<Array<{oid: string, message: string, author: string, timestamp: number}>>}
 */
export async function gitLog(limit = 20) {
	const opts = await gitOptions();
	const commits = await git.log({ ...opts, depth: limit });
	return commits.map(({ oid, commit }) => ({
		oid,
		message: commit.message,
		author: `${commit.author.name} <${commit.author.email}>`,
		timestamp: commit.author.timestamp * 1000,
	}));
}

/**
 * Sets or returns the origin remote url.
 * @param {string|null} [url]
 * @returns {Promise<string|null>}
 */
export async function gitRemote(url = null) {
	const opts = await gitOptions();
	if (url !== null && url !== undefined) {
		await git.setConfig({ ...opts, path: "remote.origin.url", value: url });
		return url;
	}
	return git.getConfig({ ...opts, path: "remote.origin.url" });
}

/**
 * Reads author name/email from git config.
 * @returns {Promise<{name: string, email: string}>}
 */
export async function getGitAuthor() {
	const opts = await gitOptions();
	const [name, email] = await Promise.all([
		git.getConfig({ ...opts, path: "user.name" }),
		git.getConfig({ ...opts, path: "user.email" }),
	]);
	return { name: name || "Acodex", email: email || "acodex@localhost" };
}

/**
 * Pushes to origin. Uses stored credentials when provided.
 * @param {{username?: string, token?: string}} [credentials]
 * @returns {Promise<object>} push result
 */
export async function gitPush(credentials = {}) {
	const opts = await gitOptions();
	const remoteUrl = await git.getConfig({ ...opts, path: "remote.origin.url" });
	if (!remoteUrl) throw new Error("No remote configured (git: set remote)");
	return git.push({
		...opts,
		remote: "origin",
		onAuth: () => ({
			username: credentials.username || "git",
			password: credentials.token || "",
		}),
	});
}

/**
 * Pulls from origin (fetch + fast-forward merge of the current branch).
 * @param {{username?: string, token?: string}} [credentials]
 * @returns {Promise<object>} merge result
 */
export async function gitPull(credentials = {}) {
	const opts = await gitOptions();
	const remoteUrl = await git.getConfig({ ...opts, path: "remote.origin.url" });
	if (!remoteUrl) throw new Error("No remote configured (git: set remote)");
	const auth = {
		onAuth: () => ({
			username: credentials.username || "git",
			password: credentials.token || "",
		}),
	};
	const currentBranch = await git.currentBranch({ ...opts, fullname: false });
	const fetchResult = await git.fetch({ ...opts, ...auth, remote: "origin" });
	const remoteRef = `origin/${currentBranch || "main"}`;
	let mergeResult = null;
	try {
		mergeResult = await git.fastForward({
			...opts,
			...auth,
			remote: remoteRef,
		});
	} catch {
		mergeResult = null;
	}
	return { fetchResult, mergeResult };
}

export default {
	gitInit,
	gitStatus,
	gitCommit,
	gitLog,
	gitRemote,
	gitPush,
	gitPull,
	getGitAuthor,
};
