import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "public", "ios-splash");

/** width, height, media query for portrait iPhone/iPad PWAs */
const SPLASH_TARGETS = [
	[1290, 2796, "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
	[1179, 2556, "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
	[1170, 2532, "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
	[1284, 2778, "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
	[1125, 2436, "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
	[1242, 2688, "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
	[828, 1792, "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
	[1080, 2340, "(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
	[750, 1334, "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
	[640, 1136, "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
	[1536, 2048, "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
	[1668, 2388, "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
	[2048, 2732, "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
];

function buildSplashSvg(width, height) {
	const logoBox = Math.round(width * 0.155);
	const logoRadius = Math.round(logoBox * 0.2);
	const logoX = Math.round((width - logoBox) / 2);
	const logoY = Math.round(height * 0.42 - logoBox / 2);
	const iconSize = Math.round(logoBox * 0.62);
	const iconX = logoX + Math.round((logoBox - iconSize) / 2);
	const iconY = logoY + Math.round((logoBox - iconSize) / 2);
	const titleSize = Math.round(width * 0.052);
	const statusSize = Math.round(width * 0.031);
	const titleY = logoY + logoBox + Math.round(titleSize * 1.8);
	const statusY = titleY + Math.round(titleSize * 2.4);

	return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#0A0A0A"/>
  <defs>
    <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(139,92,246,0.26)"/>
      <stop offset="55%" stop-color="rgba(167,139,250,0.10)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.06)"/>
    </linearGradient>
  </defs>
  <rect x="${logoX}" y="${logoY}" width="${logoBox}" height="${logoBox}" rx="${logoRadius}" fill="url(#logoBg)" stroke="#2A2A2A" stroke-width="${Math.max(2, Math.round(width * 0.0025))}"/>
  <svg x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="4.5" fill="#FFFFFF"/>
    <path d="M8 24c4.2-5.4 9.9-8 16-8s11.8 2.6 16 8c-4.2 5.4-9.9 8-16 8S12.2 29.4 8 24Z" stroke="#FFFFFF" stroke-opacity="0.92" stroke-width="2"/>
    <path d="M24 8c5.4 4.2 8 9.9 8 16s-2.6 11.8-8 16c-5.4-4.2-8-9.9-8-16s2.6-11.8 8-16Z" stroke="#FFFFFF" stroke-opacity="0.72" stroke-width="2"/>
  </svg>
  <text x="${width / 2}" y="${titleY}" text-anchor="middle" fill="#F8FAFC" font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${titleSize}" font-weight="600" letter-spacing="-0.02em">Story Engine</text>
  <text x="${width / 2}" y="${statusY}" text-anchor="middle" fill="rgba(148,163,184,0.8)" font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${statusSize}">Loading...</text>
</svg>`;
}

await mkdir(outputDir, { recursive: true });

const linkTags = [];

for (const [width, height, media] of SPLASH_TARGETS) {
	const filename = `apple-splash-${width}x${height}.png`;
	const outputPath = join(outputDir, filename);
	const svg = buildSplashSvg(width, height);
	await sharp(Buffer.from(svg)).png().toFile(outputPath);
	linkTags.push(
		`    <link rel="apple-touch-startup-image" href="/ios-splash/${filename}" media="${media}" />`,
	);
}

const linksPath = join(outputDir, "startup-links.html");
await writeFile(linksPath, `${linkTags.join("\n")}\n`);

console.log(`Generated ${SPLASH_TARGETS.length} iOS startup images in public/ios-splash/`);
