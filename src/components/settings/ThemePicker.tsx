import type { CSSProperties } from "react";
import { Button } from "../ui/Button";
import { TextInput } from "../forms/Fields";
import { cn } from "../../utils/cn";
import {
	buildThemeCssVariables,
	getAccentContrastHint,
} from "../../app/theming/ThemeContext";
import {
	CUSTOM_ACCENT_SWATCHES,
	THEME_GROUP_LABELS,
	THEME_GROUP_ORDER,
	type AccentThemeKey,
	type ThemeDefinition,
	type ThemeGroup,
	type ThemeKey,
	listThemesGrouped,
	themes,
} from "../../app/theming/themes";

type ThemePickerProps = {
	selectedKey: ThemeKey;
	customAccent: string;
	onSelectKey: (key: ThemeKey) => void;
	onCustomAccentChange: (value: string) => void;
	accentOnly?: boolean;
	allowAppDefault?: boolean;
	appDefaultSelected?: boolean;
	onSelectAppDefault?: () => void;
};

function ThemePreviewTile({
	keyId,
	themeDef,
	selected,
	customAccent,
	onSelect,
}: {
	keyId: ThemeKey;
	themeDef: ThemeDefinition;
	selected: boolean;
	customAccent: string;
	onSelect: () => void;
}) {
	const previewStyle = buildThemeCssVariables({
		themeKey: keyId,
		customAccent,
	}) as CSSProperties;

	return (
		<button
			type="button"
			style={previewStyle}
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"flex flex-col gap-2 rounded-[9px] border p-3 text-left transition",
				selected
					? "border-accent/40 bg-panel"
					: "border-divider/[0.4] bg-panel-muted hover:border-accent/20 hover:bg-panel",
			)}
		>
			<div className="flex items-center gap-2">
				<span className="h-6 w-6 shrink-0 rounded-full bg-accent ring-2 ring-accent/20" />
				<span className="min-w-0 text-[10px] font-semibold leading-tight text-ink">{themeDef.name}</span>
			</div>
			<div className="space-y-1.5">
				<div className="rounded-[6px] border border-accent/30 bg-accent/15 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-accent-soft">
					Button
				</div>
				<div className="text-[10px] text-ink-muted leading-snug">{themeDef.description}</div>
			</div>
			{selected ? (
				<span className="text-[8px] font-bold uppercase tracking-[0.12em] text-accent-soft">Active</span>
			) : null}
		</button>
	);
}

function CustomAccentEditor({
	customAccent,
	onCustomAccentChange,
}: {
	customAccent: string;
	onCustomAccentChange: (value: string) => void;
}) {
	const contrastHint = getAccentContrastHint(customAccent);
	const contrastLabel =
		contrastHint === "good"
			? "Accent reads clearly on dark UI"
			: contrastHint === "fair"
				? "Accent may be faint on some controls"
				: "Accent may be hard to see on buttons";

	return (
		<div className="space-y-3 border-t border-divider/[0.3] pt-4">
			<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Custom accent</div>
			<div className="flex flex-wrap gap-2">
				{CUSTOM_ACCENT_SWATCHES.map((swatch) => (
					<button
						key={swatch}
						type="button"
						aria-label={`Use ${swatch}`}
						onClick={() => onCustomAccentChange(swatch)}
						className={cn(
							"h-8 w-8 rounded-full border-2 transition",
							customAccent.toUpperCase() === swatch.toUpperCase()
								? "border-accent scale-110"
								: "border-divider/60 hover:border-accent/40",
						)}
						style={{ backgroundColor: swatch }}
					/>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<TextInput
					value={customAccent}
					onChange={(event) => onCustomAccentChange(event.target.value)}
					placeholder="#7C3AED"
				/>
				<input
					type="color"
					value={customAccent}
					onChange={(event) => onCustomAccentChange(event.target.value)}
					className="h-9 w-9 cursor-pointer rounded-[8px] border border-divider bg-panel-muted p-1"
					aria-label="Pick custom accent"
				/>
				<Button
					variant="secondary"
					onClick={() => onCustomAccentChange(themes.custom.accent)}
				>
					Reset
				</Button>
			</div>
			<div className="rounded-[8px] border border-divider/[0.35] bg-panel-muted/40 px-3 py-2.5">
				<div
					className="rounded-[6px] border border-accent/30 bg-accent/15 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft"
				>
					Preview button
				</div>
				<div
					className={cn(
						"mt-2 text-[11px]",
						contrastHint === "good" ? "text-emerald-300" : contrastHint === "fair" ? "text-amber-200" : "text-rose-300",
					)}
				>
					{contrastLabel}
				</div>
			</div>
			<div className="text-[11px] text-ink-muted">Enter a hex colour (#RRGGBB). Invalid values won&apos;t apply.</div>
		</div>
	);
}

export function ThemePicker({
	selectedKey,
	customAccent,
	onSelectKey,
	onCustomAccentChange,
	accentOnly = false,
	allowAppDefault = false,
	appDefaultSelected = false,
	onSelectAppDefault,
}: ThemePickerProps) {
	const grouped = listThemesGrouped({ accentOnly });

	return (
		<div className="space-y-5">
			{allowAppDefault ? (
				<div className="space-y-2">
					<button
						type="button"
						onClick={onSelectAppDefault}
						className={cn(
							"w-full rounded-[9px] border px-3 py-3 text-left transition",
							appDefaultSelected
								? "border-accent/40 bg-accent/10"
								: "border-divider/[0.4] bg-panel-muted hover:border-accent/20 hover:bg-panel",
						)}
					>
						<div className="text-[12px] font-semibold text-ink-soft">Use app default</div>
						<div className="mt-1 text-[11px] text-ink-muted">
							Follow the accent chosen in Settings → Theme for this device.
						</div>
					</button>
				</div>
			) : null}

			{THEME_GROUP_ORDER.map((group: ThemeGroup) => {
				const entries = grouped[group];
				if (!entries.length) {
					return null;
				}

				return (
					<div key={group} className="space-y-3">
						<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
							{THEME_GROUP_LABELS[group]}
						</div>
						<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
							{entries.map(([keyId, themeDef]) => {
								if (group === "custom") {
									return null;
								}

								const selected = !appDefaultSelected && selectedKey === keyId;
								return (
									<ThemePreviewTile
										key={keyId}
										keyId={keyId}
										themeDef={themeDef}
										selected={selected}
										customAccent={customAccent}
										onSelect={() => onSelectKey(keyId)}
									/>
								);
							})}
						</div>
						{group === "custom" ? (
							<div className="space-y-3">
								<ThemePreviewTile
									keyId="custom"
									themeDef={themes.custom}
									selected={!appDefaultSelected && selectedKey === "custom"}
									customAccent={customAccent}
									onSelect={() => onSelectKey("custom")}
								/>
								{!appDefaultSelected && selectedKey === "custom" ? (
									<CustomAccentEditor
										customAccent={customAccent}
										onCustomAccentChange={onCustomAccentChange}
									/>
								) : null}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

export type { AccentThemeKey };
