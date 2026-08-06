import { createContext, useContext } from "react";

type LibrarySearchContextValue = {
	open: boolean;
	openSearch: (query?: string) => void;
	closeSearch: () => void;
};

export const LibrarySearchContext = createContext<LibrarySearchContextValue | null>(null);

export function useLibrarySearch() {
	const context = useContext(LibrarySearchContext);
	if (!context) {
		throw new Error("useLibrarySearch must be used inside LibrarySearchContext.Provider.");
	}
	return context;
}
