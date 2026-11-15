import { Code, HardDrive, Keyboard, MoreHorizontal, Scale } from "lucide-react";
import type React from "react";
import { lazy, Suspense, useState } from "react";
import { SHORTCUTS, shortcutHint } from "../../utils/shortcuts";
import { releaseVersion } from "../../utils/version";
import { PopupPicker, type PopupPickerOption } from "../Sidebar/PopupPicker";
import { useShortcutsHelp } from "./shortcutsHelp";

// Rarely opened; kept out of the entry chunk (see size-budget.json).
const HelpModal = lazy(() =>
	import("./HelpModal").then((m) => ({ default: m.HelpModal })),
);
const LicenseModal = lazy(() =>
	import("./LicenseModal").then((m) => ({ default: m.LicenseModal })),
);
const StorageReadout = lazy(() =>
	import("./StorageReadout").then((m) => ({ default: m.StorageReadout })),
);

type MoreItem = "shortcuts" | "storage" | "license" | "source";

// The legal pages are central, shared by all apps on krisperapps.de (German).
const LEGAL = [
	["Imprint", "https://krisperapps.de/impressum", "Legal notice"],
	["Privacy", "https://krisperapps.de/datenschutz#webgraphy", "Privacy notice"],
	["Terms", "https://krisperapps.de/nutzung", "Terms of use"],
] as const;

export const SidebarFooter: React.FC = () => {
	const [showHelp, setShowHelp] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const [showStorage, setShowStorage] = useState(false);

	// Secondary links live behind one overflow button: the sidebar is too
	// narrow for all of them next to the version and the copyright.
	const moreOptions: PopupPickerOption<MoreItem>[] = [
		{
			value: "shortcuts",
			icon: <Keyboard size={14} />,
			label: `Keyboard shortcuts (${shortcutHint(SHORTCUTS.showShortcuts)})`,
			description: "Lists every keyboard binding",
		},
		{
			value: "storage",
			icon: <HardDrive size={14} />,
			label: showStorage ? "Hide storage usage" : "Storage usage",
			description:
				"Browser storage used by your data and whether it is protected from eviction",
		},
		{
			value: "license",
			icon: <Scale size={14} />,
			label: "License",
			description: "Shows the MIT license text",
		},
		{
			value: "source",
			icon: <Code size={14} />,
			label: "Source code",
			description: "Opens the GitHub repository in a new tab",
		},
	];

	const onMore = (item: MoreItem) => {
		if (item === "shortcuts") useShortcutsHelp.getState().setOpen(true);
		else if (item === "storage") setShowStorage((v) => !v);
		else if (item === "license") setShowLicense(true);
		else
			window.open(
				"https://github.com/michaelkrisper/webgraphy",
				"_blank",
				"noopener",
			);
	};

	return (
		<>
			<footer className="sb-footer">
				<div className="sb-footer-links">
					<span className="sb-footer-version" title={`v${__APP_VERSION__}`}>
						{releaseVersion(__APP_VERSION__)}
					</span>
					<span className="sb-footer-sep" aria-hidden="true">
						|
					</span>
					<button
						onClick={() => setShowHelp(true)}
						className="sb-footer-btn"
						type="button"
						aria-description="Explains the mouse and keyboard interactions, data import and export"
					>
						Help
					</button>
					<PopupPicker
						options={moreOptions}
						current={"" as MoreItem}
						onChange={onMore}
						popoverId="footer-more-popover"
						label="More"
						minWidth={180}
						renderTrigger={({ onClick, ref, popupProps }) => (
							<button
								ref={ref}
								onClick={onClick}
								className="sb-footer-btn"
								type="button"
								title="Keyboard shortcuts, storage, license, source code"
								aria-label="More"
								aria-description="Opens a menu with keyboard shortcuts, storage usage, license and source code"
								{...popupProps}
							>
								<MoreHorizontal size={14} aria-hidden="true" />
							</button>
						)}
					/>
				</div>
				<span className="sb-footer-copy">© Michael Krisper</span>
				<nav className="sb-footer-legal" aria-label="Legal">
					{LEGAL.map(([label, href, what]) => (
						<a
							key={href}
							href={href}
							target="_blank"
							rel="noopener"
							aria-description={`${what} (German); opens in a new tab`}
						>
							{label}
						</a>
					))}
				</nav>
				{showStorage && (
					<Suspense fallback={null}>
						<StorageReadout />
					</Suspense>
				)}
			</footer>

			<Suspense fallback={null}>
				{showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
				{showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
			</Suspense>
		</>
	);
};
