import { describe, expect, it, vi } from "vitest";
import { BUILTIN_SKILLS } from "lib/acodexAi/builtinSkills";
import { createToolRegistry } from "lib/acodexAi/tools";
import {
	buildSkillCatalogPrompt,
	createSkillRegistry,
	isValidSkillName,
	parseSkillFile,
	splitFrontMatter,
} from "lib/acodexAi/skills";

const doc = (name, description, body = "Do the thing.") =>
	`---\nname: ${name}\ndescription: ${description}\n---\n${body}`;

describe("splitFrontMatter", () => {
	it("extracts flat key/value pairs and the body", () => {
		const { data, body } = splitFrontMatter(
			doc("my-skill", "A skill.", "Step one.\nStep two."),
		);
		expect(data).toEqual({ name: "my-skill", description: "A skill." });
		expect(body).toBe("Step one.\nStep two.");
	});

	it("returns the whole text when there is no front-matter", () => {
		const { data, body } = splitFrontMatter("Just instructions.");
		expect(data).toEqual({});
		expect(body).toBe("Just instructions.");
	});

	it("returns the whole text when front-matter is never closed", () => {
		const { data, body } = splitFrontMatter("---\nname: broken\nNo instructions.");
		expect(data).toEqual({});
		expect(body.startsWith("---")).toBe(true);
	});
});

describe("isValidSkillName", () => {
	it("accepts kebab-case names", () => {
		expect(isValidSkillName("code-review")).toBe(true);
		expect(isValidSkillName("gen-tests")).toBe(true);
	});

	it("rejects invalid names", () => {
		expect(isValidSkillName("Code Review")).toBe(false);
		expect(isValidSkillName("UPPER")).toBe(false);
		expect(isValidSkillName("")).toBe(false);
		expect(isValidSkillName("a".repeat(65))).toBe(false);
		expect(isValidSkillName("trailing-")).toBe(false);
	});
});

describe("parseSkillFile", () => {
	it("parses a valid SKILL.md document", () => {
		const skill = parseSkillFile(doc("code-review", "Reviews code.", "1. Read."));
		expect(skill).toEqual({
			name: "code-review",
			description: "Reviews code.",
			instructions: "1. Read.",
		});
	});

	it("strips quotes around front-matter values", () => {
		const skill = parseSkillFile(
			'---\nname: quoted\ndescription: "Quoted."\n---\nInstructions.',
		);
		expect(skill.description).toBe("Quoted.");
	});

	it("uses the fallback name when front-matter omits it", () => {
		const skill = parseSkillFile(
			"---\ndescription: No name here.\n---\nInstructions.",
			"fallback-name",
		);
		expect(skill?.name).toBe("fallback-name");
	});

	it("rejects documents without instructions", () => {
		expect(parseSkillFile(doc("empty-skill", "Nothing.", ""))).toBeNull();
	});

	it("rejects invalid input", () => {
		expect(parseSkillFile("")).toBeNull();
		expect(parseSkillFile(null)).toBeNull();
		expect(parseSkillFile("no name\njust text")).toBeNull();
	});

	it("truncates oversized descriptions and instructions", () => {
		const skill = parseSkillFile(
			doc("big-skill", "x".repeat(2000), "y".repeat(20000)),
		);
		expect(skill.description.length).toBe(1024);
		expect(skill.instructions.length).toBe(8192);
	});
});

describe("buildSkillCatalogPrompt", () => {
	it("returns an empty string for an empty catalog", () => {
		expect(buildSkillCatalogPrompt([])).toBe("");
	});

	it("lists every skill and instructs the agent to load them", () => {
		const prompt = buildSkillCatalogPrompt([
			parseSkillFile(doc("alpha", "First skill.")),
			parseSkillFile(doc("beta", "Second skill.")),
		]);
		expect(prompt).toContain("load_skill");
		expect(prompt).toContain("- alpha: First skill.");
		expect(prompt).toContain("- beta: Second skill.");
	});
});

