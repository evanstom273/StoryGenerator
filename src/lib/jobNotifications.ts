type JobNotificationArgs = {
  storyId?: string;
  title: string;
  body: string;
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

  const tag = args.storyId
    ? `story-engine-job:${args.storyId}:story`
    : undefined;

  const swReg = navigator.serviceWorker?.ready ?? null;

  try {
    if (swReg) {
      const reg = await swReg;
      await reg.showNotification(args.title, { body: args.body, tag });
    } else {
      const notification = new Notification(args.title, { body: args.body, tag });
      notification.onclick = () => {
        try {
          if (args.storyId) {
            window.focus();
            window.location.assign(
              `/stories/${args.storyId}`,
            );
          }
        } catch {}
      };
    }
  } catch {
    return false;
  }

  return true;
}
