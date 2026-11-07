import { Link } from "react-router-dom";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { downloadFile } from "../../lib/download";
import {
	TUTORIAL_DOCUMENT,
	type TutorialBlock,
	type TutorialSection,
} from "../../lib/tutorial/tutorialContent";
import {
	buildTutorialFilename,
	buildTutorialMarkdown,
	buildTutorialPdfArrayBuffer,
	buildTutorialPlainText,
} from "../../lib/tutorial/tutorialExport";

function TutorialSectionPanel({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Panel variant="flat">
			<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">{title}</div>
			<div className="mt-3 space-y-3 text-[13px] leading-6 text-ink-muted">{children}</div>
		</Panel>
	);
}

function TutorialLink({ to, children }: { to: string; children: React.ReactNode }) {
	return (
		<Link
			to={to}
			className="font-semibold text-ink-soft underline decoration-accent/40 underline-offset-2 hover:text-accent"
		>
			{children}
		</Link>
	);
}

function StepList({ items }: { items: string[] }) {
	return (
		<ol className="list-decimal space-y-2 pl-5 marker:text-accent-soft marker:font-semibold">
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ol>
	);
}

function BulletList({ items }: { items: string[] }) {
	return (
		<ul className="list-disc space-y-1.5 pl-5 marker:text-accent-soft">
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	);
}

function TaskbarItem({ label, description }: { label: string; description: string }) {
	return (
		<div className="rounded-[8px] border border-divider/[0.35] bg-panel-muted/40 px-3 py-2.5">
			<div className="text-[12px] font-semibold text-ink-soft">{label}</div>
			<div className="mt-1 text-[12px] leading-5 text-ink-muted">{description}</div>
		</div>
	);
}

function TutorialBlockView({ block }: { block: TutorialBlock }) {
	switch (block.type) {
		case "paragraph":
			return <p>{block.text}</p>;
		case "subheading":
			return (
				<p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
					{block.text}
				</p>
			);
		case "steps":
			return <StepList items={block.items} />;
		case "bullets":
			return <BulletList items={block.items} />;
		case "taskbar":
			return (
				<div className="grid gap-2 sm:grid-cols-2">
					{block.items.map((item) => (
						<TaskbarItem key={item.label} label={item.label} description={item.description} />
					))}
				</div>
			);
		case "links":
			return (
				<p>
					{block.items.map((link, index) => (
						<span key={link.to}>
							{index > 0 ? " · " : null}
							<TutorialLink to={link.to}>{link.label}</TutorialLink>
						</span>
					))}
				</p>
			);
		default:
			return null;
	}
}

function TutorialSectionView({ section }: { section: TutorialSection }) {
	return (
		<TutorialSectionPanel title={section.title}>
			{section.blocks.map((block, index) => (
				<TutorialBlockView key={`${section.title}-${index}`} block={block} />
			))}
		</TutorialSectionPanel>
	);
}

async function downloadTutorial(format: "md" | "txt" | "pdf") {
	const doc = TUTORIAL_DOCUMENT;
	const filename = buildTutorialFilename(format, doc.version);

	if (format === "md") {
		await downloadFile(filename, buildTutorialMarkdown(doc), "text/markdown;charset=utf-8");
		return;
	}

	if (format === "txt") {
		await downloadFile(filename, buildTutorialPlainText(doc), "text/plain;charset=utf-8");
		return;
	}

	const buffer = buildTutorialPdfArrayBuffer(doc);
	await downloadFile(filename, buffer, "application/pdf");
}

export function TutorialSettingsTab() {
	return (
		<div className="space-y-5">
			<Panel variant="flat">
				<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Tutorial</div>
				<p className="mt-3 text-[15px] font-semibold text-ink">{TUTORIAL_DOCUMENT.title}</p>
				{TUTORIAL_DOCUMENT.intro.map((paragraph) => (
					<p key={paragraph} className="mt-2 text-[13px] leading-6 text-ink-muted">
						{paragraph}
					</p>
				))}
			</Panel>

			{TUTORIAL_DOCUMENT.sections.map((section) => (
				<TutorialSectionView key={section.title} section={section} />
			))}

			<Panel variant="flat">
				<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
					Download tutorial
				</div>
				<p className="mt-2 text-[13px] leading-6 text-ink-muted">
					Save a copy of this guide for offline reading or sharing. Exports include all sections above.
				</p>
				<div className="mt-4 flex flex-wrap gap-2">
					<Button variant="secondary" onClick={() => void downloadTutorial("pdf")}>
						PDF
					</Button>
					<Button variant="secondary" onClick={() => void downloadTutorial("txt")}>
						TXT
					</Button>
					<Button variant="secondary" onClick={() => void downloadTutorial("md")}>
						Markdown
					</Button>
				</div>
			</Panel>
		</div>
	);
}
