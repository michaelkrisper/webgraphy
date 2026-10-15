import { X } from "lucide-react";
import type React from "react";
import {
	type Notification,
	useNotificationStore,
} from "../../store/useNotificationStore";

function Toast({ n }: { n: Notification }) {
	const dismiss = useNotificationStore((s) => s.dismiss);
	const pause = useNotificationStore((s) => s.pause);
	const resume = useNotificationStore((s) => s.resume);
	const isError = n.kind === "error";

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.stopPropagation();
			dismiss(n.id);
		}
	};

	return (
		<div
			className={`toast toast--${n.kind}`}
			{...(isError
				? { role: "alert" }
				: { role: "status", "aria-live": "polite" as const })}
			onMouseEnter={() => pause(n.id)}
			onMouseLeave={() => resume(n.id)}
			onFocus={() => pause(n.id)}
			onBlur={() => resume(n.id)}
			onKeyDown={onKeyDown}
		>
			<span>{n.message}</span>
			{n.action && (
				<button
					type="button"
					className="toast-action"
					onClick={() => {
						n.action?.onAction();
						dismiss(n.id);
					}}
				>
					{n.action.label}
				</button>
			)}
			<button
				type="button"
				className="toast-close"
				aria-label="Dismiss notification"
				onClick={() => dismiss(n.id)}
			>
				<X size={14} aria-hidden="true" />
			</button>
		</div>
	);
}

/** Bottom-right toast stack. Render once in the app shell; feed it via `notify`. */
export function Toaster() {
	const notifications = useNotificationStore((s) => s.notifications);
	return (
		<section className="toaster" aria-label="Notifications">
			{notifications.map((n) => (
				<Toast key={n.id} n={n} />
			))}
		</section>
	);
}
