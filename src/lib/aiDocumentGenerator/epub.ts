import { strToU8, zipSync, type Zippable } from "fflate";

const EPUB_MIME_TYPE = "application/epub+zip";
const EPUB_ROOT = "OEBPS";

export interface NovelisationEpubChapter {
	title: string;
	markdown: string;
	filename: string;
}

export interface ParsedNovelisationDocument {
	title: string;
	introductionMarkdown: string;
	chapters: NovelisationEpubChapter[];
}

function escapeXml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string) {
	return escapeXml(value)
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function stripInlineMarkdown(value: string) {
	return value
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/_([^_]+)_/g, "$1")
		.replace(/\`([^\`]+)\`/g, "$1")
		.trim();
}

function renderInlineMarkdown(value: string) {
	let html = escapeXml(value);
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
		return `<a href="${escapeXmlAttribute(href)}">${label}</a>`;
	});
	html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
	html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
	html = html.replace(/_([^_\n]+)_/g, "<em>$1</em>");
	html = html.replace(/\`([^\`]+)\`/g, "<code>$1</code>");
	return html;
}

function renderMarkdownBody(markdown: string) {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const blocks: string[] = [];
	let paragraph: string[] = [];
	let unorderedList: string[] = [];
	let orderedList: string[] = [];

	const flushParagraph = () => {
		if (!paragraph.length) return;
		blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" ").trim())}</p>`);
		paragraph = [];
	};
	const flushUnorderedList = () => {
		if (!unorderedList.length) return;
		blocks.push(
			`<ul>${unorderedList
				.map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
				.join("")}</ul>`,
		);
		unorderedList = [];
	};
	const flushOrderedList = () => {
		if (!orderedList.length) return;
		blocks.push(
			`<ol>${orderedList
				.map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
				.join("")}</ol>`,
		);
		orderedList = [];
	};
	const flushAll = () => {
		flushParagraph();
		flushUnorderedList();
		flushOrderedList();
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) {
			flushAll();
			continue;
		}

		const heading = line.match(/^(#{3,6})\s+(.+)$/);
		if (heading) {
			flushAll();
			const level = Math.min(6, heading[1].length - 1);
			blocks.push(
				`<h${level}>${renderInlineMarkdown(heading[2].trim())}</h${level}>`,
			);
			continue;
		}

		if (/^([-*_])\1\1+$/.test(line)) {
			flushAll();
			blocks.push("<hr />");
			continue;
		}

		const unordered = line.match(/^[-*+]\s+(.+)$/);
		if (unordered) {
			flushParagraph();
			flushOrderedList();
			unorderedList.push(unordered[1]);
			continue;
		}

		const ordered = line.match(/^\d+[.)]\s+(.+)$/);
		if (ordered) {
			flushParagraph();
			flushUnorderedList();
			orderedList.push(ordered[1]);
			continue;
		}

		const quote = line.match(/^>\s?(.*)$/);
		if (quote) {
			flushAll();
			blocks.push(`<blockquote><p>${renderInlineMarkdown(quote[1])}</p></blockquote>`);
			continue;
		}

		flushUnorderedList();
		flushOrderedList();
		paragraph.push(line);
	}

	flushAll();
	return blocks.join("\n");
}

function sanitizeIdentifier(value: string) {
	return (
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64) || "story"
	);
}

function hashText(value: string) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function parseNovelisationMarkdown(markdown: string): ParsedNovelisationDocument {
	const normalized = markdown.replace(/\r\n?/g, "\n").trim();
	const lines = normalized.split("\n");
	let title = "StoryEngine Novelisation";
	let titleLineIndex = -1;

	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index].match(/^#\s+(.+)$/);
		if (match) {
			title = stripInlineMarkdown(match[1]) || title;
			titleLineIndex = index;
			break;
		}
	}

	const chapters: NovelisationEpubChapter[] = [];
	const introductionLines: string[] = [];
	let currentTitle: string | null = null;
	let currentLines: string[] = [];

	const pushChapter = () => {
		if (!currentTitle) return;
		const chapterNumber = chapters.length + 1;
		chapters.push({
			title: stripInlineMarkdown(currentTitle),
			markdown: currentLines.join("\n").trim(),
			filename: `chapter-${String(chapterNumber).padStart(3, "0")}.xhtml`,
		});
		currentTitle = null;
		currentLines = [];
	};

	for (let index = 0; index < lines.length; index += 1) {
		if (index === titleLineIndex) {
			continue;
		}

		const chapterHeading = lines[index].match(/^##\s+(.+)$/);
		if (chapterHeading) {
			pushChapter();
			currentTitle = chapterHeading[1].trim();
			continue;
		}

		if (currentTitle) {
			currentLines.push(lines[index]);
		} else {
			introductionLines.push(lines[index]);
		}
	}

	pushChapter();

	if (!chapters.length) {
		const fallbackBody = introductionLines.join("\n").trim();
		chapters.push({
			title: "Chapter I",
			markdown: fallbackBody,
			filename: "chapter-001.xhtml",
		});
		return {
			title,
			introductionMarkdown: "",
			chapters,
		};
	}

	return {
		title,
		introductionMarkdown: introductionLines.join("\n").trim(),
		chapters,
	};
}

function xhtmlDocument(title: string, body: string) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head>
	<meta charset="utf-8" />
	<title>${escapeXml(title)}</title>
	<link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
