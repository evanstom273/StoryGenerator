export const STORY_NAVIGATION_EVENT = "story-engine:navigate-to-message-number";

export type StoryNavigationDetail = {
  storyId: string;
  messageNumber: number;
};

export function navigateToStoryMessageNumber(storyId: string, messageNumber: number) {
  window.dispatchEvent(
    new CustomEvent<StoryNavigationDetail>(STORY_NAVIGATION_EVENT, {
      detail: { storyId, messageNumber },
    }),
  );
}

