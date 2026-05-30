export function downloadFile(
  filename: string,
  content: BlobPart | BlobPart[],
  mimeType: string,
) {
  const parts = Array.isArray(content) ? content : [content];
  const blob = new Blob(parts, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}
