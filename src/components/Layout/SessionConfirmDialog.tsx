import type React from "react";
import { useCallback } from "react";
import type { SessionPrompt } from "../../store/useSessionPrompt";
import { Modal } from "./Modal";

export const SessionConfirmDialog: React.FC<{ prompt: SessionPrompt }> = ({
	prompt,
}) => {
	const cancel = useCallback(() => prompt.resolve(false), [prompt]);

	return (
		<Modal
			onClose={cancel}
			title="Open session?"
			maxWidth="460px"
			footer={
				<div className="calc-actions">
					<button type="button" className="calc-btn-cancel" onClick={cancel}>
						Cancel
					</button>
					<button
						type="button"
						className="calc-btn-submit"
						onClick={() => prompt.resolve(true)}
					>
						Replace workspace
					</button>
				</div>
			}
		>
			<p>
				Opening <strong>{prompt.fileName}</strong> ({prompt.summary}) replaces all
				current datasets, series and axes.
			</p>
			<p>You can undo this with Ctrl+Z.</p>
		</Modal>
	);
};
