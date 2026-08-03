import type { AIProviderType } from "../../types/models";

export interface AIQuotaMetric {
	label: string;
	value: string;
	hint?: string;
}

export interface AIQuotaSnapshot {
	providerType: AIProviderType;
	model: string;
	available: boolean;
	error?: string;
	balanceMetrics: AIQuotaMetric[];
	rateLimitMetrics: AIQuotaMetric[];
	fetchedAt: string;
}

interface OpenRouterKeyResponse {
	data?: {
		label?: string;
		limit?: number | null;
		limit_remaining?: number | null;
		limit_reset?: string | null;
		usage?: number;
		usage_daily?: number;
		usage_weekly?: number;
		usage_monthly?: number;
		is_free_tier?: boolean;
		per_request_limits?: Record<string, unknown> | null;
	};
}

interface OpenRouterCreditsResponse {
	data?: {
		total_credits?: number;
		total_usage?: number;
	};
}

interface OpenRouterModelResponse {
	data?: {
		id?: string;
		context_length?: number;
		per_request_limits?: Record<string, unknown> | null;
		top_provider?: {
			max_completion_tokens?: number;
			context_length?: number;
		};
	};
}

function formatUsd(value: number | null | undefined) {
	if (value == null || !Number.isFinite(value)) {
		return "—";
	}
	return `$${value.toFixed(2)}`;
}

function formatCount(value: number | null | undefined) {
	if (value == null || !Number.isFinite(value)) {
		return "—";
	}
	return String(Math.trunc(value));
}

async function openRouterFetch<T>(apiKey: string, path: string): Promise<T> {
	const safeKey = apiKey.replace(/[^\x00-\xFF]/g, "");
	const response = await fetch(`https://openrouter.ai/api/v1${path}`, {
		headers: {
			Authorization: `Bearer ${safeKey}`,
		},
	});

	if (!response.ok) {
		const message = await response.text();
		throw new Error(message.trim() || `OpenRouter request failed (${response.status}).`);
	}

	return (await response.json()) as T;
}

function buildModelPath(model: string) {
	const segments = model.split("/").map((segment) => encodeURIComponent(segment));
	return `/models/${segments.join("/")}`;
}

function parsePerRequestLimits(limits: Record<string, unknown> | null | undefined) {
	if (!limits || typeof limits !== "object") {
		return [];
	}

	const metrics: AIQuotaMetric[] = [];
	for (const [key, rawValue] of Object.entries(limits)) {
		if (rawValue == null) {
			continue;
		}
		const label = key
			.replace(/_/g, " ")
			.replace(/\b\w/g, (char) => char.toUpperCase());
		metrics.push({
			label,
			value: typeof rawValue === "number" ? formatCount(rawValue) : String(rawValue),
		});
	}
	return metrics;
}

export async function fetchOpenRouterQuota(apiKey: string, model: string): Promise<AIQuotaSnapshot> {
	const fetchedAt = new Date().toISOString();
	const balanceMetrics: AIQuotaMetric[] = [];
	const rateLimitMetrics: AIQuotaMetric[] = [];

	const keyPayload = await openRouterFetch<OpenRouterKeyResponse>(apiKey, "/key");
	const keyData = keyPayload.data;

	if (keyData?.limit_remaining != null) {
		balanceMetrics.push({
			label: "Key credit remaining",
			value: formatUsd(keyData.limit_remaining),
			hint: "Spending cap left on this API key, if a cap is set.",
		});
	}

	if (keyData?.limit != null) {
		balanceMetrics.push({
			label: "Key spending cap",
			value: formatUsd(keyData.limit),
			hint: keyData.limit_reset ? `Resets: ${keyData.limit_reset}` : undefined,
		});
	}

	balanceMetrics.push({
		label: "Usage today",
		value: formatUsd(keyData?.usage_daily),
	});
	balanceMetrics.push({
		label: "Usage this month",
		value: formatUsd(keyData?.usage_monthly),
	});

	try {
		const creditsPayload = await openRouterFetch<OpenRouterCreditsResponse>(apiKey, "/credits");
		const totalCredits = creditsPayload.data?.total_credits;
		const totalUsage = creditsPayload.data?.total_usage;
		if (
			totalCredits != null &&
			totalUsage != null &&
			Number.isFinite(totalCredits) &&
			Number.isFinite(totalUsage)
		) {
			balanceMetrics.unshift({
				label: "Account balance remaining",
				value: formatUsd(totalCredits - totalUsage),
				hint: "Purchased credits minus account usage (USD).",
			});
		}
	} catch {
		// Credits endpoint may require a management key; key stats still help.
	}

	let modelLimits = parsePerRequestLimits(keyData?.per_request_limits);
	try {
		const modelPayload = await openRouterFetch<OpenRouterModelResponse>(apiKey, buildModelPath(model));
		const modelData = modelPayload.data;
		if (modelData?.context_length) {
			rateLimitMetrics.push({
				label: "Context window",
				value: `${formatCount(modelData.context_length)} tokens`,
			});
		}
		if (modelData?.top_provider?.max_completion_tokens) {
			rateLimitMetrics.push({
				label: "Max completion",
				value: `${formatCount(modelData.top_provider.max_completion_tokens)} tokens`,
			});
		}
		const modelPerRequest = parsePerRequestLimits(modelData?.per_request_limits);
		if (modelPerRequest.length) {
			modelLimits = modelPerRequest;
		}
	} catch {
		// Model metadata is optional for the panel.
	}

	if (modelLimits.length) {
		rateLimitMetrics.push(...modelLimits);
	}

	const isFreeVariant = model.includes(":free");
	if (isFreeVariant) {
		const dailyCap = keyData?.is_free_tier ? 50 : 1000;
		rateLimitMetrics.unshift(
			{
				label: "Free model RPM",
				value: "20",
				hint: "OpenRouter platform limit for :free variants.",
			},
			{
				label: "Free model RPD",
				value: formatCount(dailyCap),
				hint: keyData?.is_free_tier
					? "50/day until you have purchased credits."
					: "1,000/day after purchasing credits.",
			},
		);
	}

	return {
		providerType: "openrouter",
		model,
		available: true,
		balanceMetrics,
		rateLimitMetrics,
		fetchedAt,
	};
}

export async function fetchAIQuotaSnapshot(
	providerType: AIProviderType,
	model: string,
	apiKey: string,
): Promise<AIQuotaSnapshot> {
	const fetchedAt = new Date().toISOString();

	if (!apiKey.trim()) {
		return {
			providerType,
			model,
			available: false,
			error: "Add an API key for this provider in Settings → AI.",
			balanceMetrics: [],
			rateLimitMetrics: [],
			fetchedAt,
		};
	}

	if (providerType === "openrouter") {
		try {
			return await fetchOpenRouterQuota(apiKey, model);
		} catch (error) {
			return {
				providerType,
				model,
				available: false,
				error: error instanceof Error ? error.message : "Unable to load OpenRouter quota.",
				balanceMetrics: [],
				rateLimitMetrics: [],
				fetchedAt,
			};
		}
	}

	return {
		providerType,
		model,
		available: false,
		error: "Credit and rate-limit details are currently available for OpenRouter only. Check your provider dashboard for other keys.",
		balanceMetrics: [],
		rateLimitMetrics: [],
		fetchedAt,
	};
}
