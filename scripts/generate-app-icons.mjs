import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "android");
const publicDir = join(root, "public");
const resDir = join(androidDir, "app/src/main/res");
const iconPngPath = join(androidDir, "icon.png");
const iconSvgPath = join(publicDir, "icon.svg");
const legacyWebpLauncher = join(resDir, "mipmap-xxxhdpi/ic_launcher.webp");

const ANDROID_DENSITIES = {
	"mipmap-mdpi": { launcher: 48, foreground: 108 },
	"mipmap-hdpi": { launcher: 72, foreground: 162 },
	"mipmap-xhdpi": { launcher: 96, foreground: 216 },
	"mipmap-xxhdpi": { launcher: 144, foreground: 324 },
	"mipmap-xxxhdpi": { launcher: 192, foreground: 432 },
};

async function ensureSourceIcon() {
	try {
		return await readFile(iconPngPath);
	} catch {
		try {
			const legacyWebp = await readFile(legacyWebpLauncher);
			const png = await sharp(legacyWebp).resize(1024, 1024).png().toBuffer();
			await writeFile(iconPngPath, png);
			console.log("Created android/icon.png from mipmap-xxxhdpi/ic_launcher.webp");
			return png;
		} catch {
			const iconSvg = await readFile(iconSvgPath);
			const png = await sharp(iconSvg, { density: 288 }).resize(1024, 1024).png().toBuffer();
			await writeFile(iconPngPath, png);
			console.log("Created android/icon.png from public/icon.svg");
			return png;
		}
	}
}

async function writeLauncherIcon(source, size, outputPath) {
	await sharp(source).resize(size, size).png().toFile(outputPath);
}

async function writeForegroundIcon(source, canvasSize, outputPath) {
	const logoSize = Math.round(canvasSize * 0.62);
	const padding = Math.floor((canvasSize - logoSize) / 2);
	const logo = await sharp(source).resize(logoSize, logoSize).png().toBuffer();
	await sharp({
		create: {
			width: canvasSize,
			height: canvasSize,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite([{ input: logo, top: padding, left: padding }])
		.png()
		.toFile(outputPath);
}

const source = await ensureSourceIcon();

await writeLauncherIcon(source, 192, join(publicDir, "pwa-192x192.png"));
await writeLauncherIcon(source, 512, join(publicDir, "pwa-512x512.png"));
await writeLauncherIcon(source, 180, join(publicDir, "apple-touch-icon.png"));

for (const [folder, sizes] of Object.entries(ANDROID_DENSITIES)) {
	const folderPath = join(resDir, folder);
	await mkdir(folderPath, { recursive: true });
	await writeLauncherIcon(source, sizes.launcher, join(folderPath, "ic_launcher.png"));
	await writeLauncherIcon(source, sizes.launcher, join(folderPath, "ic_launcher_round.png"));
	await writeForegroundIcon(source, sizes.foreground, join(folderPath, "ic_launcher_foreground.png"));

	for (const name of ["ic_launcher.webp", "ic_launcher_round.webp", "ic_launcher_foreground.webp"]) {
		try {
			await unlink(join(folderPath, name));
		} catch {
			// already removed
		}
	}
}

console.log("Generated PWA icons in public/ and Android mipmap assets from android/icon.png");
