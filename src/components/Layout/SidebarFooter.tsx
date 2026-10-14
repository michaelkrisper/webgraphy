import { Keyboard } from "lucide-react";
import type React from "react";
import { lazy, Suspense, useState } from "react";
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

export const SidebarFooter: React.FC = () => {
	const [showImprint, setShowImprint] = useState(false);
	const [showHelp, setShowHelp] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const [showStorage, setShowStorage] = useState(false);

	return (
		<>
			<footer
				className="sb-footer"
				style={{
					position: "relative",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					gap: "12px",
					padding: "8px 12px",
					whiteSpace: "nowrap",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "8px",
						fontSize: "0.7rem",
						color: "var(--text-muted-color)",
					}}
				>
					<span style={{ opacity: 0.8 }}>v{__APP_VERSION__}</span>
					<span style={{ opacity: 0.5 }}>|</span>
					<button
						onClick={() => setShowHelp(true)}
						className="sb-footer-btn"
						type="button"
						title="Help"
						style={{ fontSize: "0.7rem", padding: 0 }}
					>
						Help
					</button>
					{/* Icon only: the footer row has no width left for another label. */}
					<button
						onClick={() => useShortcutsHelp.getState().setOpen(true)}
						className="sb-footer-btn"
						type="button"
						title="Keyboard shortcuts (?)"
						aria-label="Keyboard shortcuts"
						style={{ padding: 0, display: "flex" }}
					>
						<Keyboard size={14} aria-hidden="true" />
					</button>
					<span style={{ opacity: 0.5 }}>|</span>
					<button
						onClick={() => setShowLicense(true)}
						className="sb-footer-btn"
						type="button"
						title="License"
						style={{ fontSize: "0.7rem", padding: 0 }}
					>
						License
					</button>
					<span style={{ opacity: 0.5 }}>|</span>
					<button
						onClick={() => setShowImprint(true)}
						className="sb-footer-btn"
						type="button"
						title="Imprint"
						style={{ fontSize: "0.7rem", padding: 0 }}
					>
						Imprint
					</button>
					<span style={{ opacity: 0.5 }}>|</span>
					<button
						onClick={() => setShowStorage((v) => !v)}
						className="sb-footer-btn"
						type="button"
						title="Browser storage usage"
						aria-expanded={showStorage}
						style={{ fontSize: "0.7rem", padding: 0 }}
					>
						Storage
					</button>
				</div>
				<div
					style={{
						fontSize: "0.7rem",
						color: "var(--text-muted-color)",
						opacity: 0.8,
						textAlign: "right",
					}}
				>
					© Michael Krisper
				</div>
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
