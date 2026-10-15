import { X } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import "./Modal.css";

interface ModalProps {
	onClose: () => void;
	title: string | React.ReactNode;
	children: React.ReactNode;
	/** Action buttons, laid out bottom-right with the primary action last. */
	footer?: React.ReactNode;
	headerActions?: React.ReactNode;
	maxWidth?: string;
	width?: string;
	height?: string;
	maxHeight?: string;
	borderRadius?: string;
	/** Padding of the body; the header and footer keep their own. */
	padding?: string;
	ariaLabel?: string;
	/** `alertdialog` for questions that interrupt, e.g. a confirmation. */
	role?: "dialog" | "alertdialog";
	/** Id of the element holding the message, announced with the title. */
	describedBy?: string;
	closeDisabled?: boolean;
}

/**
 * The one dialog frame: title top-left, a neutral close button in the
 * top-right corner, scrolling body, actions bottom-right.
 */
export const Modal: React.FC<ModalProps> = ({
	onClose,
	title,
	children,
	footer,
	headerActions,
	maxWidth = "600px",
	width = "90%",
	height,
	maxHeight = "90vh",
	borderRadius = "0",
	padding,
	ariaLabel,
	role = "dialog",
	describedBy,
	closeDisabled,
}) => {
	const cardRef = useRef<HTMLDivElement | null>(null);
	// Focus containment, Escape-to-close and focus restore. Also supplies the
	// id that names the dialog for assistive technology.
	const titleId = useDialogA11y(cardRef, onClose);
	const hasTextTitle = typeof title === "string";

	return (
		<div className="modal-overlay">
			<div
				ref={cardRef}
				className="modal-card"
				role={role}
				aria-modal="true"
				{...(hasTextTitle
					? { "aria-labelledby": titleId }
					: { "aria-label": ariaLabel || "Dialog" })}
				aria-describedby={describedBy}
				style={{ borderRadius, maxWidth, width, height, maxHeight }}
			>
				<div className="modal-header">
					{hasTextTitle ? (
						<h2 className="modal-title" id={titleId}>
							{title}
						</h2>
					) : (
						title
					)}
					{headerActions}
				</div>
				<button
					type="button"
					onClick={onClose}
					disabled={closeDisabled}
					aria-label={ariaLabel || "Close dialog"}
					title="Close (Esc)"
					className="modal-close"
					data-dialog-close
				>
					<X size={18} aria-hidden="true" />
				</button>
				<div
					className="modal-body"
					style={{ padding: padding ?? (footer ? "0 24px" : "0 24px 24px") }}
				>
					{children}
				</div>
				{footer && <div className="modal-footer">{footer}</div>}
			</div>
		</div>
	);
};
