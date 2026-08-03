export const AUTO_BACKUP_INTERVAL_OPTIONS_HOURS = [3, 6, 9, 12] as const;

export type AutoBackupIntervalHours = (typeof AUTO_BACKUP_INTERVAL_OPTIONS_HOURS)[number];

const LAST_BACKUP_AT_KEY = "story-engine:backup:lastBackupAt";
const INTERVAL_HOURS_KEY = "story-engine:backup:intervalHours";
const DEFAULT_INTERVAL_HOURS: AutoBackupIntervalHours = 12;

export function readAutoBackupLastRunAt(): number | null {
	try {
		const raw = localStorage.getItem(LAST_BACKUP_AT_KEY);
		if (!raw) {
			return null;
		}
		const value = Number(raw);
		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

export function readAutoBackupIntervalHours(): AutoBackupIntervalHours {
	try {
		const raw = localStorage.getItem(INTERVAL_HOURS_KEY);
		const value = Number(raw);
		if (AUTO_BACKUP_INTERVAL_OPTIONS_HOURS.includes(value as AutoBackupIntervalHours)) {
			return value as AutoBackupIntervalHours;
		}
	} catch {}
	return DEFAULT_INTERVAL_HOURS;
}

export function writeAutoBackupIntervalHours(hours: AutoBackupIntervalHours) {
	try {
		localStorage.setItem(INTERVAL_HOURS_KEY, String(hours));
	} catch {}
}

export function getAutoBackupIntervalMs(hours = readAutoBackupIntervalHours()): number {
	return hours * 60 * 60 * 1000;
}

export type AutoBackupScheduleState = {
	lastBackupAt: number | null;
	intervalHours: AutoBackupIntervalHours;
	nextBackupAt: number;
	remainingMs: number;
	isReady: boolean;
};

export function getAutoBackupScheduleState(now = Date.now()): AutoBackupScheduleState {
	const lastBackupAt = readAutoBackupLastRunAt();
	const intervalHours = readAutoBackupIntervalHours();
	const intervalMs = getAutoBackupIntervalMs(intervalHours);

	const nextBackupAt = lastBackupAt ? lastBackupAt + intervalMs : now;
	const remainingMs = Math.max(0, nextBackupAt - now);

	return {
		lastBackupAt,
		intervalHours,
		nextBackupAt,
		remainingMs,
		isReady: remainingMs === 0,
	};
}

export function formatAutoBackupCountdown(remainingMs: number): string {
	const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	}

	return `${minutes}m ${seconds}s`;
}

export function formatAutoBackupClockTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(new Date(timestamp));
}

export function formatNextAutoBackupLabel(state: AutoBackupScheduleState): string {
	if (!state.lastBackupAt) {
		return "Ready on next check when data has changed";
	}

	if (state.isReady) {
		return `Ready on next check — ${formatAutoBackupClockTime(state.nextBackupAt)}`;
	}

	return `${formatAutoBackupCountdown(state.remainingMs)} — ${formatAutoBackupClockTime(state.nextBackupAt)}`;
}
