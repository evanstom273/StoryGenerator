import { afterEach, describe, expect, it } from "vitest";
import { getDefaultMediaSessionArtwork } from "../mediaSession";

describe("mediaSession", () => {
	afterEach(() => {
		delete (globalThis as { location?: Location }).location;
	});

	it("builds absolute artwork URLs from the current origin", () => {
		Object.defineProperty(globalThis, "location", {
			value: { origin: "https://story.example" },
			configurable: true,
		});

		expect(getDefaultMediaSessionArtwork()).toEqual([
			{
				src: "https://story.example/pwa-512x512.png",
				sizes: "512x512",
				type: "image/png",
			},
			{
				src: "https://story.example/pwa-192x192.png",
				sizes: "192x192",
				type: "image/png",
			},
			{
				src: "https://story.example/apple-touch-icon.png",
				sizes: "180x180",
				type: "image/png",
			},
		]);
	});
});
