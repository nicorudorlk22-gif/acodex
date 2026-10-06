import "./fileDiff.scss";
import Page from "components/page";
import toast from "components/toast";
import actionStack from "lib/actionStack";
import { collapseContext, diffLines } from "lib/lineDiff";
import helpers from "utils/helpers";

/**
 * Opens a full-screen unified diff page.
 * @param {object} params
 * @param {string} params.title Page title (e.g. file name)
 * @param {string} params.oldText
 * @param {string} params.newText
 * @param {string} [params.oldLabel] Label for the left/old side
 * @param {string} [params.newLabel] Label for the right/new side
 * @param {() => Promise<boolean>} [params.onRestore] Optional restore action
 */
export default function fileDiff({
	title,
	oldText,
	newText,
	oldLabel,
	newLabel,
	onRestore,
}) {
	const $page = Page(title);
	$page.classList.add("file-diff-page");

	let diff = diffLines(oldText, newText);
	const collapsed = collapseContext(diff);
	diff = null; // free memory

	let added = 0;
	let removed = 0;
	const rows = collapsed.map((entry) => {
		if (entry.type === "gap") {
			return (
				<div className="diff-row diff-gap" aria-hidden="true">
					⋯
				</div>
			);
		}
		if (entry.type === "add") added++;
		if (entry.type === "del") removed++;
		const lineText = entry.text || "";
		const escaped = lineText
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		return (
			<div className={`diff-row diff-${entry.type}`}>
				<span className="diff-old-line">{entry.oldLine ?? ""}</span>
				<span className="diff-new-line">{entry.newLine ?? ""}</span>
				<span className="diff-sign">
					{entry.type === "add" ? "+" : entry.type === "del" ? "-" : " "}
				</span>
				<pre className="diff-text">{escaped}</pre>
			</div>
		);
	});

	const summary = `+${added} -${removed}`;

	$page.header = (
		<header>
			<span className="diff-summary">
				<span className="added">+{added}</span>
				<span className="removed">-{removed}</span>
			</span>
		</header>
	);
	$page.body = (
		<main id="file-diff" className="main scroll">
			<div className="diff-labels">
				<span className="diff-label old">
					{oldLabel || strings["original"] || "Original"}
				</span>
				<span className="diff-label new">
					{newLabel || strings["current"] || "Current"}
				</span>
			</div>
			<div className="diff-rows">{rows}</div>
			{onRestore ? (
				<div className="diff-actions">
					<button
						className="button"
						type="button"
						onclick={async (event) => {
							const $btn = event.target.closest("button");
							$btn.disabled = true;
							try {
								const ok = await onRestore();
								if (ok) {
									toast(strings["restored"] || "Restored");
									$page.hide();
								} else {
									toast(strings["restore failed"] || "Restore failed");
								}
							} catch (error) {
								toast(error?.message || "Restore failed");
							} finally {
								$btn.disabled = false;
							}
						}}
					>
						{strings["restore this version"] || "Restore this version"}
					</button>
				</div>
			) : null}
			<div className="diff-summary-footer">{summary}</div>
		</main>
	);

	actionStack.push({
		id: "file-diff",
		action: $page.hide,
	});

	$page.onhide = function () {
		actionStack.remove("file-diff");
	};

	app.append($page);
	helpers.showAd();
}
