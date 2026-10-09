import "./style.scss";
import "./modelSwitcher.scss";
import confirm from "dialogs/confirm";
import multiPrompt from "dialogs/multiPrompt";
import { runAgent } from "lib/acodexAi/agent";
import { validateAiConfig, withBuiltinKey } from "lib/acodexAi/client";
import { createToolRegistry } from "lib/acodexAi/tools";
import commands from "lib/commands";
import EditorFile from "lib/editorFile";
import openFile from "lib/openFile";
import appSettings from "lib/settings";
import { renderAssistantMessage } from "./format";
import { createModelSwitcher } from "./modelSwitcher";

const TOOL_LABELS = {
	get_active_file: "Lendo arquivo ativo",
	get_selection: "Lendo seleção",
	list_open_files: "Listando abas",
	switch_to_file: "Trocando de aba",
	replace_active_file: "Editando arquivo",
	insert_text: "Inserindo texto",
	create_file: "Criando arquivo",
	open_file: "Abrindo arquivo",
	list_commands: "Listando comandos",
	search_open_files: "Buscando nos arquivos",
	run_command: "Executando comando",
};

const SUGGESTIONS = [
	"Explique o arquivo aberto",
	"Encontre bugs neste código",
	"Refatore a seleção atual",
	"Busque TODO nos arquivos abertos",
];

const FENCE = "```";

const SLASH_COMMANDS = [
	{ cmd: "/arquivo", desc: "Envia o arquivo atual como contexto" },
	{ cmd: "/selecao", desc: "Envia a seleção atual como contexto" },
	{ cmd: "/busca", desc: "Busca texto nos arquivos abertos" },
	{ cmd: "/modelo", desc: "Troca o modelo de IA" },
	{ cmd: "/limpar", desc: "Apaga a conversa" },
	{ cmd: "/ajuda", desc: "Mostra os comandos" },
];

const CONFIG_ERRORS = {
	"missing-api-key": "Configure sua chave de API para usar o Acodex AI.",
	"missing-model": "Informe um modelo nas configurações.",
	"invalid-base-url": "URL base inválida.",
	"insecure-base-url": "A URL base precisa usar HTTPS.",
};

export default ["brain", "acodex-ai", "Acodex AI", initApp, false, () => {}];

/** @type {import("lib/acodexAi/client").ChatMessage[]} */
let history = [];
/** @type {AbortController|null} */
let controller = null;
/** @type {HTMLElement|null} */
let $liveMsg = null;
/** @type {string} */
let liveBuffer = "";
/** @type {HTMLElement|null} */
let $hints;
/** @type {{ $toggle: HTMLElement, open: () => void }|null} */
let switcherApi = null;
/** @type {HTMLElement} */
let $messages;
/** @type {HTMLTextAreaElement} */
let $input;
/** @type {HTMLButtonElement} */
let $sendBtn;

const registry = createToolRegistry({
	getActiveFile: () => editorManager.activeFile,
	getOpenFiles: () => editorManager.files,
	getEditor: () =>
		editorManager.activeFile?.type === "editor" ? editorManager.editor : null,
	createFile: (name, text) => new EditorFile(name, { text, isUnsaved: true }),
	openFile: (uri) => openFile(uri),
	switchFile: (file) => editorManager.switchFile(file.id),
	execCommand: (command, arg) => commands[command](arg),
	listCommands: () => Object.keys(commands),
	confirm: (title, message) => confirm(title, message),
});

function getConfig() {
	const { aiBaseUrl, aiApiKey, aiModel } = appSettings.value;
	return withBuiltinKey({
		baseUrl: aiBaseUrl,
		apiKey: aiApiKey,
		model: aiModel,
	});
}

/**
 * @param {HTMLElement} el
 */
function initApp(el) {
	el.classList.add("acodex-ai");

	$messages = <div className="ai-messages scroll" aria-live="polite"></div>;
	$input = (
		<textarea
			className="ai-input"
			rows="2"
			placeholder="Pergunte ou peça uma tarefa..."
			aria-label="Mensagem para o Acodex AI"
			onkeydown={onKeyDown}
			oninput={() => {
				autoResize();
				updateHints();
			}}
		/>
	);
	$sendBtn = (
		<button
			type="button"
			className="ai-send"
			aria-label="Enviar"
			onclick={onSendClick}
		>
			<span className="icon arrow_upward" />
		</button>
	);

	const switcher = createModelSwitcher({
		getConfig,
		onSelect: async (modelId, baseUrl) => {
			const patch = { aiModel: modelId };
			if (baseUrl && baseUrl !== appSettings.value.aiBaseUrl) {
				patch.aiBaseUrl = baseUrl;
			}
			await appSettings.update(patch, false);
		},
	});
	switcherApi = switcher;

	el.content = (
		<div className="header">
			<div className="title">
				<span>Acodex AI</span>
				{switcher.$toggle}
				<span className="actions">
					<button
						type="button"
						className="icon-button"
						title="Nova conversa"
						aria-label="Nova conversa"
						onclick={clearChat}
					>
						<span className="icon delete_outline" />
					</button>
					<button
						type="button"
						className="icon-button"
						title="Configurações"
						aria-label="Configurações do Acodex AI"
						onclick={openSettings}
					>
						<span className="icon edit" />
					</button>
				</span>
			</div>
		</div>
	);
	$hints = <div className="ai-hints"></div>;

	el.append(
		$messages,
		<div className="ai-composer">
			{$hints}
			{$input}
			{$sendBtn}
		</div>,
	);
	renderEmptyState();
}

