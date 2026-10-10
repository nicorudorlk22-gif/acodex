import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createVoiceInput,
	detectLanguage,
	getRecognitionConstructor,
	isVoiceSupported,
} from "sidebarApps/aiChat/voiceInput";

class FakeRecognition {
	constructor() {
		this.handlers = {};
		this.lang = null;
		this.continuous = false;
		this.interimResults = false;
		this.startCalls = 0;
		this.stopCalls = 0;
	}

	start() {
		this.startCalls += 1;
	}

	stop() {
		this.stopCalls += 1;
	}

	set onresult(fn) {
		this.handlers.result = fn;
	}
	get onresult() {
		return this.handlers.result;
	}
	set onerror(fn) {
		this.handlers.error = fn;
	}
	set onend(fn) {
		this.handlers.end = fn;
	}

	emitResult(chunks) {
		const event = {
			resultIndex: 0,
			results: chunks.map(([text, isFinal]) => ({
				isFinal,
				0: { transcript: text },
				length: 1,
			})),
		};
		this.handlers.result(event);
	}
}

const makeInput = (overrides = {}) => {
	const onText = vi.fn();
	const onStateChange = vi.fn();
	const recognition = new FakeRecognition();
	/** Plain constructor stub: returns the shared fake instance on `new`. */
	const Ctor = function () {
		return recognition;
	};
	const input = createVoiceInput({
		onText,
		onStateChange,
		RecognitionCtor: Ctor,
		...overrides,
	});
	return { input, onText, onStateChange, recognition, Ctor };
};

afterEach(() => {
	delete globalThis.navigator;
	delete globalThis.window;
});

describe("support detection", () => {
	it("reports unsupported when the API is absent", () => {
		expect(isVoiceSupported()).toBe(false);
		expect(getRecognitionConstructor()).toBeNull();
	});

	it("detects the constructor on window", () => {
		globalThis.window = { webkitSpeechRecognition: FakeRecognition };
		expect(isVoiceSupported()).toBe(true);
	});

	it("defaults to pt-BR without a locale", () => {
		expect(detectLanguage()).toBe("pt-BR");
	});

	it("uses the device locale when present", () => {
		globalThis.navigator = { language: "en-US" };
		expect(detectLanguage()).toBe("en-US");
	});
});

describe("createVoiceInput without support", () => {
	it("starts nowhere and reports the unsupported state", () => {
		const onStateChange = vi.fn();
		const input = createVoiceInput({ onText: () => {}, onStateChange });
		expect(input.start()).toBe(false);
		expect(input.isListening()).toBe(false);
		expect(onStateChange).toHaveBeenCalledWith(
			"unsupported",
			expect.any(String),
		);
		input.stop(); // no-op, must not throw
	});
});

describe("createVoiceInput", () => {
	it("requires the onText callback", () => {
		expect(() => createVoiceInput({ RecognitionCtor: FakeRecognition })).toThrow(
			TypeError,
		);
	});

	it("configures and starts the recognition session", () => {
		const { input, recognition } = makeInput();
		expect(input.start()).toBe(true);
		expect(recognition.lang).toBe("pt-BR");
		expect(recognition.continuous).toBe(true);
		expect(recognition.interimResults).toBe(true);
		expect(input.isListening()).toBe(true);
	});

	it("forwards final and interim results to onText", () => {
		const { input, recognition, onText } = makeInput();
		input.start();
		recognition.emitResult([["olá acodex", true], ["como", false]]);
		expect(onText).toHaveBeenCalledWith("olá acodex", { isFinal: true });
		expect(onText).toHaveBeenCalledWith("como", { isFinal: false });
	});

	it("stops cleanly and returns to idle", () => {
		const { input, recognition, onStateChange } = makeInput();
		input.start();
		expect(recognition.stopCalls).toBe(0);
		input.stop();
		expect(recognition.stopCalls).toBe(1);
		expect(input.isListening()).toBe(false);
		recognition.handlers.end();
		expect(onStateChange).toHaveBeenLastCalledWith("idle", undefined);
	});

	it("restarts the session when the engine ends on silence", () => {
		const { input, recognition } = makeInput();
		input.start();
		expect(recognition.startCalls).toBe(1);
		recognition.handlers.end(); // engine gave up while still listening
		expect(recognition.startCalls).toBe(2);
	});

	it("does not restart after an explicit stop", () => {
		const { input, recognition } = makeInput();
		input.start();
		input.stop();
		recognition.handlers.end();
		expect(recognition.startCalls).toBe(1);
	});

	it("stops and reports on denied microphone permission", () => {
		const { input, recognition, onStateChange } = makeInput();
		input.start();
		recognition.handlers.error({ error: "not-allowed" });
		expect(input.isListening()).toBe(false);
		expect(onStateChange).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("microfone"),
		);
	});

	it("ignores benign errors", () => {
		const { input, recognition, onStateChange } = makeInput();
		input.start();
		recognition.handlers.error({ error: "no-speech" });
		expect(input.isListening()).toBe(true);
		expect(onStateChange).not.toHaveBeenCalledWith("error");
	});

	it("reports a start failure without throwing", () => {
		const Boom = vi.fn(() => {
			throw new Error("already started");
		});
		const { input, onStateChange } = makeInput({
			Ctor: undefined,
		});
		const failing = createVoiceInput({
			onText: () => {},
			onStateChange,
			RecognitionCtor: Boom,
		});
		expect(failing.start()).toBe(false);
		expect(onStateChange).toHaveBeenCalledWith("error", expect.any(String));
		expect(input).toBeTruthy();
	});
});
