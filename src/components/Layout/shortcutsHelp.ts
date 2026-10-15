import { create } from "zustand";

// Open state of the keyboard-shortcuts dialog: opened by the global "?" key
// and from the sidebar, rendered once by ShortcutsHelpHost.
interface ShortcutsHelpState {
	open: boolean;
	setOpen: (open: boolean) => void;
}

export const useShortcutsHelp = create<ShortcutsHelpState>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
}));
