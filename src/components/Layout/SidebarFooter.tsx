import React, { useState } from "react";
import packageJson from "../../../package.json";
import { HelpModal } from "./HelpModal";
import { ImprintModal } from "./ImprintModal";
import { LicenseModal } from "./LicenseModal";

export const SidebarFooter: React.FC = () => {
	const [showImprint, setShowImprint] = useState(false);
	const [showHelp, setShowHelp] = useState(false);
	const [showLicense, setShowLicense] = useState(false);

	return (
		<>
			<footer
				className="sb-footer"
				style={{
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
					<span style={{ opacity: 0.8 }}>v{packageJson.version}</span>
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
			</footer>

			{showImprint && <ImprintModal onClose={() => setShowImprint(false)} />}
			{showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
			{showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
		</>
	);
};
