import { fetchHtml } from "./fetchHtml";
import { htmlToText } from "./htmlToText";

export async function importUniverseLore(sourceUrl: string) {
  const html = await fetchHtml(sourceUrl);
  const result = htmlToText(html);

  if (!result.importedText.trim()) {
    throw new Error("Import failed because no readable text could be extracted.");
  }

  return result;
}

