/**
 * Voice input for the Acodex AI chat.
 *
 * Uses the on-device Web Speech API (`SpeechRecognition`, also known as
 * `webkitSpeechRecognition`), available in the Android WebView, to dictate
 * messages into the composer with live interim results. For fully offline
 * STT the roadmap is sherpa-onnx (Apache-2.0); this module keeps the same
 * public API so the engine can be swapped without touching the UI.
 */

/**
 * @typedef {"idle" | "listening" | "error" | "unsupported"} VoiceState
 */

/** Returns the platform SpeechRecognition constructor, or null. */
export function getRecognitionConstructor() {
	if (typeof window === "undefined") return null;
	return (
		window.SpeechRecognition ??
		window.webkitSpeechRecognition ??
		window.__acodexSpeechRecognition ??
		null
	);
}

/** Whether dictation is available on this device. */
export function isVoiceSupported() {
	return getRecognitionConstructor() !== null;
}

/**
 * Best-effort speech language from the device locale, defaulting to pt-BR
 * (the app's primary locale).
 */
export function detectLanguage() {
	const locale =
		(typeof navigator !== "undefined" && navigator.language) || "pt-BR";
	return /^en/i.test(locale) ? "en-US" : locale;
}

/**
 * Creates a controller for the chat microphone.
 *
 * @param {object} options
 * @param {(text: string, info: { isFinal: boolean }) => void} options.onText
 *        Called with each recognized chunk; interim chunks arrive with
 *        `isFinal=false` and should replace the pending interim text.
 * @param {(state: VoiceState, message?: string) => void} [options.onStateChange]
 * @param {string} [options.lang]
 * @param {any} [options.RecognitionCtor] Injectable constructor (tests).
 * @returns {{ start: () => boolean, stop: () => void, isListening: () => boolean }}
 */
export function createVoiceInput({
	onText,
	onStateChange = () => {},
	lang = detectLanguage(),
	RecognitionCtor = getRecognitionConstructor(),
}) {
	if (typeof onText !== "function") {
		throw new TypeError("createVoiceInput: onText callback is required");
	}

	if (!RecognitionCtor) {
		onStateChange("unsupported");
		return {
			start() {
				onStateChange("unsupported", "Dictado indisponível neste dispositivo.");
				return false;
			},
			stop() {},
			isListening: () => false,
		};
	}

	let recognition = null;
	let listening = false;
	let stopping = false;

	/** @param {VoiceState} state @param {string} [message] */
	function setState(state, message) {
		onStateChange(state, message);
	}

	function buildRecognition() {
		const instance = new RecognitionCtor();
		instance.lang = lang;
		instance.continuous = true;
		instance.interimResults = true;

		instance.onresult = (event) => {
			let interim = "";
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				const text = result[0]?.transcript ?? "";
				if (text) onText(text, { isFinal: result.isFinal });
				if (!result.isFinal) interim = text;
			}
			return interim;
		};

		instance.onerror = (event) => {
			const code = event?.error;
			if (code === "no-speech" || code === "aborted") return; // benign, onend handles restart
			if (code === "not-allowed" || code === "service-not-allowed") {
				listening = false;
				stopping = true;
				setState(
					"error",
					"Permissão de microfone negada. Libere o microfone nas configurações do app.",
				);
				try {
					instance.stop();
				} catch {
					/* already stopped */
				}
				return;
			}
			setState("error", `Erro de reconhecimento: ${code ?? "desconhecido"}`);
		};

		instance.onend = () => {
			// The WebView may end the session on silence; restart while active.
			if (listening && !stopping) {
				try {
					instance.start();
					return;
				} catch {
					/* fall through to idle */
				}
			}
			if (!stopping) setState("listening");
			listening = false;
			recognition = null;
			if (stopping) setState("idle");
		};

		return instance;
	}

	return {
		start() {
			if (listening) return true;
			try {
				recognition = buildRecognition();
				recognition.start();
				listening = true;
				stopping = false;
				setState("listening");
				return true;
			} catch (error) {
				recognition = null;
				listening = false;
				setState(
					"error",
					`Não foi possível iniciar o microfone: ${error?.message ?? error}`,
				);
				return false;
			}
		},
		stop() {
			if (!listening && !recognition) return;
			stopping = true;
			listening = false;
			try {
				recognition?.stop();
			} catch {
				/* already stopped */
			}
			if (!recognition) setState("idle");
		},
		isListening: () => listening,
	};
}
