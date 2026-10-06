/**
 * Registers Acodex extended commands (AI, git, live server, python runner,
 * onboarding) so they appear in the command palette and keybindings.
 */
import { registerExternalCommand } from "cm/commandRegistry";
import alert from "dialogs/alert";
import prompt from "dialogs/prompt";

const t = (key, fallback) => globalThis.strings?.[key] || fallback;

/**
 * @param {object} [helpers] { toast }
 */
export function registerExtendedCommands({ toast } = {}) {
	const aiCommands = [
		["ai-explain", t("ai explain code", "AI: explain this code"), "explain"],
		[
			"ai-refactor",
			t("ai refactor code", "AI: refactor this code"),
			"refactor",
		],
		["ai-tests", t("ai generate tests", "AI: generate tests"), "tests"],
		["ai-fix", t("ai fix errors", "AI: fix errors"), "fix"],
	];
	for (const [name, description, id] of aiCommands) {
		registerExternalCommand({
			name,
			description,
			requiresView: false,
			readOnly: true,
			exec: async () => {
				const { default: aiCommand } = await import(
					/* webpackChunkName: "aiCommands" */ "lib/acodexAi/commands"
				);
				await aiCommand(id);
			},
		});
	}

	registerExternalCommand({
		name: "live-server-start",
		description: t("live server start", "Live server: start"),
		requiresView: false,
		readOnly: true,
		exec: async () => {
			const { startLiveServer } = await import(
				/* webpackChunkName: "liveServer" */ "lib/liveServer"
			);
			await startLiveServer();
		},
	});
	registerExternalCommand({
		name: "live-server-stop",
		description: t("live server stop", "Live server: stop"),
		requiresView: false,
		readOnly: true,
		exec: async () => {
			const { stopLiveServer } = await import(
				/* webpackChunkName: "liveServer" */ "lib/liveServer"
			);
			await stopLiveServer();
		},
	});

	registerExternalCommand({
		name: "run-python",
		description: t("run python file", "Run Python file"),
		requiresView: false,
		readOnly: true,
		exec: async () => {
			const { default: runPython } = await import(
				/* webpackChunkName: "pythonRunner" */ "lib/pythonRunner"
			);
			await runPython();
		},
	});

	registerExternalCommand({
		name: "git-init",
		description: t("git init repository", "Git: init repository"),
		requiresView: false,
		readOnly: false,
		exec: async () => {
			const { gitInit } = await import(
				/* webpackChunkName: "gitClient" */ "lib/git/gitClient"
			);
			await gitInit();
			toast?.(t("git repository initialized", "Git repository initialized"));
		},
	});
	registerExternalCommand({
		name: "git-status",
		description: t("git status", "Git: status"),
		requiresView: false,
		readOnly: true,
		exec: async () => {
			const { gitStatus } = await import(
				/* webpackChunkName: "gitClient" */ "lib/git/gitClient"
			);
			const status = await gitStatus();
			if (!status.length) {
				toast?.(t("git nothing changed", "Git: nothing changed"));
				return;
			}
			alert("Git status", status.map((s) => s.code + "  " + s.file).join("\n"));
		},
	});
	registerExternalCommand({
		name: "git-commit",
		description: t("git commit all changes", "Git: commit all changes"),
		requiresView: false,
		readOnly: false,
		exec: async () => {
			const { gitCommit, getGitAuthor } = await import(
				/* webpackChunkName: "gitClient" */ "lib/git/gitClient"
			);
			const message = await prompt(
				t("commit message", "Commit message"),
				"",
				"text",
				{
					required: true,
				},
			);
			if (!message) return;
			const author = await getGitAuthor();
			const oid = await gitCommit(message, author);
			toast?.("Committed " + oid.slice(0, 7));
		},
	});
	registerExternalCommand({
		name: "git-log",
		description: t("git show history", "Git: show history"),
		requiresView: false,
		readOnly: true,
		exec: async () => {
			const { gitLog } = await import(
				/* webpackChunkName: "gitClient" */ "lib/git/gitClient"
			);
			const commits = await gitLog();
			alert(
				"Git history",
				commits
					.map(
						(c) =>
							c.oid.slice(0, 7) +
							" \u00b7 " +
							new Date(c.timestamp).toLocaleString() +
							"\n" +
							c.message +
							"\n\u2014 " +
							c.author,
					)
					.join("\n\n") || "No commits yet",
			);
		},
	});
	registerExternalCommand({
		name: "git-set-remote",
		description: t("git set remote url", "Git: set remote URL"),
		requiresView: false,
		readOnly: false,
		exec: async () => {
			const { gitRemote } = await import(
				/* webpackChunkName: "gitClient" */ "lib/git/gitClient"
			);
			const url = await prompt(
				t("remote url", "Remote URL (https://github.com/user/repo.git)"),
				"",
				"url",
				{ required: true },
			);
			if (!url) return;
			await gitRemote(url);
			toast?.(t("git remote configured", "Remote configured"));
		},
	});
	registerExternalCommand({
		name: "git-push",
		description: t("git push to origin", "Git: push to origin"),
		requiresView: false,
		readOnly: false,
		exec: async () => {
			const { gitPush } = await import(
				/* webpackChunkName: "gitClient" */ "lib/git/gitClient"
			);
			const token = await prompt(
				t("access token", "Access token (PAT, optional)"),
				"",
				"password",
				{ required: false },
			);
			try {
				await gitPush(token ? { token } : {});
				toast?.(t("git pushed", "Pushed \u2713"));
			} catch (error) {
				alert(
					t("git push failed", "Git push failed"),
					error?.message || String(error),
				);
			}
		},
	});
	registerExternalCommand({
		name: "git-pull",
		description: t("git pull from origin", "Git: pull from origin"),
		requiresView: false,
		readOnly: false,
		exec: async () => {
			const { gitPull } = await import(
				/* webpackChunkName: "gitClient" */ "lib/git/gitClient"
			);
			const token = await prompt(
				t("access token", "Access token (PAT, optional)"),
				"",
				"password",
				{ required: false },
			);
			try {
				await gitPull(token ? { token } : {});
				toast?.(t("git pull done", "Pull done \u2713"));
			} catch (error) {
				alert(
					t("git pull failed", "Git pull failed"),
					error?.message || String(error),
				);
			}
		},
	});
}

export default registerExtendedCommands;
