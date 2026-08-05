import { X } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y";

interface ModalProps {
	onClose: () => void;
	title: string | React.ReactNode;
	children: React.ReactNode;
	footer?: React.ReactNode;
	headerActions?: React.ReactNode;
	maxWidth?: string;
	width?: string;
	height?: string;
	maxHeight?: string;
	borderRadius?: string;
	padding?: string;
	ariaLabel?: string;
	hideHeader?: boolean;
}

/**
 * A reusable Modal component that provides a consistent backdrop and layout.
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
	padding = "24px",
	ariaLabel,
	hideHeader = false,
}) => {
	const cardRef = useRef<HTMLDivElement | null>(null);
	// Focus containment, Escape-to-close and focus restore. Also supplies the
	// id that names the dialog for assistive technology.
	const titleId = useDialogA11y(cardRef, onClose);
	const hasTextTitle = typeof title === "string" && !hideHeader;

	return (
		<div className="modal-overlay">
			<div
				ref={cardRef}
				className="modal-card"
				role="dialog"
				aria-modal="true"
				{...(hasTextTitle
					? { "aria-labelledby": titleId }
					: { "aria-label": ariaLabel || "Dialog" })}
				style={{ padding, borderRadius, maxWidth, width, height, maxHeight }}
			>
				{!hideHeader && (
					<div className="modal-header">
						{typeof title === "string" ? (
							<h2 className="modal-title" id={titleId}>
								{title}
							</h2>
						) : (
							title
						)}
						{headerActions}
						<button
							type="button"
							onClick={onClose}
							aria-label={ariaLabel || "Close dialog"}
							className="modal-close"
						>
							<X size={24} />
						</button>
					</div>
				)}
				<div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>
					{children}
				</div>
				{footer && <div className="modal-footer">{footer}</div>}
			</div>
		</div>
	);
};
