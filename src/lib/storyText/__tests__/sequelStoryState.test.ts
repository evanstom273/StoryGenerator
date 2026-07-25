import { describe, expect, it } from "vitest";
import { createSequelStoryStateData } from "../../storyStateV2";
import type { StoryStateData } from "../../../types/models";

describe("createSequelStoryStateData", () => {
  it("preserves durable canon and clears transient scene-only state", () => {
    const sourceState: StoryStateData = {
      updatedAt: "2026-07-25T00:00:00.000Z",
      characters: {
        James: {
          displayName: "James",
          status: "Still at Richmond.",
        },
      },
      worldFacts: ["Richmond won the FA Cup."],
      unresolvedThreads: ["James still has to decide his future."],
      sceneState: ["James is standing in the tunnel."],
      significantMemories: ["James rejected Tottenham."],
      relationshipState: ["James and Ted trust each other again."],
      summaries: {
        currentSituation: "The season has ended with Richmond on top.",
        recentDevelopments: ["The club lifted the cup."],
      },
      scene: {
        currentLocation: "Wembley tunnel",
        sceneSummary: "The players are still processing the win.",
      },
      threads: {
        openThreads: ["What comes next for James?"],
      },
      rpStats: {
        hp: 7,
        gold: 120,
        npcHp: {},
        changelog: [],
        pendingTransaction: {
          description: "Unfinished tab",
          amount: -4,
        },
        pendingConditionSuggestion: "Exhausted",
      },
    };

    const sequelState = createSequelStoryStateData({
      sourceState,
      sourceSummary: "This story is a direct sequel.",
      now: "2026-07-26T00:00:00.000Z",
    });

    expect(sequelState.updatedAt).toBe("2026-07-26T00:00:00.000Z");
    expect(sequelState.worldFacts).toEqual(["Richmond won the FA Cup."]);
    expect(sequelState.unresolvedThreads).toEqual(["James still has to decide his future."]);
    expect(sequelState.relationshipState).toEqual(["James and Ted trust each other again."]);
    expect(sequelState.significantMemories).toEqual(["James rejected Tottenham."]);
    expect(sequelState.sceneState).toBeUndefined();
    expect(sequelState.scene).toBeUndefined();
    expect(sequelState.summaries?.currentSituation).toBe(
      "The season has ended with Richmond on top.",
    );
    expect(sequelState.rpStats?.pendingTransaction).toBeUndefined();
    expect(sequelState.rpStats?.pendingConditionSuggestion).toBeUndefined();
  });
});
