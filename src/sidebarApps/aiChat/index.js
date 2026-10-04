import "./style.scss";
import confirm from "dialogs/confirm";
import multiPrompt from "dialogs/multiPrompt";
import { runAgent } from "lib/acodexAi/agent";
import { validateAiConfig } from "lib/acodexAi/client";
import { createToolRegistry } from "lib/acodexAi/tools";
import commands from "lib/commands";
import EditorFile from "lib/editorFile";
import openFile from "lib/openFile";
import appSettings from "lib/settings";
import { splitMarkdownCode } from "./format";

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
	run_command: "Executando comando",
};

const SUGGESTIONS = [
	"Explique o arquivo aberto",
	"Encontre bugs neste código",
	"Liste os comandos disponíveis",
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
	return { baseUrl: aiBaseUrl, apiKey: aiApiKey, model: aiModel };
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

	el.content = (
		<div className="header">
			<div className="title">
				<span>Acodex AI</span>
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
	el.append(
		$messages,
		<div className="ai-composer">
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
	if (e.key !== "Enter" || e.shiftKey) return;
	if (e.isComposing || e.keyCode === 229) return;
	e.preventDefault();
	onSendClick();
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
		for (const part of splitMarkdownCode(text)) {
			if (part.type === "code") {
				const $pre = (
					<pre className="ai-code">
						<code>{part.text}</code>
					</pre>
				);
				$pre.append(
					<button
						type="button"
						className="ai-copy"
						onclick={() => navigator.clipboard?.writeText(part.text)}
					>
						Copiar
					</button>,
				);
				$msg.append($pre);
			} else {
				$msg.append(<p>{part.text}</p>);
			}
		}
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

	const config = getConfig();
	const configError = validateAiConfig(config);
	if (configError) {
		appendMessage("error", CONFIG_ERRORS[configError] || configError);
		await openSettings();
		return;
	}

	$input.value = "";
	appendMessage("user", text);
	history.push({ role: "user", content: text });
	const $thinking = appendMessage("tool", "Pensando...");

	controller = new AbortController();
	setBusy(true);
	const snapshot = history.length;
	try {
		await runAgent({
			history,
			config,
			registry,
			signal: controller.signal,
			onEvent(event) {
				if (event.type === "tool") {
					const label = TOOL_LABELS[event.name] || event.name;
					appendMessage(
						"tool",
						event.result?.error ? `${label}: ${event.result.error}` : label,
					);
				} else if (event.content) {
					appendMessage("assistant", event.content);
				}
			},
		});
	} catch (error) {
		history = history.slice(0, snapshot - 1);
		if (error?.name !== "AbortError") {
			appendMessage("error", `Erro: ${error?.message || error}`);
		}
	} finally {
		$thinking.remove();
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
