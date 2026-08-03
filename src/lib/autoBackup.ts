import type { StoryEngineRepository } from "./repository";
import {
	pruneAutoBackupRecords,
	saveAutoBackupRecord,
} from "./autoBackupStorage";
import { getAutoBackupIntervalMs } from "./autoBackupSchedule";
import { downloadFile } from "./download";

const LAST_BACKUP_AT_KEY = "story-engine:backup:lastBackupAt";
const LAST_BACKUP_SIGNATURE_KEY = "story-engine:backup:lastBackupSignature";

const BACKUP_DIR = "StoryEngineBackups";
const KEEP_LATEST = 5;

function pad(value: number) {
	return String(value).padStart(2, "0");
}

function buildTimestampedFilename(date: Date) {
	const yyyy = date.getFullYear();
	const mm = pad(date.getMonth() + 1);
	const dd = pad(date.getDate());
	const hh = pad(date.getHours());
	const min = pad(date.getMinutes());
	return `story-engine-backup-${yyyy}-${mm}-${dd}-${hh}${min}.json`;
}

async function blobToBase64(blob: Blob) {
	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();

		reader.onerror = () => {
			reject(new Error("Unable to read backup data."));
		};

		reader.onload = () => {
			const result = typeof reader.result === "string" ? reader.result : "";
			const commaIndex = result.indexOf(",");
			resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
		};

		reader.readAsDataURL(blob);
	});
}

function computeBackupSignature(backup: unknown) {
	const data = (backup as { data?: Record<string, unknown> })?.data ?? {};
	const counts = {
		universes: Array.isArray(data.universes) ? data.universes.length : 0,
		playerCharacters: Array.isArray(data.playerCharacters) ? data.playerCharacters.length : 0,
		stories: Array.isArray(data.stories) ? data.stories.length : 0,
		messages: Array.isArray(data.messages) ? data.messages.length : 0,
		universeImports: Array.isArray(data.universeImports) ? data.universeImports.length : 0,
		storySummaries: Array.isArray(data.storySummaries) ? data.storySummaries.length : 0,
		storyStates: Array.isArray(data.storyStates) ? data.storyStates.length : 0,
		storyAiConfigs: Array.isArray(data.storyAiConfigs) ? data.storyAiConfigs.length : 0,
	};

	const maxTimestamp = (list: unknown[], field: string) => {
		let max = 0;
		for (const item of list) {
			const value = (item as Record<string, unknown>)?.[field];
			if (typeof value !== "string") {
				continue;
			}
			const ts = new Date(value).getTime();
			if (Number.isFinite(ts)) {
				max = Math.max(max, ts);
			}
		}
		return max;
	};

	const maxes = {
		storiesUpdatedAt: maxTimestamp(Array.isArray(data.stories) ? data.stories : [], "updatedAt"),
		messagesTimestamp: maxTimestamp(Array.isArray(data.messages) ? data.messages : [], "timestamp"),
		storyStatesUpdatedAt: maxTimestamp(Array.isArray(data.storyStates) ? data.storyStates : [], "updatedAt"),
		universeImportsImportedAt: maxTimestamp(
			Array.isArray(data.universeImports) ? data.universeImports : [],
			"importedAt",
		),
		storySummariesGeneratedAt: maxTimestamp(
			Array.isArray(data.storySummaries) ? data.storySummaries : [],
			"generatedAt",
		),
	};

	return JSON.stringify({ counts, maxes });
}

function readLocalStorageNumber(key: string) {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) {
			return null;
		}
		const value = Number(raw);
		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

function readLocalStorageString(key: string) {
	try {
		const raw = localStorage.getItem(key);
		return typeof raw === "string" ? raw : null;
	} catch {
		return null;
	}
}

function writeLocalStorage(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {}
}

async function isAndroidNative() {
	try {
		const { Capacitor } = await import("@capacitor/core");
		return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
	} catch {
		return false;
	}
}

async function persistAndroidBackup(filename: string, json: string) {
	const blob = new Blob([json], { type: "application/json" });

	const [{ Filesystem, Directory }, { Share }] = await Promise.all([
		import("@capacitor/filesystem"),
		import("@capacitor/share"),
	]);

	const base64 = await blobToBase64(blob);
	const path = `${BACKUP_DIR}/${filename}`;
	const writeResult = await Filesystem.writeFile({
		path,
		data: base64,
		directory: Directory.Documents,
		recursive: true,
	});

	const uri =
		writeResult.uri ??
		(
			await Filesystem.getUri({
				path,
				directory: Directory.Documents,
			})
		).uri;

	try {
		const listing = await Filesystem.readdir({
			path: BACKUP_DIR,
			directory: Directory.Documents,
		});
		const files = (listing.files ?? [])
			.map((entry: { name?: string }) => String(entry.name ?? entry))
			.filter(Boolean);
		const backups = files
			.filter((name) => name.startsWith("story-engine-backup-") && name.endsWith(".json"))
			.sort()
			.reverse();

		const toDelete = backups.slice(KEEP_LATEST);
		await Promise.all(
			toDelete.map((name) =>
				Filesystem.deleteFile({
					path: `${BACKUP_DIR}/${name}`,
					directory: Directory.Documents,
				}).catch(() => {}),
			),
		);
	} catch {}

	try {
		await Share.share({
			title: filename,
			dialogTitle: "Share backup",
			url: uri,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (!/cancel/i.test(message)) {
			throw error;
		}
	}
}

async function persistWebAutoBackup(filename: string, json: string, createdAt: string) {
	await saveAutoBackupRecord({
		id: filename,
		createdAt,
		json,
	});
	await pruneAutoBackupRecords(KEEP_LATEST);

	try {
		await downloadFile(filename, json, "application/json");
	} catch {}
}

export async function runAutoBackupIfNeeded(repository: StoryEngineRepository) {
	const now = Date.now();
	const lastBackupAt = readLocalStorageNumber(LAST_BACKUP_AT_KEY) ?? 0;
	if (now - lastBackupAt < getAutoBackupIntervalMs()) {
		return;
	}

	const backup = await repository.exportWorkspaceBackup();
	const signature = computeBackupSignature(backup);
	const lastSignature = readLocalStorageString(LAST_BACKUP_SIGNATURE_KEY);

	if (lastSignature && lastSignature === signature) {
		return;
	}

	const filename = buildTimestampedFilename(new Date());
	const json = JSON.stringify(backup, null, 2);
	const createdAt = new Date().toISOString();

	if (await isAndroidNative()) {
		await persistAndroidBackup(filename, json);
	} else if (typeof indexedDB !== "undefined") {
		await persistWebAutoBackup(filename, json, createdAt);
	} else {
		return;
	}

	writeLocalStorage(LAST_BACKUP_AT_KEY, String(now));
	writeLocalStorage(LAST_BACKUP_SIGNATURE_KEY, signature);
}

/** @deprecated Use runAutoBackupIfNeeded */
export async function runAndroidAutoBackupIfNeeded(repository: StoryEngineRepository) {
	return runAutoBackupIfNeeded(repository);
}
