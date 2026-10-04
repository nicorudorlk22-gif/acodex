/**
 * @typedef {object} AiConfig
 * @property {string} baseUrl OpenAI-compatible base URL (e.g. https://ai-gateway.vercel.sh/v1)
 * @property {string} apiKey API key sent as a Bearer token
 * @property {string} model Model id (e.g. openai/gpt-5-mini)
 */

/**
 * @typedef {object} ToolCall
 * @property {string} id
 * @property {"function"} type
 * @property {{name: string, arguments: string}} function
 */

/**
 * @typedef {object} ChatMessage
 * @property {"system"|"user"|"assistant"|"tool"} role
 * @property {string|null} [content]
 * @property {ToolCall[]} [tool_calls]
 * @property {string} [tool_call_id]
 */

export const DEFAULT_AI_CONFIG = Object.freeze({
	baseUrl: "https://ai-gateway.vercel.sh/v1",
	model: "openai/gpt-5-mini",
});

export class AiRequestError extends Error {
	/**
	 * @param {string} message
	 * @param {number} [status]
	 */
	constructor(message, status) {
		super(message);
		this.name = "AiRequestError";
		this.status = status;
	}
}

/**
 * @param {Partial<AiConfig>} config
 * @returns {string|null} error message, or null when valid
 */
export function validateAiConfig(config) {
	if (!config?.apiKey?.trim()) return "missing-api-key";
	if (!config.model?.trim()) return "missing-model";
	try {
		const url = new URL(config.baseUrl || "");
		if (url.protocol !== "https:" && url.hostname !== "localhost") {
			return "insecure-base-url";
		}
	} catch {
		return "invalid-base-url";
	}
	return null;
}

/**
 * @param {string} baseUrl
 */
export function buildCompletionsUrl(baseUrl) {
	return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/**
 * Sends one non-streaming chat completion request.
 * @param {object} params
 * @param {AiConfig} params.config
 * @param {ChatMessage[]} params.messages
 * @param {object[]} [params.tools]
 * @param {AbortSignal} [params.signal]
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<ChatMessage>}
 */
export async function createChatCompletion({
	config,
	messages,
	tools,
	signal,
	fetchImpl = globalThis.fetch,
}) {
	const configError = validateAiConfig(config);
	if (configError) throw new AiRequestError(configError);

	const body = { model: config.model, messages };
	if (tools?.length) body.tools = tools;

	const response = await fetchImpl(buildCompletionsUrl(config.baseUrl), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey.trim()}`,
		},
		body: JSON.stringify(body),
		signal,
	});

	if (!response.ok) {
		let detail = "";
		try {
			const data = await response.json();
			detail = data?.error?.message || "";
		} catch {
			// Non-JSON error body; fall back to the status text.
		}
		throw new AiRequestError(
			detail || response.statusText || `HTTP ${response.status}`,
			response.status,
		);
	}

	const data = await response.json();
	const message = data?.choices?.[0]?.message;
	if (!message) throw new AiRequestError("empty-response");
	return {
		role: "assistant",
		content: message.content ?? null,
		...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
	};
}
