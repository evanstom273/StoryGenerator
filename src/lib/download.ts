async function blobToBase64(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("Unable to read export data."));
    };

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.readAsDataURL(blob);
  });
}

const ARCHIVE_PDF_DEBUG_URL = "http://127.0.0.1:7777/event";
const ARCHIVE_PDF_DEBUG_SESSION = "archive-pdf-no-op";

function reportArchivePdfDebug(args: {
  hypothesisId: string;
  location: string;
  msg: string;
  data?: Record<string, unknown>;
}) {
  // #region debug-point archive-pdf-no-op:report
  void fetch(ARCHIVE_PDF_DEBUG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: ARCHIVE_PDF_DEBUG_SESSION,
      runId: "pre-fix",
      hypothesisId: args.hypothesisId,
      location: args.location,
      msg: `[DEBUG] ${args.msg}`,
      data: args.data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

async function tryWebShareDownload(blob: Blob, filename: string) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  try {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
      return false;
    }

    await navigator.share({
      files: [file],
      title: filename,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/abort|cancel/i.test(message)) {
      return true;
    }
    return false;
  }
}

export async function downloadFile(
  filename: string,
  content: BlobPart | BlobPart[],
  mimeType: string,
) {
  const parts = Array.isArray(content) ? content : [content];
  const blob = new Blob(parts, { type: mimeType });

  const safeFilename = sanitizeFileName(filename);
  // #region debug-point archive-pdf-no-op:download-start
  reportArchivePdfDebug({
    hypothesisId: "D",
    location: "download.ts:downloadFile:start",
    msg: "download invoked",
    data: {
      safeFilename,
      mimeType,
      blobSize: blob.size,
    },
  });
  // #endregion

  const isNative = await (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  })();

  // #region debug-point archive-pdf-no-op:is-native
  reportArchivePdfDebug({
    hypothesisId: "D",
    location: "download.ts:downloadFile:isNative",
    msg: "native platform check complete",
    data: { isNative },
  });
  // #endregion

  if (!isNative) {
    const shared = await tryWebShareDownload(blob, safeFilename);
    if (shared) {
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = safeFilename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    // #region debug-point archive-pdf-no-op:web-download
    reportArchivePdfDebug({
      hypothesisId: "D",
      location: "download.ts:downloadFile:web",
      msg: "web download triggered",
      data: { safeFilename },
    });
    // #endregion
    return;
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);

  // #region debug-point archive-pdf-no-op:native-plugins
  reportArchivePdfDebug({
    hypothesisId: "D",
    location: "download.ts:downloadFile:native",
    msg: "native plugins loaded",
    data: { safeFilename },
  });
  // #endregion

  const base64 = await blobToBase64(blob);
  // #region debug-point archive-pdf-no-op:base64
  reportArchivePdfDebug({
    hypothesisId: "D",
    location: "download.ts:downloadFile:base64",
    msg: "blob converted to base64",
    data: { base64Length: base64.length },
  });
  // #endregion
  const exportPath = `exports/${safeFilename}`;
  const writeResult = await Filesystem.writeFile({
    path: exportPath,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  // #region debug-point archive-pdf-no-op:write-file
  reportArchivePdfDebug({
    hypothesisId: "D",
    location: "download.ts:downloadFile:writeFile",
    msg: "Filesystem.writeFile completed",
    data: {
      path: exportPath,
      directory: "Documents",
      uri: writeResult.uri ?? null,
    },
  });
  // #endregion

  const uri =
    writeResult.uri ??
    (
      await Filesystem.getUri({
        path: exportPath,
        directory: Directory.Documents,
      })
    ).uri;

  try {
    const canShare = await Share.canShare().catch(() => ({ value: true }));
    // #region debug-point archive-pdf-no-op:share-start
    reportArchivePdfDebug({
      hypothesisId: "D",
      location: "download.ts:downloadFile:share:start",
      msg: "Share.share starting",
      data: {
        uri,
        canShare: canShare.value,
      },
    });
    // #endregion
    if (!canShare.value) {
      throw new Error("Sharing is not available on this device.");
    }

    try {
      await Share.share({
        title: safeFilename,
        text: safeFilename,
        dialogTitle: safeFilename,
        files: [uri],
      });
    } catch (shareFilesError) {
      reportArchivePdfDebug({
        hypothesisId: "D",
        location: "download.ts:downloadFile:share:files-fallback",
        msg: "Share.share with files failed; retrying with url",
        data: {
          message:
            shareFilesError instanceof Error ? shareFilesError.message : String(shareFilesError),
        },
      });
      await Share.share({
        title: safeFilename,
        text: safeFilename,
        dialogTitle: safeFilename,
        url: uri,
      });
    }
    // #region debug-point archive-pdf-no-op:share-ok
    reportArchivePdfDebug({
      hypothesisId: "D",
      location: "download.ts:downloadFile:share:ok",
      msg: "Share.share resolved",
      data: { uri },
    });
    // #endregion
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // #region debug-point archive-pdf-no-op:share-error
    reportArchivePdfDebug({
      hypothesisId: "D",
      location: "download.ts:downloadFile:share:error",
      msg: "Share.share rejected",
      data: { message },
    });
    // #endregion
    if (!/cancel/i.test(message)) {
      throw error;
    }
  }
}
