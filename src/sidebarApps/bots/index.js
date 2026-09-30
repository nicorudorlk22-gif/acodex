import "./style.scss";
import { getDocText } from "cm/editorUtils";

/**
 * Bots IA — assistentes de código para cada ocasião (máx. 10).
 * Regra de honestidade: sem chave de API configurada, o painel avisa
 * e mostra como configurar — nunca finge uma resposta.
 *
 * Cada bot usa uma API compatível com OpenAI (Groq, OpenRouter, OpenAI
 * ou endpoint personalizado). A chave fica somente no aparelho (localStorage).
 */

const STORAGE_KEY = "acode.bots.config";
const MAX_FILE_CONTEXT = 48000;

const PROVIDERS = {
	groq: {
		label: "Groq (tem nível grátis)",
		base: "https://api.groq.com/openai/v1",
		model: "llama-3.3-70b-versatile",
	},
	openrouter: {
		label: "OpenRouter",
		base: "https://openrouter.ai/api/v1",
		model: "meta-llama/llama-3.3-70b-instruct:free",
	},
	openai: {
		label: "OpenAI",
		base: "https://api.openai.com/v1",
		model: "gpt-4o-mini",
	},
	custom: {
		label: "Personalizado (OpenAI-compatível)",
		base: "",
		model: "",
	},
};

/** Bots — um para cada ocasião (máximo 10) */
const BOTS = [
	{
		id: "general",
		icon: "chat_bubble",
		title: "Assistente",
		desc: "Converse sobre qualquer assunto de código",
		system:
			"Você é um assistente de programação do app Acode. Responda em português do Brasil, de forma direta e prática. Use blocos de código quando útil.",
	},
	{
		id: "fixer",
		icon: "wand-sparkles",
		title: "Corretor de Bugs",
		desc: "Encontra e corrige erros no código",
		system:
			"Você é um caçador de bugs. Analise o código fornecido, identifique erros, explique a causa de cada um e mostre a correção em blocos de código. Responda em português do Brasil.",
	},
	{
		id: "explainer",
		icon: "document-information",
		title: "Explicador",
		desc: "Explica o que o código faz, linha a linha",
		system:
			"Você é um explicador de código. Explique o que o código faz, sua lógica e partes importantes, com linguagem simples. Responda em português do Brasil.",
	},
	{
		id: "refactor",
		icon: "wand",
		title: "Refatorador",
		desc: "Melhora a estrutura sem mudar o comportamento",
		system:
			"Você é um especialista em refatoração. Melhore legibilidade, nomes e estrutura sem alterar o comportamento. Liste as mudanças feitas e mostre o código final. Responda em português do Brasil.",
	},
	{
		id: "tests",
		icon: "document-checked",
		title: "Gerador de Testes",
		desc: "Cria testes automatizados para o código",
		system:
			"Você é um engenheiro de testes. Escreva testes automatizados cobrindo os casos principais e de borda, usando o framework mais adequado à linguagem. Responda em português do Brasil.",
	},
	{
		id: "docs",
		icon: "document-text",
		title: "Documentador",
		desc: "Gera comentários e documentação",
		system:
			"Você é um documentador. Gere comentários claros, docstrings/JSDoc e um resumo do arquivo. Não altere a lógica do código. Responda em português do Brasil.",
	},
	{
		id: "commit",
		icon: "tag",
		title: "Commit",
		desc: "Escreve mensagens de commit e changelog",
		system:
			"Você é um especialista em Conventional Commits. Escreva mensagens de commit curtas no formato tipo(escopo): descrição, e sugira também um texto de changelog. Responda em português do Brasil.",
	},
	{
		id: "tutor",
		icon: "lightbulb",
		title: "Professor",
		desc: "Ensina conceitos, do zero ao avançado",
		system:
			"Você é um professor de programação paciente. Ensine conceitos com analogias simples, exemplos práticos e um pequeno exercício no final. Responda em português do Brasil.",
	},
	{
		id: "regex",
		icon: "text-search",
		title: "Regex",
		desc: "Cria e decifra expressões regulares",
		system:
			"Você é um especialista em expressões regulares. Forneça a regex pedida, explique cada parte dela e dê exemplos de correspondência. Responda em português do Brasil.",
	},
	{
		id: "optimizer",
		icon: "zap",
		title: "Otimizador",
		desc: "Melhora performance do código",
		system:
			"Você é um especialista em performance. Aponte gargalos do código e mostre versões otimizadas, explicando o ganho de cada mudança. Responda em português do Brasil.",
	},
];

/**@type {Record<string, {role:string,content:string}[]>} */
const history = {};
let activeBot = BOTS[0];
let busy = false;

function loadConfig() {
	try {
		return (
			JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
				provider: "groq",
				apiKey: "",
				model: PROVIDERS.groq.model,
				baseUrl: "",
				includeFile: true,
			}
		);
	} catch (_) {
		return {
			provider: "groq",
			apiKey: "",
			model: PROVIDERS.groq.model,
			baseUrl: "",
			includeFile: true,
		};
	}
}