${body}
</body>
</html>`;
}

function buildTitlePage(document: ParsedNovelisationDocument) {
	const introduction = document.introductionMarkdown
		? `<div class="introduction">${renderMarkdownBody(document.introductionMarkdown)}</div>`
		: "";
	return xhtmlDocument(
		document.title,
		`<section epub:type="titlepage" class="title-page">
	<div class="book-title">${escapeXml(document.title)}</div>
	${introduction}
</section>`,
	);
}

function buildChapterPage(chapter: NovelisationEpubChapter) {
	return xhtmlDocument(
		chapter.title,
		`<section epub:type="chapter">
	<h1>${escapeXml(chapter.title)}</h1>
	${renderMarkdownBody(chapter.markdown)}
</section>`,
	);
}

function buildNav(document: ParsedNovelisationDocument) {
	const items = document.chapters
		.map(
			(chapter) =>
				`<li><a href="${escapeXmlAttribute(chapter.filename)}">${escapeXml(chapter.title)}</a></li>`,
		)
		.join("\n");
	return xhtmlDocument(
		"Contents",
		`<nav epub:type="toc" id="toc">
	<h1>Contents</h1>
	<ol>
		${items}
	</ol>
</nav>`,
	);
}

function buildNcx(document: ParsedNovelisationDocument, identifier: string) {
	const navPoints = document.chapters
		.map(
			(chapter, index) => `<navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
	<navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
	<content src="${escapeXmlAttribute(chapter.filename)}" />
</navPoint>`,
		)
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
	<meta name="dtb:uid" content="${escapeXmlAttribute(identifier)}" />
	<meta name="dtb:depth" content="1" />
	<meta name="dtb:totalPageCount" content="0" />
	<meta name="dtb:maxPageNumber" content="0" />
</head>
<docTitle><text>${escapeXml(document.title)}</text></docTitle>
<navMap>
${navPoints}
</navMap>
</ncx>`;
}

function buildPackageDocument(
	document: ParsedNovelisationDocument,
	identifier: string,
	modifiedAt: string,
) {
	const chapterManifest = document.chapters
		.map(
			(chapter, index) =>
				`<item id="chapter-${index + 1}" href="${escapeXmlAttribute(chapter.filename)}" media-type="application/xhtml+xml" />`,
		)
		.join("\n");
	const chapterSpine = document.chapters
		.map((_chapter, index) => `<itemref idref="chapter-${index + 1}" />`)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
	<dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
	<dc:title>${escapeXml(document.title)}</dc:title>
	<dc:language>en</dc:language>
	<meta property="dcterms:modified">${escapeXml(modifiedAt)}</meta>
</metadata>
<manifest>
	<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
	<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
	<item id="styles" href="styles.css" media-type="text/css" />
	<item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml" />
	${chapterManifest}
</manifest>
<spine toc="ncx">
	<itemref idref="titlepage" />
	${chapterSpine}
</spine>
</package>`;
}

const EPUB_STYLES = `body {
	font-family: serif;
	line-height: 1.55;
	margin: 5%;
}
.title-page {
	min-height: 80vh;
	display: flex;
	flex-direction: column;
	justify-content: center;
	text-align: center;
}
.book-title {
	font-size: 2.2em;
	font-weight: 700;
	margin-bottom: 2em;
}
.introduction {
	text-align: left;
}
h1 {
	font-size: 1.8em;
	margin: 0 0 1.5em;
	page-break-before: always;
	break-before: page;
}
h2, h3, h4, h5, h6 {
	margin-top: 1.5em;
}
p {
	margin: 0 0 1em;
	text-indent: 1.2em;
}
h1 + p,
h2 + p,
h3 + p,
blockquote p,
li p {
	text-indent: 0;
}
blockquote {
	margin: 1em 2em;
}
nav ol {
	padding-left: 1.5em;
}
nav li {
	margin: 0.6em 0;
}
a {
	color: inherit;
	text-decoration: none;
}
`;

export function serializeNovelisationEpub(markdown: string): Uint8Array {
	const document = parseNovelisationMarkdown(markdown);
	const identifier = `urn:storyengine:novelisation:${sanitizeIdentifier(document.title)}:${hashText(markdown)}`;
	const modifiedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

	const files: Zippable = {};
	// EPUB requires this to be the first ZIP entry and stored without compression.
	files.mimetype = [strToU8(EPUB_MIME_TYPE), { level: 0 }];
	files["META-INF/container.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
	<rootfiles>
		<rootfile full-path="${EPUB_ROOT}/content.opf" media-type="application/oebps-package+xml" />
	</rootfiles>
</container>`);
	files[`${EPUB_ROOT}/content.opf`] = strToU8(
		buildPackageDocument(document, identifier, modifiedAt),
	);
	files[`${EPUB_ROOT}/nav.xhtml`] = strToU8(buildNav(document));
	files[`${EPUB_ROOT}/toc.ncx`] = strToU8(buildNcx(document, identifier));
	files[`${EPUB_ROOT}/styles.css`] = strToU8(EPUB_STYLES);
	files[`${EPUB_ROOT}/title.xhtml`] = strToU8(buildTitlePage(document));

	for (const chapter of document.chapters) {
		files[`${EPUB_ROOT}/${chapter.filename}`] = strToU8(buildChapterPage(chapter));
	}

	return zipSync(files, { level: 6 });
}

export { EPUB_MIME_TYPE };
