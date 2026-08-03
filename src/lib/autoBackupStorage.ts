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

export const AUTO_BACKUP_KEEP_LATEST = 5;