function saveConfig(cfg) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/** Texto do arquivo aberto no editor, como contexto */
function fileContext() {
	const cfg = loadConfig();
	if (!cfg.includeFile) return "";
	const file = window.editorManager?.activeFile;
	const doc = file?.session?.doc;
	if (!file || !doc) return "";
	let text = "";
	try {
		text = getDocText(doc);
	} catch (_) {
		return "";
	}
	if (!text) return "";
	const name = file.filename || file.uri || "arquivo";
	const lang = file.currentMode || name.split(".").pop() || "";
	if (text.length > MAX_FILE_CONTEXT) {
		text = `${text.slice(0, MAX_FILE_CONTEXT)}\n... (truncado)`;
	}
	return `\n\n[Contexto — arquivo aberto no editor: ${name} (${lang})]\n${text}`;
}

function providerBase(cfg) {
	if (cfg.provider === "custom") {
		return (cfg.baseUrl || "").replace(/\/+$/, "");
	}
	return PROVIDERS[cfg.provider].base;
}

/** Chamada real à API (streaming SSE, formato OpenAI-compatível) */
async function chatCompletion(messages, onDelta) {
	const cfg = loadConfig();
	const base = providerBase(cfg);
	const apiKey = cfg.apiKey;
	if (!base || !apiKey) {
		throw new Error(
			"Nenhuma API configurada. Toque na engrenagem para definir provedor, modelo e chave.",
		);
	}
	const model = cfg.model || PROVIDERS[cfg.provider].model;
	const res = await fetch(`${base}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
			...(cfg.provider === "openrouter" ? { "X-Title": "Acode" } : {}),
		},
		body: JSON.stringify({
			model,
			messages,
			stream: true,
		}),
	});

	if (!res.ok) {
		let detail = "";
		try {
			const errBody = await res.json();
			detail = errBody?.error?.message || "";
		} catch (_) {
			// resposta sem corpo em JSON: usa texto puro
		}
		throw new Error(
			`API respondeu ${res.status}. ${detail || "Verifique a chave, o modelo e o provedor."}`,
		);
	}

	let full = "";
	if (res.body?.getReader) {
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith("data:")) continue;
				const data = trimmed.slice(5).trim();
				if (!data || data === "[DONE]") continue;
				try {
					const json = JSON.parse(data);
					const delta = json.choices?.[0]?.delta?.content || "";
					if (delta) {
						full += delta;
						onDelta(delta);
					}
				} catch (_) {
					// fragmento incompleto: ignorado
				}
			}
		}
	} else {
		const json = await res.json();
		full = json.choices?.[0]?.message?.content || "";
		onDelta(full);
	}

	if (!full) {
		throw new Error("A API respondeu, mas sem conteúdo. Tente novamente.");
	}
	return full;
}

export default [
	"chat_bubble", // icon
	"bots", // id
	"Bots IA", // title
	initApp, // init function
	false, // prepend
	onSelected, // onSelected function
];

function initApp(el) {
	el.classList.add("bots");

	const $botChips = <div className="bot-chips"></div>;
	const $chat = <div className="bot-chat"></div>;
	const $input = (
		<textarea className="bot-input" placeholder="Pergunte algo..."></textarea>
	);
	const $settings = <div className="bot-settings hidden"></div>;

	const renderChips = () => {
		$botChips.textContent = "";
		for (const bot of BOTS) {
			const chip = (
				<button
					type="button"
					className={`chip ${bot.id === activeBot.id ? "active" : ""}`}
					onclick={() => {
						activeBot = bot;
						renderChips();
						renderChat();
					}}
				>
					<span className={`icon ${bot.icon}`}></span>
					<span className="chip-title">{bot.title}</span>
				</button>
			);
			$botChips.append(chip);
		}
	};

	const renderChat = () => {
		$chat.textContent = "";
		const msgs = history[activeBot.id] || [];
		if (!msgs.length) {
			$chat.append(
				<div className="bot-empty">
					<span className="icon chat_bubble"></span>
					<p>
						Bot: <b>{activeBot.title}</b> — {activeBot.desc}
					</p>
					<p className="hint">
						{loadConfig().apiKey
							? "Envie uma pergunta. O arquivo aberto no editor é enviado como contexto."
							: "Sem chave de API configurada. Toque na engrenagem para configurar."}
					</p>
				</div>,
			);
			return;
		}
		for (const msg of msgs) {
			$chat.append(
				<div className={`msg ${msg.role}`}>
					<span className="msg-text">{msg.content}</span>
				</div>,
			);
		}
		$chat.scrollTop = $chat.scrollHeight;
	};

	const renderSettings = () => {
		const cfg = loadConfig();
		$settings.textContent = "";
		const $provider = (
			<select className="set-provider">
				{Object.keys(PROVIDERS).map((key) => (
					<option value={key} selected={key === cfg.provider}>
						{PROVIDERS[key].label}
					</option>
				))}
			</select>
		);
		const $model = (
			<input
				className="set-model"
				type="text"
				placeholder="Modelo (ex: llama-3.3-70b-versatile)"
				value={cfg.model}
			/>
		);
		const $apiKey = (
			<input
				className="set-key"
				type="password"
				placeholder="Chave da API (fica só no seu aparelho)"
				value={cfg.apiKey}
			/>
		);
		const $baseUrl = (
			<input
				className={`set-base ${cfg.provider === "custom" ? "" : "hidden"}`}
				type="text"
				placeholder="URL base (ex: https://api.exemplo.com/v1)"
				value={cfg.baseUrl}
			/>
		);
		const $includeFile = (
			<input
				className="set-include"
				type="checkbox"
				checked={cfg.includeFile}
			/>
		);

		$provider.onchange = () => {
			const key = $provider.value;
			$model.value = PROVIDERS[key].model;
			if (key === "custom") {
				$baseUrl.classList.remove("hidden");
			} else {
				$baseUrl.classList.add("hidden");
			}
		};

		$settings.append(
			<div className="settings-body">
				<label>Provedor</label>
				{$provider}
				<label>Modelo</label>
				{$model}
				<label>Chave da API</label>
				{$apiKey}
				{$baseUrl}
				<label className="checkbox-row">
					{$includeFile}
					<span>Enviar o arquivo aberto como contexto</span>
				</label>
				<div className="settings-actions">
					<button
						type="button"
						className="save"
						onclick={() => {
							const provider = $provider.value;
							const newCfg = {
								provider,
								apiKey: $apiKey.value.trim(),
								model: $model.value.trim() || PROVIDERS[provider].model,
								baseUrl: $baseUrl.value.trim(),
								includeFile: $includeFile.checked,
							};
							if (provider === "custom" && !newCfg.baseUrl) {
								window.toast("Informe a URL base do provedor personalizado");
								return;
							}
							saveConfig(newCfg);
							$settings.classList.add("hidden");
							renderChat();
							window.toast("Configuração salva no aparelho");
						}}
					>
						Salvar
					</button>
					<button
						type="button"
						className="cancel"
						onclick={() => $settings.classList.add("hidden")}
					>
						Cancelar
					</button>
				</div>
				<p className="hint">
					Sua chave fica apenas neste aparelho (localStorage) e é enviada direto
					ao provedor escolhido.
				</p>
			</div>,
		);
	};

	async function sendMessage() {
		if (busy) return;
		const text = $input.value.trim();
		if (!text) return;
		const cfg = loadConfig();
		if (!cfg.apiKey || !providerBase(cfg)) {
			window.toast("Configure a API de IA na engrenagem");
			renderSettings();
			$settings.classList.remove("hidden");
			return;
		}

		if (!history[activeBot.id]) history[activeBot.id] = [];
		history[activeBot.id].push({ role: "user", content: text });
		$input.value = "";
		busy = true;
		renderChat();

		const thinking = (
			<div className="msg assistant">
				<span className="msg-text thinking">Pensando...</span>
			</div>
		);
		$chat.append(thinking);
		$chat.scrollTop = $chat.scrollHeight;

		const messages = [
			{ role: "system", content: activeBot.system + fileContext() },
			...history[activeBot.id].slice(-20),
		];

		const $text = thinking.querySelector(".msg-text");
		try {
			let first = true;
			const reply = await chatCompletion(messages, (delta) => {
				if (first) {
					$text.classList.remove("thinking");
					$text.textContent = "";
					first = false;
				}
				$text.textContent += delta;
				$chat.scrollTop = $chat.scrollHeight;
			});
			history[activeBot.id].push({ role: "assistant", content: reply });
		} catch (error) {
			$text.classList.remove("thinking");
			$text.classList.add("error");
			$text.textContent = `Erro: ${error.message}`;
		} finally {
			busy = false;
		}
	}

	el.append(
		<div className="header">
			<div className="title">
				<span className="icon chat_bubble"></span>
				<span>Bots IA</span>
			</div>
			<div className="actions">
				<button
					type="button"
					className="icon-button"
					title="Configurar IA"
					onclick={() => {
						renderSettings();
						$settings.classList.toggle("hidden");
					}}
				>
					<span className="icon settings"></span>
				</button>
				<button
					type="button"
					className="icon-button"
					title="Limpar conversa"
					onclick={() => {
						history[activeBot.id] = [];
						renderChat();
					}}
				>
					<span className="icon delete"></span>
				</button>
			</div>
		</div>,
		<div className="bot-chips-wrap">{$botChips}</div>,
		$chat,
		$settings,
		<div className="bot-input-row">
			{$input}
			<button
				type="button"
				className="send icon-button"
				title="Enviar"
				onclick={sendMessage}
			>
				<span className="icon send"></span>
			</button>
		</div>,
	);

	$input.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	});

	renderChips();
	renderChat();

	return () => {
		// cleanup ao remover o painel
	};
}

function onSelected() {
	// nada extra por enquanto
}
