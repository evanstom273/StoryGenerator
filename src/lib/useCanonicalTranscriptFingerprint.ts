import { useEffect, useState } from "react";
import type { StoryMessage } from "../types/models";
import { buildCanonicalTranscriptFingerprint } from "./archiveIndexing";

export function useCanonicalTranscriptFingerprint(messages: readonly StoryMessage[]) {
	const [fingerprint, setFingerprint] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		setFingerprint(null);
		void buildCanonicalTranscriptFingerprint(messages)
			.then((nextFingerprint) => {
				if (active) setFingerprint(nextFingerprint);
			})
			.catch(() => {
				if (active) setFingerprint(null);
			});
		return () => {
			active = false;
		};
	}, [messages]);

	return fingerprint;
}