describe("createSkillRegistry", () => {
	it("registers built-in skills and exposes lookups", async () => {
		const registry = await createSkillRegistry({
			builtin: BUILTIN_SKILLS,
		});
		expect(registry.skills).toHaveLength(BUILTIN_SKILLS.length);
		expect(registry.has("code-review")).toBe(true);
		expect(registry.has("nonexistent")).toBe(false);
		expect(registry.get("gen-tests")?.name).toBe("gen-tests");
		expect(registry.catalogPrompt).toContain("code-review");
	});

	it("merges user skills and reports invalid ones", async () => {
		const onError = vi.fn();
		const registry = await createSkillRegistry({
			builtin: [parseSkillFile(doc("built-in", "Built in."))],
			loadUserSkills: async () => [
				{ name: "user-skill", content: doc("user-skill", "From the user.") },
				{ name: "broken", content: "---\nname: broken\n---\n" },
			],
			onError,
		});
		expect(registry.has("user-skill")).toBe(true);
		expect(registry.has("broken")).toBe(false);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(registry.skills.map((skill) => skill.name)).toEqual([
			"built-in",
			"user-skill",
		]);
	});

	it("keeps the built-in skill when a user skill collides by name", async () => {
		const registry = await createSkillRegistry({
			builtin: [parseSkillFile(doc("dup", "Built in."))],
			loadUserSkills: async () => [
				{ name: "dup", content: doc("dup", "User override.") },
			],
		});
		expect(registry.get("dup")?.description).toBe("Built in.");
		expect(registry.skills).toHaveLength(1);
	});

	it("survives a failing loader", async () => {
		const onError = vi.fn();
		const registry = await createSkillRegistry({
			loadUserSkills: async () => {
				throw new Error("storage offline");
			},
			onError,
		});
		expect(registry.skills).toHaveLength(0);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(registry.catalogPrompt).toBe("");
	});
});

describe("skill tools", () => {
	const deps = () => ({
		getActiveFile: () => null,
		getOpenFiles: () => [],
		getEditor: () => null,
		createFile: vi.fn(),
		openFile: vi.fn(),
		switchFile: vi.fn(),
		execCommand: vi.fn(),
		listCommands: () => [],
		confirm: vi.fn(async () => false),
	});

	it("list_skills returns the catalog names", async () => {
		const registry = await createSkillRegistry({
			builtin: [parseSkillFile(doc("code-review", "Reviews code."))],
		});
		const tools = createToolRegistry({ ...deps(), skills: registry });
		expect(tools.definitions.map((d) => d.function.name)).toContain("list_skills");
		expect(await tools.execute("list_skills", "{}")).toEqual({
			skills: [{ name: "code-review", description: "Reviews code." }],
		});
	});

	it("load_skill returns the full instructions", async () => {
		const skills = await createSkillRegistry({
			builtin: [parseSkillFile(doc("gen-tests", "Generates tests.", "1. Detect the framework."))],
		});
		const tools = createToolRegistry({ ...deps(), skills });
		const result = await tools.execute("load_skill", '{"name":"gen-tests"}');
		expect(result.instructions).toContain("Detect the framework");
	});

	it("load_skill rejects unknown skills and absent registries", async () => {
		const tools = createToolRegistry({ ...deps() });
		expect(await tools.execute("list_skills", "{}")).toEqual({
			error: "Skills are not available.",
		});

		const withSkills = createToolRegistry({
			...deps(),
			skills: await createSkillRegistry({ builtin: [] }),
		});
		expect((await withSkills.execute("load_skill", '{"name":"nope"}')).error).toContain(
			"Unknown skill",
		);
	});
});

describe("BUILTIN_SKILLS", () => {
	it("ships six valid, documented skills", () => {
		expect(BUILTIN_SKILLS).toHaveLength(6);
		for (const skill of BUILTIN_SKILLS) {
			expect(isValidSkillName(skill.name)).toBe(true);
			expect(skill.description.length).toBeGreaterThan(10);
			expect(skill.instructions.length).toBeGreaterThan(40);
		}
	});
});
