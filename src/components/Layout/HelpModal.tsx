import type React from "react";
import { Modal } from "./Modal";
import { ShortcutSections } from "./ShortcutSections";

interface HelpModalProps {
	onClose: () => void;
}

const Section: React.FC<{
	title: string;
	children: React.ReactNode;
	first?: boolean;
}> = ({ title, children, first }) => (
	<div className="help-section">
		{!first && <div className="help-section-divider" />}
		<div className="help-section-title">{title}</div>
		<ul className="help-section-list">{children}</ul>
	</div>
);

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
	return (
		<Modal
			onClose={onClose}
			title="Help & Interactions"
			maxWidth="900px"
			ariaLabel="Close Help"
		>
			<Section title="Chart" first>
				<li>
					<strong>Wheel / drag:</strong> Zoom / pan. Hold <kbd>Shift</kbd> to move
					all X axes together
				</li>
				<li>
					<strong>Ctrl + drag:</strong> Zoom to a box
				</li>
				<li>
					<strong>Double-click, or Fit All:</strong> Fit every axis to its data.{" "}
					<strong>Stacked Fit</strong> gives each Y axis its own band
				</li>
				<li>
					<strong>Hover:</strong> Crosshair and tooltip snap to the nearest point
				</li>
				<li>
					<strong>Legend:</strong> Click an entry to hide or show its series
				</li>
				<li>
					<strong>Drop a file</strong> on the chart to import it
				</li>
			</Section>

			<Section title="Axes">
				<li>
					<strong>Wheel / drag on an axis:</strong> Zoom / pan only that axis
				</li>
				<li>
					<strong>Double-click an axis:</strong> Auto-scale it. On a Y axis, near the
					top or bottom fits the data into the upper or lower half
				</li>
				<li>
					<strong>Rename an X axis:</strong> Double-click its title, or press{" "}
					<kbd>Enter</kbd> on the focused axis
				</li>
			</Section>

			<Section title="Data">
				<li>
					<strong>Import:</strong> CSV, JSON or Excel, or paste spreadsheet cells (
					<kbd>Ctrl</kbd> + <kbd>V</kbd>). The import dialog sets the delimiter,
					decimal point, start row and column types
				</li>
				<li>
					<strong>Column chips:</strong> Click to plot a column; click a filled
					(plotted) chip again to remove its series
				</li>
				<li>
					<strong>X axis:</strong> Pick the X column per dataset; with several
					datasets, also pick which X axis (1–9) it uses
				</li>
				<li>
					<strong>Calculated Columns:</strong> Formulas over{" "}
					<code>[Column Name]</code> — math, <code>if</code>, rolling windows,{" "}
					<code>lag/diff</code>, per-time-bucket averages, Kalman <code>filter</code>{" "}
					and regressions (<code>linreg/polyreg/expreg/logreg/kde</code>). The dialog
					has a searchable function reference
				</li>
			</Section>

			<Section title="Series">
				<li>
					<strong>Rows:</strong> Drag to reorder; pick a Y axis (share one, or New
					axis — up to 9), its side and grid, line style, markers and colour
				</li>
				<li>
					<strong>Undo:</strong> Deletes and edits can be undone (<kbd>Ctrl</kbd> +{" "}
					<kbd>Z</kbd>, or Undo in the toast)
				</li>
			</Section>

			<Section title="View & export">
				<li>
					<strong>Session &amp; Export:</strong> Save or open the whole workspace as
					a <code>.webgraphy</code> session file; export the view as SVG or PNG or
					the visible data as CSV
				</li>
				<li>
					<strong>Toolbar:</strong> View the plotted values as a table (copy or
					export CSV), toggle grid, crosshair and legend, pick a theme
				</li>
				<li>
					<strong>Dataset CSV:</strong> The download icon on a dataset exports all
					its rows, calculated columns included
				</li>
				<li>
					<strong>Storage:</strong> Data and settings stay in this browser
					(IndexedDB) and are restored on the next visit. Usage is under ⋯ in the
					footer
				</li>
				<li>
					<strong>Install as App:</strong> WebGraphy is a PWA — install it from the
					browser for offline use
				</li>
			</Section>

			<ShortcutSections titlePrefix="Keyboard: " />
		</Modal>
	);
};
