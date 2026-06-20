export const META_CHAT_OPEN_STORAGE_KEY = "story-engine:open-metachat";

type JobNotificationArgs = {
  storyId?: string;
  title: string;
  body: string;
  openMetaChat?: boolean;
};

export async function sendJobCompletionNotification(args: JobNotificationArgs) {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return false;
  }

  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }

  if (permission !== "granted") {
    return false;
  }

  const notification = new Notification(args.title, {
    body: args.body,
    tag: args.storyId
      ? `story-engine-job:${args.storyId}:${args.openMetaChat ? "metachat" : "story"}`
      : undefined,
  });

  notification.onclick = () => {
    try {
      if (args.storyId && args.openMetaChat) {
        localStorage.setItem(META_CHAT_OPEN_STORAGE_KEY, args.storyId);
      }
      if (args.storyId) {
        window.focus();
        window.location.assign(`/stories/${args.storyId}`);
      }
    } catch {}
  };

  return true;
}
