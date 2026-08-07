import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import type { MediaAsset, MediaAssetCategory } from "../../types/models";
import { listMediaAssets, MEDIA_LIBRARY_CHANGED_EVENT } from "../../lib/mediaLibrary/store";
import { useStoryEngine } from "./StoryEngineProvider";

export type MediaAssetView = MediaAsset & {
	isOrphaned: boolean;
};

type MediaLibraryContextValue = {
	assets: MediaAssetView[];
	loading: boolean;
	refresh: () => Promise<void>;
	getByCategory: (category: MediaAssetCategory) => MediaAssetView[];
};

const MediaLibraryContext = createContext<MediaLibraryContextValue | null>(null);

export function MediaLibraryProvider({ children }: { children: ReactNode }) {
	const { stories } = useStoryEngine();
	const [assets, setAssets] = useState<MediaAsset[]>([]);
	const [loading, setLoading] = useState(true);

	const storyIds = useMemo(() => new Set(stories.map((story) => story.id)), [stories]);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const records = await listMediaAssets();
			setAssets(records);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		function handleChange() {
			void refresh();
		}

		window.addEventListener(MEDIA_LIBRARY_CHANGED_EVENT, handleChange);
		return () => window.removeEventListener(MEDIA_LIBRARY_CHANGED_EVENT, handleChange);
	}, [refresh]);

	const assetViews = useMemo<MediaAssetView[]>(
		() =>
			assets.map((asset) => ({
				...asset,
				isOrphaned: asset.orphaned || Boolean(asset.storyId && !storyIds.has(asset.storyId)),
			})),
		[assets, storyIds],
	);

	const value = useMemo<MediaLibraryContextValue>(
		() => ({
			assets: assetViews,
			loading,
			refresh,
			getByCategory: (category) => assetViews.filter((asset) => asset.category === category),
		}),
		[assetViews, loading, refresh],
	);

	return (
		<MediaLibraryContext.Provider value={value}>{children}</MediaLibraryContext.Provider>
	);
}

export function useMediaLibrary() {
	const context = useContext(MediaLibraryContext);
	if (!context) {
		throw new Error("useMediaLibrary must be used within MediaLibraryProvider.");
	}
	return context;
}