function renderEmptyState() {
	const $empty = (
		<div className="ai-empty">
			<span className="icon brain" />
			<strong>Acodex AI</strong>
			<p>
				Lê e edita seus arquivos, cria abas, troca temas, abre o terminal e
				executa qualquer comando do app.
			</p>
		</div>
	);
	for (const text of SUGGESTIONS) {
		$empty.append(
			<button
				type="button"
				className="ai-suggestion"
				onclick={() => send(text)}
			>
				{text}
			</button>,
		);
	}
	$messages.replaceChildren($empty);
}

/**
 * @param {KeyboardEvent} e
 */
function onKeyDown(e) {
	if (e.key === "Escape" && controller) {
		e.preventDefault();
		controller.abort();
		return;
	}
	if (e.key !== "Enter" || e.shiftKey) return;
	if (e.isComposing || e.keyCode === 229) return;
	e.preventDefault();
	onSendClick();
}

function autoResize() {
	$input.style.height = "auto";
	$input.style.height = `${Math.min($input.scrollHeight, 140)}px`;
}

/**
 * Mostra/oculta a barra de comandos slash conforme o texto digitado.
 */
function updateHints() {
	if (!$hints) return;
	const text = $input.value;
	if (!text.startsWith("/")) {
		$hints.style.display = "none";
		$hints.replaceChildren();
		return;
	}
	const matches = SLASH_COMMANDS.filter((item) =>
		item.cmd.startsWith(text.split(" ")[0]),
	);
	if (!matches.length) {
		$hints.style.display = "none";
		$hints.replaceChildren();
		return;
	}
	$hints.replaceChildren();
	for (const item of matches) {
		$hints.append(
			<button
				type="button"
				className="ai-hint"
				onclick={() => {
					$input.value = `${item.cmd} `;
					$input.focus();
					updateHints();
				}}
			>
				<code>{item.cmd}</code>
				<span>{item.desc}</span>
			</button>,
		);
	}
	$hints.style.display = "block";
}

/**
 * Processa comandos slash. Retorna true quando a mensagem foi tratada.
 * @param {string} text
 */
function handleSlashCommand(text) {
	if (!text.startsWith("/")) return false;
	const [cmd, ...rest] = text.split(/\s+/);
	const arg = rest.join(" ");

	if (cmd === "/limpar") {
		clearChat();
		return true;
	}
	if (cmd === "/modelo") {
		switcherApi?.open();
		return true;
	}
	if (cmd === "/ajuda") {
		const $help = appendMessage(
			"assistant",
			SLASH_COMMANDS.map((item) => `${item.cmd} — ${item.desc}`).join("\n"),
		);
		$help.querySelector("p").style.whiteSpace = "pre-line";
		return true;
	}
	if (cmd === "/arquivo") {
		const editor =
			editorManager.activeFile?.type === "editor" ? editorManager.editor : null;
		if (!editor) {
			appendMessage("error", "Nenhum arquivo aberto.");
			return true;
		}
		const name = editorManager.activeFile.filename ?? "arquivo";
		const content = editor.state.doc.toString();
		send(
			`[${name}]\n\`${"`"}\`${"`"}\`${"`"}\n${content}\n\`${"`"}\`${"`"}\`${"`"}\n\n${arg || "Analise este arquivo e dê um resumo técnico com sugestões de melhoria."}`,
		);
		return true;
	}
	if (cmd === "/selecao") {
		const editor =
			editorManager.activeFile?.type === "editor" ? editorManager.editor : null;
		if (!editor) {
			appendMessage("error", "Nenhum arquivo aberto.");
			return true;
		}
		const { from, to } = editor.state.selection.main;
		const selection = editor.state.doc.sliceString(from, to);
		if (!selection) {
			appendMessage("error", "Nada selecionado no editor.");
			return true;
		}
		const name = editorManager.activeFile.filename ?? "arquivo";
		send(
			`[seleção em ${name}]\n\`${"`"}\`${"`"}\`${"`"}\n${selection}\n\`${"`"}\`${"`"}\`${"`"}\n\n${arg || "Revise esta seleção e sugira melhorias."}`,
		);
		return true;
	}
	if (cmd === "/busca") {
		send(
			arg
				? `Busque "${arg}" nos arquivos abertos usando a ferramenta de busca.`
				: "Liste TODOs nos arquivos abertos usando a ferramenta de busca.",
		);
		return true;
	}
	return false;
}

