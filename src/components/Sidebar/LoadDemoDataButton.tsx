import { FlaskConical } from "lucide-react";
import type React from "react";
import { lazy, Suspense, useState } from "react";
import { useGraphStore } from "../../store/useGraphStore";
import { notify } from "../../store/useNotificationStore";

const ConfirmDialog = lazy(() =>
	import("../Layout/ConfirmDialog").then((m) => ({ default: m.ConfirmDialog })),
);

/**
 * Low-key "Demo data" entry for the Data Sources section; the empty chart
 * carries the prominent one. Demo data is appended, never swapped in, so it
 * asks before mixing into the user's own datasets.
 */
export const LoadDemoDataButton: React.FC = () => {
	const hasData = useGraphStore((s) => s.datasets.length > 0);
	const [confirmOpen, setConfirmOpen] = useState(false);

	const addAlongside = async () => {
		setConfirmOpen(false);
		await useGraphStore.getState().loadDemoData();
		notify({ kind: "success", message: "Demo data added" });
	};

	return (
		<>
			<button
				type="button"
				className="sb-footer-btn"
				title="Load Demo Data"
				onClick={() => {
					if (hasData) setConfirmOpen(true);
					else useGraphStore.getState().loadDemoData();
				}}
				style={{ padding: 0 }}
			>
				<FlaskConical size={14} aria-hidden="true" />
				Demo data
			</button>
			<Suspense fallback={null}>
				{confirmOpen && (
					<ConfirmDialog
						title="Load demo data?"
						message="Your current data stays loaded. The demo dataset and its series are added alongside it."
						confirmLabel="Add alongside"
						onConfirm={addAlongside}
						onCancel={() => setConfirmOpen(false)}
					/>
				)}
			</Suspense>
		</>
	);
};
