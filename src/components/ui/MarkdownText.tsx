import DOMPurify from "dompurify";
import { marked } from "marked";

interface MarkdownTextProps {
  text: string;
  className?: string;
}

export function MarkdownText({ text, className }: MarkdownTextProps) {
  const html = DOMPurify.sanitize(marked.parse(text.trim()) as string, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "del", "ul", "ol", "li", "pre", "code", "blockquote", "h1", "h2", "h3", "h4", "hr", "table", "thead", "tbody", "tr", "th", "td", "a"],
    ALLOWED_ATTR: ["href", "title"],
  });
  return (
    <div
      className={`markdown-prose${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