/**
 * Contexto do arquivo ativo injetado no prompt do sistema.
 */
function buildSystemContext() {
	const file = editorManager.activeFile;
	if (!file) return "";
	const parts = [`Arquivo ativo: ${file.filename ?? file.name}`];
	if (file.uri) parts.push(`URI: ${file.uri}`);
	parts.push(`Não salvo: ${file.isUnsaved ? "sim" : "não"}`);
	return parts.join("\n");
}

function onSendClick() {
	if (controller) {
		controller.abort();
		return;
	}
	send($input.value);
}

/**
 * @param {"user"|"assistant"|"tool"|"error"} role
 * @param {string} text
 */
function appendMessage(role, text) {
	$messages.querySelector(".ai-empty")?.remove();
	const $msg = <div className={`ai-msg ${role}`}></div>;
	if (role === "assistant") {
		$msg.append(renderAssistantMessage(text));
	} else {
		$msg.textContent = text;
	}
	$messages.append($msg);
	$messages.scrollTop = $messages.scrollHeight;
	return $msg;
}

function setBusy(busy) {
	$sendBtn.classList.toggle("busy", busy);
	$sendBtn.setAttribute("aria-label", busy ? "Parar" : "Enviar");
	$sendBtn.firstChild.className = `icon ${busy ? "clearclose" : "arrow_upward"}`;
}

/**
 * @param {string} rawText
 */
async function send(rawText) {
	const text = rawText.trim();
	if (!text || controller) return;
	if (text.startsWith("/")) {
		if (handleSlashCommand(text)) return;
	}

	const config = getConfig();
	const configError = validateAiConfig(config);
	if (configError) {
		appendMessage("error", CONFIG_ERRORS[configError] || configError);
		await openSettings();
		return;
	}

	$input.value = "";
	autoResize();
	appendMessage("user", text);
	history.push({ role: "user", content: text });
	const $thinking = appendMessage("tool", "Pensando");
	$thinking.classList.add("ai-thinking");

	controller = new AbortController();
	setBusy(true);
	const snapshot = history.length;
	liveBuffer = "";
	$liveMsg = null;

	/** Re-renderiza a mensagem em streaming com o texto acumulado. */
	function renderLive() {
		if (!$liveMsg) {
			$liveMsg = appendMessage("assistant", liveBuffer || "…");
			$liveMsg.classList.add("ai-live");
		} else {
			const $body = $liveMsg.querySelector(".ai-msg-body");
			$body?.replaceWith(renderAssistantMessage(liveBuffer || "…"));
			$messages.scrollTop = $messages.scrollHeight;
		}
	}

	try {
		await runAgent({
			history,
			config,
			registry,
			signal: controller.signal,
			systemContext: buildSystemContext(),
			onEvent(event) {
				if (event.type === "tool") {
					const label = TOOL_LABELS[event.name] || event.name;
					appendMessage(
						"tool",
						event.result?.error ? `${label}: ${event.result.error}` : label,
					);
				} else if (event.type === "assistant-delta") {
					liveBuffer += event.text;
					renderLive();
				} else if (event.content !== undefined) {
					$liveMsg?.remove();
					$liveMsg = null;
					if (event.content) appendMessage("assistant", event.content);
				}
			},
		});
	} catch (error) {
		history = history.slice(0, snapshot - 1);
		if (error?.name !== "AbortError") {
			appendMessage("error", `Erro: ${error?.message || error}`);
		} else if (liveBuffer) {
			appendMessage("assistant", liveBuffer);
		}
	} finally {
		$thinking.remove();
		$liveMsg?.classList.remove("ai-live");
		$liveMsg = null;
		controller = null;
		setBusy(false);
	}
}

function clearChat() {
	controller?.abort();
	history = [];
	renderEmptyState();
}

async function openSettings() {
	const current = getConfig();
	try {
		const result = await multiPrompt(
			"Acodex AI",
			[
				{
					id: "baseUrl",
					type: "url",
					placeholder: "URL base (OpenAI compatível)",
					value: current.baseUrl,
					required: true,
				},
				{
					id: "model",
					type: "text",
					placeholder: "Modelo (ex: openai/gpt-5-mini)",
					value: current.model,
					required: true,
				},
				{
					id: "apiKey",
					type: "password",
					placeholder: "Chave de API",
					value: current.apiKey,
					sensitive: true,
				},
			],
			"Funciona com Vercel AI Gateway, OpenAI, OpenRouter, Groq ou qualquer API compatível com OpenAI. A chave fica salva apenas neste dispositivo.",
		);
		await appSettings.update(
			{
				aiBaseUrl: result.baseUrl.trim(),
				aiModel: result.model.trim(),
				aiApiKey: result.apiKey.trim(),
			},
			false,
		);
	} catch {
		// Dialog dismissed.
	}
}
