import type React from "react";
import { useId } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
	title: string;
	message: string;
	confirmLabel: string;
	/** What confirming does, announced with the confirm button. */
	confirmDescription: string;
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
	confirmDescription,
	onConfirm,
	onCancel,
}) => {
	const messageId = useId();

	return (
		<Modal
			onClose={onCancel}
			title={title}
			role="alertdialog"
			describedBy={messageId}
			maxWidth="420px"
			footer={
				<>
					<button
						type="button"
						className="modal-btn"
						onClick={onCancel}
						aria-description="Closes the question and changes nothing"
					>
						Cancel
					</button>
					<button
						type="button"
						className="modal-btn modal-btn--primary"
						onClick={onConfirm}
						aria-description={confirmDescription}
					>
						{confirmLabel}
					</button>
				</>
			}
		>
			<p id={messageId} className="modal-message">
				{message}
			</p>
		</Modal>
	);
};
