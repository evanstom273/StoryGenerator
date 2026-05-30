function ensureUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error("Enter a valid URL to import from.");
  }
}

export async function fetchHtml(sourceUrl: string) {
  const url = ensureUrl(sourceUrl.trim());

  const response = await fetch(
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url.toString())}`,
  );

  if (!response.ok) {
    throw new Error(`Import failed while fetching the wiki page (${response.status}).`);
  }

  const html = await response.text();

  if (!html.trim()) {
    throw new Error("Import failed because the wiki page returned empty content.");
  }

  return html;
}

