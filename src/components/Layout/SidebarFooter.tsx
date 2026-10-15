import { HardDrive, Info, Keyboard, MoreHorizontal, Scale } from "lucide-react";
import type React from "react";
import { lazy, Suspense, useState } from "react";
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
			label: "Keyboard shortcuts (?)",
		},
		{
			value: "storage",
			icon: <HardDrive size={14} />,
			label: showStorage ? "Hide storage usage" : "Storage usage",
		},
		{ value: "license", icon: <Scale size={14} />, label: "License" },
		{ value: "imprint", icon: <Info size={14} />, label: "Imprint" },
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
						v{__APP_VERSION__}
					</span>
					<span className="sb-footer-sep" aria-hidden="true">
						|
					</span>
					<button
						onClick={() => setShowHelp(true)}
						className="sb-footer-btn"
						type="button"
					>
						Help
					</button>
					<PopupPicker
						options={moreOptions}
						current={"" as MoreItem}
						onChange={onMore}
						popoverId="footer-more-popover"
						minWidth={180}
						renderTrigger={({ onClick, ref, isOpen }) => (
							<button
								ref={ref}
								onClick={onClick}
								className="sb-footer-btn"
								type="button"
								title="Keyboard shortcuts, storage, license, imprint"
								aria-label="More"
								aria-haspopup="true"
								aria-expanded={isOpen}
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
