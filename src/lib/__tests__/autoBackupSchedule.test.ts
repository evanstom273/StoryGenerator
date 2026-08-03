import { describe, expect, it } from "vitest";
import {
	formatAutoBackupCountdown,
	formatNextAutoBackupLabel,
	getAutoBackupScheduleState,
} from "../autoBackupSchedule";

describe("autoBackupSchedule", () => {
	it("formats countdown with minutes and seconds", () => {
		expect(formatAutoBackupCountdown(59 * 60 * 1000 + 59 * 1000)).toBe("59m 59s");
	});

	it("formats countdown with hours when needed", () => {
		expect(formatAutoBackupCountdown(2 * 60 * 60 * 1000 + 5 * 60 * 1000 + 7 * 1000)).toBe(
			"2h 5m 7s",
		);
	});

	it("labels the next backup with countdown and clock time", () => {
		const nextBackupAt = Date.UTC(2026, 7, 3, 12, 0, 0);
		const label = formatNextAutoBackupLabel({
			lastBackupAt: nextBackupAt - 12 * 60 * 60 * 1000,
			intervalHours: 12,
			nextBackupAt,
			remainingMs: 59 * 60 * 1000 + 59 * 1000,
			isReady: false,
		});

		expect(label).toMatch(/^59m 59s — /);
	});

	it("reports ready state when the interval has elapsed", () => {
		const now = Date.UTC(2026, 7, 3, 12, 0, 0);
		const state = getAutoBackupScheduleState(now);

		expect(state.isReady).toBe(true);
		expect(formatNextAutoBackupLabel(state)).toContain("Ready on next check");
	});
});
