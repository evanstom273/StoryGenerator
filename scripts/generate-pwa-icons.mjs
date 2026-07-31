import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const iconSvg = await readFile(join(publicDir, "icon.svg"));

async function writePng(size, filename) {
	await sharp(iconSvg, { density: Math.round((size / 512) * 144) })
		.resize(size, size)
		.png()
		.toFile(join(publicDir, filename));
}

await writePng(192, "pwa-192x192.png");
await writePng(512, "pwa-512x512.png");
await writePng(180, "apple-touch-icon.png");

console.log("Generated PWA icons in public/");
