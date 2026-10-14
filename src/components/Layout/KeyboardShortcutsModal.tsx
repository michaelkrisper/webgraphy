import type React from "react";
import { Modal } from "./Modal";
import { ShortcutSections } from "./ShortcutSections";

export const KeyboardShortcutsModal: React.FC<{ onClose: () => void }> = ({
	onClose,
}) => (
	<Modal
		onClose={onClose}
		title="Keyboard shortcuts"
		maxWidth="560px"
		ariaLabel="Close keyboard shortcuts"
	>
		<ShortcutSections first />
	</Modal>
);
