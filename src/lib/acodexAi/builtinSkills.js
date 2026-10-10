import { parseSkillFile } from "./skills";

/**
 * Built-in Acodex AI skills, authored in the Agent Skills format
 * (`SKILL.md` front-matter + instructions) so they behave exactly like
 * user-authored skills installed under `.acodex/skills/`.
 */

/** @type {string[]} */
export const BUILTIN_SKILL_DOCUMENTS = [
	`---
name: code-review
description: Reviews the active file (or a selection) and reports bugs, security issues and style problems with concrete fixes.
---
You are reviewing code inside the Acodex editor.

1. Read the file with get_active_file (or get_selection when the user selected part of it).
2. Analyze for: correctness bugs, security issues (injection, hardcoded secrets, unsafe eval), performance traps, readability.
3. Answer in the user's language. Structure the answer as a numbered list of findings ordered by severity (critical, warning, note).
4. For each finding, show the problematic snippet in a Markdown code block and, when possible, a corrected snippet.
5. End with a one-line overall verdict. Never rewrite the whole file unless asked.`,
	`---
name: explain-code
description: Explains what a file, function or selection does, step by step, in the user's language.
---
1. Read the relevant code (get_active_file or get_selection).
2. Explain in the user's language: what the code does overall, then walk through the main blocks in order.
3. Use short paragraphs and small code excerpts (max 5 lines each) rather than repeating the whole file.
4. Mention edge cases, inputs/outputs and any dependency the code relies on.
5. Keep it beginner-friendly unless the user is clearly experienced in the topic.`,
	`---
name: gen-tests
description: Generates unit tests for the active file or selection using the project's existing test framework.
---
1. Read the code under test and any imports you need (get_active_file, list_open_files, read_file).
2. Detect the test framework from the project (look for vitest/jest configs, existing tests folder) and match its style.
3. Produce one new test file covering the public functions: happy path, edge cases and failure modes.
4. Output the complete test file in a single Markdown code block with the correct import paths.
5. Suggest the command to run the tests. Do not invent APIs that do not exist in the module.`,
	`---
name: commit-message
description: Writes a clean, conventional commit message from the uncommitted changes in the current file or selection.
---
1. Look at the current file (and selection) to infer what changed.
2. Write a conventional-commit message: type(scope): imperative summary in lowercase, max 50 chars.
3. Add a short body (max 3 lines, 72 cols) explaining why, not what.
4. Answer ONLY with the commit message inside a code block, ready to copy. No extra commentary.`,
	`---
name: refactor
description: Refactors the active file or selection improving structure and readability without changing behavior.
---
1. Read the code (get_active_file or get_selection).
2. Propose a refactor that preserves behavior: extract duplicated logic, simplify conditionals, name things clearly, keep the project's formatting style.
3. Show the refactored code in a full Markdown code block using replace_active_file-ready content.
4. List what changed and why in at most 5 bullets.
5. If the code is already clean, say so instead of inventing changes.`,
	`---
name: write-docs
description: Generates or updates documentation (README section, JSDoc, docstrings) for the active file.
---
1. Read the file to document.
2. Detect the documentation style already used in the project (JSDoc, docstrings, README sections) and match it.
3. Produce the documentation: public API first, parameters, returns, thrown errors and one usage example.
4. Write the docs in English unless the project's existing docs are in another language.
5. Output the result in a Markdown code block. Keep the same indentation as the source.`,
];

/** @type {import("./types").Skill[]} */
export const BUILTIN_SKILLS = BUILTIN_SKILL_DOCUMENTS.map((doc) =>
	parseSkillFile(doc),
).filter(Boolean);
