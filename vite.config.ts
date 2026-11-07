import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: [
				"favicon.svg",
				"apple-touch-icon.png",
				"mask-icon.svg",
				"pwa-192x192.png",
				"pwa-512x512.png",
				"pwa-maskable-192x192.png",
				"pwa-maskable-512x512.png",
				"ios-splash/*.png",
			],
			manifest: {
				id: "/",
				name: "Story Engine",
				short_name: "Story Engine",
				description:
					"Story Engine is a storytelling platform for original characters, fictional universes, and long-term continuity.",
				theme_color: "#0A0A0A",
				background_color: "#0A0A0A",
				display: "standalone",
				scope: "/",
				start_url: "/",
				orientation: "portrait-primary",
				icons: [
					{
						src: "pwa-192x192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "pwa-maskable-192x192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "maskable",
					},
					{
						src: "pwa-maskable-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
				navigateFallback: "/index.html",
				navigateFallbackDenylist: [/^\/api\//],
				cleanupOutdatedCaches: true,
			},
			devOptions: {
				enabled: true,
			},
		}),
	],
});
