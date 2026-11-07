import { HardDrive, Info, Keyboard, MoreHorizontal, Scale } from "lucide-react";
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
const ImprintModal = lazy(() =>
	import("./ImprintModal").then((m) => ({ default: m.ImprintModal })),
);
const LicenseModal = lazy(() =>
	import("./LicenseModal").then((m) => ({ default: m.LicenseModal })),
);
const StorageReadout = lazy(() =>
	import("./StorageReadout").then((m) => ({ default: m.StorageReadout })),
);

type MoreItem = "shortcuts" | "storage" | "license" | "imprint";

export const SidebarFooter: React.FC = () => {
	const [showImprint, setShowImprint] = useState(false);
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
			value: "imprint",
			icon: <Info size={14} />,
			label: "Imprint",
			description: "Shows the author and the source code repository",
		},
	];

	const onMore = (item: MoreItem) => {
		if (item === "shortcuts") useShortcutsHelp.getState().setOpen(true);
		else if (item === "storage") setShowStorage((v) => !v);
		else if (item === "license") setShowLicense(true);
		else setShowImprint(true);
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
								title="Keyboard shortcuts, storage, license, imprint"
								aria-label="More"
								aria-description="Opens a menu with keyboard shortcuts, storage usage, license and imprint"
								{...popupProps}
							>
								<MoreHorizontal size={14} aria-hidden="true" />
							</button>
						)}
					/>
				</div>
				<span className="sb-footer-copy">© Michael Krisper</span>
				{showStorage && (
					<Suspense fallback={null}>
						<StorageReadout />
					</Suspense>
				)}
			</footer>

			<Suspense fallback={null}>
				{showImprint && <ImprintModal onClose={() => setShowImprint(false)} />}
				{showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
				{showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
			</Suspense>
		</>
	);
};
