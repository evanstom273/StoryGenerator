import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/Button";
import type { AIProviderType } from "../../types/models";
import type { AIQuotaSnapshot } from "../../lib/ai/quota";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";

function QuotaMetricList(props: { title: string; metrics: AIQuotaSnapshot["balanceMetrics"] }) {
	if (!props.metrics.length) {
		return null;
	}

	return (
		<div className="space-y-2">
			<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
				{props.title}
			</div>
			<div className="space-y-2">
				{props.metrics.map((metric) => (
					<div
						key={`${props.title}-${metric.label}`}
						className="rounded-[8px] border border-divider/[0.35] bg-panel-muted/40 px-3 py-2.5"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="text-xs text-ink-muted">{metric.label}</div>
							<div className="text-sm font-medium text-ink-soft">{metric.value}</div>
						</div>
						{metric.hint ? (
							<div className="mt-1 text-[11px] leading-5 text-ink-muted">{metric.hint}</div>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}

export function StoryAIQuotaPanel(props: {
	providerType: AIProviderType;
	model: string;
	enabled: boolean;
}) {
	const { getAIQuotaSnapshot } = useStoryEngine();
	const [snapshot, setSnapshot] = useState<AIQuotaSnapshot | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const loadSnapshot = useCallback(async () => {
		setIsLoading(true);
		try {
			const next = await getAIQuotaSnapshot({
				providerType: props.providerType,
				model: props.model,
			});
			setSnapshot(next);
		} catch (error) {
			setSnapshot({
				providerType: props.providerType,
				model: props.model,
				available: false,
				error: error instanceof Error ? error.message : "Unable to load quota details.",
				balanceMetrics: [],
				rateLimitMetrics: [],
				fetchedAt: new Date().toISOString(),
			});
		} finally {
			setIsLoading(false);
		}
	}, [getAIQuotaSnapshot, props.model, props.providerType]);

	useEffect(() => {
		if (!props.enabled) {
			return;
		}
		void loadSnapshot();
	}, [loadSnapshot, props.enabled]);

	if (!props.enabled) {
		return null;
	}

	return (
		<div className="space-y-3 rounded-[8px] border border-divider/[0.35] bg-panel-muted/20 px-3.5 py-3">
			<div className="flex items-center justify-between gap-3">
				<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
					Usage & limits
				</div>
				<Button type="button" variant="ghost" size="sm" disabled={isLoading} onClick={() => void loadSnapshot()}>
					{isLoading ? "Refreshing…" : "Refresh"}
				</Button>
			</div>

			{isLoading && !snapshot ? (
				<div className="text-sm text-ink-muted">Loading quota details…</div>
			) : null}

			{snapshot?.error ? (
				<div className="rounded-[8px] border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
					{snapshot.error}
				</div>
			) : null}

			{snapshot?.available ? (
				<div className="space-y-4">
					<QuotaMetricList title="Balance" metrics={snapshot.balanceMetrics} />
					<QuotaMetricList title="Rate limits" metrics={snapshot.rateLimitMetrics} />
					<div className="text-[11px] text-ink-muted">
						Updated {new Date(snapshot.fetchedAt).toLocaleString()}
					</div>
				</div>
			) : null}
		</div>
	);
}
