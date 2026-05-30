function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeAll(document: Document, selector: string) {
  document.querySelectorAll(selector).forEach((node) => node.remove());
}

export function htmlToText(html: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  removeAll(
    document,
    [
      "script",
      "style",
      "nav",
      "header",
      "footer",
      "aside",
      "noscript",
      "iframe",
      "svg",
      "form",
      "button",
    ].join(","),
  );

  removeAll(document, '[role="navigation"]');
  removeAll(document, '[aria-label*="navigation" i]');

  const title = normalizeWhitespace(document.title || "Imported wiki page");
  const bodyText = normalizeWhitespace(document.body?.innerText || "");

  return { title, importedText: bodyText };
}

