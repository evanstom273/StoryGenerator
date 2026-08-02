import {
	deleteFromStore,
	getAllFromStore,
	putInStore,
	type StoreName,
} from "./idb";

export interface AutoBackupRecord {
	id: string;
	createdAt: string;
	json: string;
}

const AUTO_BACKUPS_STORE = "autoBackups" as StoreName;

export async function saveAutoBackupRecord(record: AutoBackupRecord) {
	await putInStore(AUTO_BACKUPS_STORE, record);
}

export async function listAutoBackupRecords(): Promise<AutoBackupRecord[]> {
	const records = await getAllFromStore<AutoBackupRecord>(AUTO_BACKUPS_STORE);
	return records.sort((left, right) => right.id.localeCompare(left.id));
}

export async function pruneAutoBackupRecords(keepLatest: number) {
	const records = await listAutoBackupRecords();
	const toDelete = records.slice(keepLatest);
	await Promise.all(toDelete.map((record) => deleteFromStore(AUTO_BACKUPS_STORE, record.id)));
}

export function readAutoBackupLastRunAt(): number | null {
	try {
		const raw = localStorage.getItem("story-engine:backup:lastBackupAt");
		if (!raw) {
			return null;
		}
		const value = Number(raw);
		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}
