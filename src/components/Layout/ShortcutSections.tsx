import type React from "react";
import {
	formatShortcutKeys,
	SHORTCUT_GROUPS,
	SHORTCUTS,
	type Shortcut,
} from "../../utils/shortcuts";

const Keys: React.FC<{ shortcut: Shortcut }> = ({ shortcut }) => (
	<>
		{shortcut.ctrl && (
			<>
				<kbd>Ctrl</kbd> +{" "}
			</>
		)}
		{shortcut.shift && (
			<>
				<kbd>Shift</kbd> +{" "}
			</>
		)}
		{shortcut.alt && (
			<>
				<kbd>Alt</kbd> +{" "}
			</>
		)}
		{formatShortcutKeys(shortcut).map((k, i) => (
			<span key={k}>
				{i > 0 && " / "}
				<kbd>{k}</kbd>
			</span>
		))}
	</>
);

/**
 * Every keyboard binding, rendered from the same table the handlers read
 * (`utils/shortcuts.ts`). Uses the HelpModal section layout.
 */
export const ShortcutSections: React.FC<{
	titlePrefix?: string;
	/** Omits the divider above the first group. */
	first?: boolean;
}> = ({ titlePrefix = "", first }) => (
	<>
		{SHORTCUT_GROUPS.map((group, gi) => (
			<div className="help-section" key={group.title}>
				{!(first && gi === 0) && <div className="help-section-divider" />}
				<div className="help-section-title">
					{titlePrefix}
					{group.title}
				</div>
				<ul className="help-section-list">
					{group.ids.map((id) => (
						<li key={id}>
							<Keys shortcut={SHORTCUTS[id]} />: {SHORTCUTS[id].description}
						</li>
					))}
				</ul>
			</div>
		))}
	</>
);
