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

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

export async function downloadFile(
  filename: string,
  content: BlobPart | BlobPart[],
  mimeType: string,
) {
  const parts = Array.isArray(content) ? content : [content];
  const blob = new Blob(parts, { type: mimeType });

  const safeFilename = sanitizeFileName(filename);

  const isNative = await (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  })();

  if (!isNative) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = safeFilename;
    anchor.click();

    URL.revokeObjectURL(url);
    return;
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);

  const base64 = await blobToBase64(blob);
  const writeResult = await Filesystem.writeFile({
    path: safeFilename,
    data: base64,
    directory: Directory.Cache,
  });

  const uri =
    writeResult.uri ??
    (
      await Filesystem.getUri({
        path: safeFilename,
        directory: Directory.Cache,
      })
    ).uri;

  try {
    await Share.share({
      title: safeFilename,
      dialogTitle: safeFilename,
      url: uri,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/cancel/i.test(message)) {
      throw error;
    }
  }
}
