/**
 * Minimal LCS-based line diff used by the visual diff page.
 * Pure functions, no DOM dependencies.
 */

/**
 * Computes the longest common subsequence table for two arrays.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number[][]}
 */
function lcsTable(a, b) {
	const table = [];
	for (let i = 0; i <= a.length; i++) {
		table.push(new Array(b.length + 1).fill(0));
	}
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			if (a[i] === b[j]) {
				table[i][j] = table[i + 1][j + 1] + 1;
			} else {
				table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
			}
		}
	}
	return table;
}

/**
 * Computes a unified line diff between two texts.
 * @param {string} oldText
 * @param {string} newText
 * @param {string} [eol] Line separator used to split (defaults to "\n")
 * @returns {{type: "same"|"add"|"del", oldLine: number|null, newLine: number|null, text: string}[]}
 */
export function diffLines(oldText, newText, eol = "\n") {
	const a = String(oldText ?? "").split(eol);
	const b = String(newText ?? "").split(eol);
	const table = lcsTable(a, b);
	const result = [];
	let i = 0;
	let j = 0;

	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			result.push({ type: "same", oldLine: i + 1, newLine: j + 1, text: a[i] });
			i++;
			j++;
		} else if (table[i + 1][j] >= table[i][j + 1]) {
			result.push({ type: "del", oldLine: i + 1, newLine: null, text: a[i] });
			i++;
		} else {
			result.push({ type: "add", oldLine: null, newLine: j + 1, text: b[j] });
			j++;
		}
	}
	while (i < a.length) {
		result.push({ type: "del", oldLine: i + 1, newLine: null, text: a[i] });
		i++;
	}
	while (j < b.length) {
		result.push({ type: "add", oldLine: null, newLine: j + 1, text: b[j] });
		j++;
	}
	return result;
}

/**
 * Collapses long runs of unchanged lines around changes for compact display.
 * @param {ReturnType<typeof diffLines>} diff
 * @param {number} [context] Number of unchanged lines to keep around changes
 * @returns {Array<(ReturnType<typeof diffLines>[number] | {type: "gap"})>}
 */
export function collapseContext(diff, context = 3) {
	const keep = new Set();
	diff.forEach((entry, index) => {
		if (entry.type === "same") return;
		for (
			let i = Math.max(0, index - context);
			i <= Math.min(diff.length - 1, index + context);
			i++
		) {
			keep.add(i);
		}
	});

	const result = [];
	let inGap = false;
	diff.forEach((entry, index) => {
		if (keep.has(index)) {
			result.push(entry);
			inGap = false;
		} else if (!inGap) {
			result.push({ type: "gap" });
			inGap = true;
		}
	});
	return result;
}

export default { diffLines, collapseContext };
