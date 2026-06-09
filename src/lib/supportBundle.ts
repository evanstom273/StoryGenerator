import { strToU8, zipSync } from "fflate";
import { APP_VERSION } from "../app/versioning/version";
import type { StoryExportBundle } from "../types/models";
import { serializeStoryExport } from "./storyExport";

function sanitizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildTimestamp(now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export async function buildStorySupportBundleZip(
  bundle: StoryExportBundle,
): Promise<{ filename: string; content: BlobPart; mimeType: string }> {
  const now = new Date();
  const timestamp = buildTimestamp(now);
  const slug = sanitizeSlug(bundle.story.title) || "story-engine-story";

  const jsonExport = serializeStoryExport(bundle, "json").content;
  const jsonText = typeof jsonExport === "string" ? jsonExport : JSON.stringify(jsonExport);

  const archivePdf = serializeStoryExport(bundle, "archive_pdf").content;
  const archiveBytes =
    archivePdf instanceof Uint8Array ? archivePdf : new Uint8Array(archivePdf as ArrayBuffer);

  const diagnostics = {
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    storyId: bundle.story.id,
    storyTitle: bundle.story.title,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    platform: await (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        return Capacitor.getPlatform();
      } catch {
        return "web";
      }
    })(),
  };

  const files = {
    "story-export.json": strToU8(jsonText),
    "story-archive.pdf": archiveBytes,
    "diagnostics.json": strToU8(JSON.stringify(diagnostics, null, 2)),
  };

  const content = zipSync(files, { level: 6 });
  return {
    filename: `${slug}-support-bundle-${timestamp}.zip`,
    content: content as unknown as BlobPart,
    mimeType: "application/zip",
  };
}
