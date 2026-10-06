import { describe, expect, it } from "vitest";
import { shouldShowOnboarding, markOnboarded, ONBOARDING_FLAG } from "lib/onboarding";

function fakeStorage() {
	const store = new Map();
	return {
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => store.set(k, String(v)),
	};
}

describe("onboarding", () => {
	it("shows onboarding for fresh storage", () => {
		expect(shouldShowOnboarding(fakeStorage())).toBe(true);
	});

	it("does not show twice", () => {
		const storage = fakeStorage();
		markOnboarded(storage);
		expect(shouldShowOnboarding(storage)).toBe(false);
		expect(storage.getItem(ONBOARDING_FLAG)).toBeTruthy();
	});

	it("handles null storage", () => {
		expect(shouldShowOnboarding(null)).toBe(true);
		expect(() => markOnboarded(null)).not.toThrow();
	});
});
