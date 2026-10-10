/**
 * Acodex AI skills engine.
 *
 * Implements the Agent Skills convention popularized by the `anthropics/skills`
 * repository (MIT) and the skill-module architecture used by open-source
 * assistants like Leon AI: every skill is a folder containing a `SKILL.md`
 * file with a YAML front-matter (`name`, `description`) followed by the
 * natural-language instructions the assistant should follow.
 *
 * Skills are transparent: the catalog is injected into the system prompt and
 * the agent loads a skill's instructions through the `load_skill` tool before
 * applying it.
 */

/** Maximum sizes kept in sync with Anthropic's skill authoring guide. */
export const SKILL_LIMITS = {
	name: 64,
	description: 1024,
	body: 8192,
};

/**
 * Extracts and parses the YAML front-matter block of a SKILL.md document.
 * Supports the flat `key: value` subset; ignores comments and blank lines.
 * @param {string} text
 * @returns {{ data: Record<string, string>, body: string }}
 */
export function splitFrontMatter(text) {
	if (!text.startsWith("---")) return { data: {}, body: text };
	const end = text.indexOf("\n---", 3);
	if (end === -1) return { data: {}, body: text };
	const rawBlock = text.slice(4, end).replace(/\r/g, "");
	const body = text
		.slice(end + 4)
		.replace(/^\r?\n/, "")
		.trim();
	/** @type {Record<string, string>} */
	const data = {};
	for (const line of rawBlock.split("\n")) {
		const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (match)
			data[match[1].toLowerCase()] = match[2]
				.trim()
				.replace(/^["']|["']$/g, "");
	}
	return { data, body };
}

/**
 * Validates a skill name: lowercase kebab-case, 1..64 chars.
 * @param {string} name
 */
export function isValidSkillName(name) {
	return (
		typeof name === "string" &&
		name.length > 0 &&
		name.length <= SKILL_LIMITS.name &&
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
	);
}

/**
 * Parses a SKILL.md document into a {@link Skill} object.
 * Returns `null` when the document is not a valid skill (missing or invalid
 * name, or no instructions at all).
 * @param {string} text Raw SKILL.md contents.
 * @param {string} [fallbackName] Optional fallback name when front-matter omits it.
 * @returns {import("./types").Skill | null}
 */
export function parseSkillFile(text, fallbackName = "") {
	if (typeof text !== "string" || text.trim() === "") return null;
	const { data, body } = splitFrontMatter(text);
	const name = String(data.name ?? fallbackName ?? "").trim();
	const description = String(data.description ?? "").trim();
	const instructions = body.trim();

	if (!isValidSkillName(name) || !instructions) return null;

	return {
		name,
		description: description.slice(0, SKILL_LIMITS.description),
		instructions: instructions.slice(0, SKILL_LIMITS.body),
	};
}

/**
 * Builds the one-line-per-skill catalog appended to the system prompt.
 * @param {import("./types").Skill[]} skills
 * @returns {string}
 */
export function buildSkillCatalogPrompt(skills) {
	if (!skills.length) return "";
	const lines = skills.map(
		(skill) => `- ${skill.name}: ${skill.description || "(no description)"}`,
	);
	return [
		"## Available skills",
		"Before performing one of these tasks, call the `load_skill` tool with the skill name and follow its instructions exactly.",
		...lines,
	].join("\n");
}

/**
 * Creates a skill registry from built-in skills plus asynchronously loaded
 * user skills (e.g. from `.acodex/skills/<name>/SKILL.md` on the device storage).
 *
 * @param {object} [options]
 * @param {import("./types").Skill[]} [options.builtin] Built-in skills to include.
 * @param {() => Promise<{ name: string, content: string }[]>} [options.loadUserSkills]
 *        Async loader returning raw SKILL.md documents found in user storage.
 * @param {(message: string) => void} [options.onError] Called once per invalid user skill.
 * @returns {Promise<{ skills: import("./types").Skill[], has: (name: string) => boolean, get: (name: string) => import("./types").Skill | null, catalogPrompt: string }>}
 */
export async function createSkillRegistry({
	builtin = [],
	loadUserSkills,
	onError = () => {},
} = {}) {
	/** @type {import("./types").Skill[]} */
	const skills = [];
	/** @type {Set<string>} */
	const seen = new Set();

	for (const skill of builtin) {
		if (seen.has(skill.name)) continue;
		seen.add(skill.name);
		skills.push(skill);
	}

	if (typeof loadUserSkills === "function") {
		try {
			const documents = await loadUserSkills();
			for (const doc of documents ?? []) {
				const skill = parseSkillFile(doc.content ?? "", doc.name);
				if (!skill) {
					onError(`Skill inválida ignorada: ${doc?.name ?? "(sem nome)"}`);
					continue;
				}
				if (seen.has(skill.name)) continue; // built-in wins over user override
				seen.add(skill.name);
				skills.push(skill);
			}
		} catch (error) {
			onError(
				`Falha ao carregar skills do usuário: ${error?.message ?? error}`,
			);
		}
	}

	skills.sort((a, b) => a.name.localeCompare(b.name));

	return {
		skills,
		/** @param {string} name */
		has(name) {
			return seen.has(name);
		},
		/** @param {string} name */
		get(name) {
			return skills.find((skill) => skill.name === name) ?? null;
		},
		get catalogPrompt() {
			return buildSkillCatalogPrompt(skills);
		},
	};
}
