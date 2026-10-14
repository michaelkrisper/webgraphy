import type React from "react";
import { useId, useRef } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y";

interface ConfirmDialogProps {
	title: string;
	message: string;
	confirmLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * Small yes/no question. An `alertdialog`, so assistive technology announces
 * the message straight away; Cancel comes first and so receives the initial
 * focus — Enter on a stray keypress does nothing destructive.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
	title,
	message,
	confirmLabel,
	onConfirm,
	onCancel,
}) => {
	const cardRef = useRef<HTMLDivElement | null>(null);
	const titleId = useDialogA11y(cardRef, onCancel);
	const messageId = useId();

	return (
		<div className="modal-overlay">
			<div
				ref={cardRef}
				className="modal-card"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={messageId}
				style={{ maxWidth: "420px", width: "90%", padding: "20px" }}
			>
				<h2 className="modal-title" id={titleId}>
					{title}
				</h2>
				<p id={messageId}>{message}</p>
				<div className="calc-actions">
					<button type="button" className="calc-btn-cancel" onClick={onCancel}>
						Cancel
					</button>
					<button
						type="button"
						className="calc-btn-submit"
						style={{ color: "var(--bg)" }}
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
};
