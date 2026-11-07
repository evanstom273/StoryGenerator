import { describe, expect, it } from "vitest";
import {
  countActiveBackgroundTasks,
  formatEstimatedRemainingSeconds,
  getBackgroundTaskNavigationTarget,
  getBackgroundTaskRemainingLabel,
  getBackgroundTaskTypeLabel,
  isBackgroundTaskJob,
  moveQueuedBackgroundTaskInOrder,
  partitionBackgroundTasks,
  resolveMaxConcurrentBackgroundTasks,
  sortQueuedBackgroundTasks,
} from "../backgroundTasks";
import type { BackgroundJob } from "../../types/models";

function makeJob(
  partial: Partial<BackgroundJob> & Pick<BackgroundJob, "id" | "type" | "status">,
): BackgroundJob {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("backgroundTasks", () => {
  it("manages story indexing only", () => {
    expect(
      isBackgroundTaskJob(
        makeJob({ id: "index", type: "story_index", status: "queued" }),
      ),
    ).toBe(true);
    expect(
      isBackgroundTaskJob(
        makeJob({ id: "meta", type: "metachat_generate", status: "queued" }),
      ),
    ).toBe(false);
  });

  it("resolves max concurrent background tasks with default", () => {
    expect(resolveMaxConcurrentBackgroundTasks(undefined)).toBe(2);
    expect(resolveMaxConcurrentBackgroundTasks(4)).toBe(4);
    expect(resolveMaxConcurrentBackgroundTasks(9)).toBe(2);
  });

  it("labels indexing jobs by incremental mode", () => {
    expect(
      getBackgroundTaskTypeLabel(
        makeJob({
          id: "1",
          type: "story_index",
          status: "running",
          payload: { incremental: true },
        }),
      ),
    ).toBe("Update Index");
    expect(
      getBackgroundTaskTypeLabel(
        makeJob({
          id: "2",
          type: "story_index",
          status: "running",
          payload: { incremental: false },
        }),
      ),
    ).toBe("Full Re-index");
  });

  it("partitions only managed indexing tasks", () => {
    const jobs = [
      makeJob({ id: "running", type: "story_index", status: "running", storyId: "s1" }),
      makeJob({ id: "queued", type: "story_index", status: "queued", storyId: "s2" }),
      makeJob({ id: "done", type: "story_index", status: "complete", storyId: "s3" }),
      makeJob({ id: "meta", type: "metachat_generate", status: "running" }),
    ];

    const grouped = partitionBackgroundTasks(jobs);
    expect(grouped.running.map((job) => job.id)).toEqual(["running"]);
    expect(grouped.queued.map((job) => job.id)).toEqual(["queued"]);
    expect(grouped.completed.map((job) => job.id)).toEqual(["done"]);
    expect(countActiveBackgroundTasks(jobs)).toBe(2);
  });

  it("formats estimated remaining time", () => {
    expect(formatEstimatedRemainingSeconds(13)).toBe("~13s");
    expect(formatEstimatedRemainingSeconds(133)).toBe("~2m13s");
    expect(formatEstimatedRemainingSeconds(120)).toBe("~2m");
    expect(formatEstimatedRemainingSeconds(3661)).toBe("~1h1m");
  });

  it("routes indexing jobs back to their story", () => {
    expect(
      getBackgroundTaskNavigationTarget(
        makeJob({ id: "1", type: "story_index", status: "running", storyId: "abc" }),
      ),
    ).toBe("/stories/abc");
  });

  it("reorders queued indexing tasks", () => {
    const queued = [
      makeJob({ id: "a", type: "story_index", status: "queued", queueOrder: 1 }),
      makeJob({ id: "b", type: "story_index", status: "queued", queueOrder: 2 }),
      makeJob({ id: "c", type: "story_index", status: "queued", queueOrder: 3 }),
    ];

    const movedDown = moveQueuedBackgroundTaskInOrder(queued, "a", "down");
    expect(movedDown?.map((job) => job.id)).toEqual(["b", "a", "c"]);

    const movedUp = moveQueuedBackgroundTaskInOrder(movedDown ?? [], "c", "up");
    expect(movedUp?.map((job) => job.id)).toEqual(["b", "c", "a"]);

    expect(
      sortQueuedBackgroundTasks([
        makeJob({
          id: "late",
          type: "story_index",
          status: "queued",
          queueOrder: 5,
          createdAt: "2026-01-03T00:00:00.000Z",
        }),
        makeJob({
          id: "early",
          type: "story_index",
          status: "queued",
          queueOrder: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ]).map((job) => job.id),
    ).toEqual(["early", "late"]);
  });

  it("shows queued and running remaining labels", () => {
    expect(
      getBackgroundTaskRemainingLabel(
        makeJob({ id: "queued", type: "story_index", status: "queued" }),
      ),
    ).toBe("Queued");

    const running = makeJob({
      id: "running",
      type: "story_index",
      status: "running",
      startedAt: new Date(Date.now() - 30_000).toISOString(),
      progress: { current: 1, total: 4, label: "Indexing" },
    });
    expect(getBackgroundTaskRemainingLabel(running)).toMatch(/^~/);
  });
});
