import { describe, expect, it, vi } from "vitest";
import { applyOptionalValidatedRewrite } from "../validatedOptionalRewrite";

describe("applyOptionalValidatedRewrite", () => {
	it("validates the original before invoking an optional rewrite", async () => {
		const order: string[] = [];
		const outcome = await applyOptionalValidatedRewrite({
			initialText: "original",
			validate: async (text) => {
				order.push(`validate:${text}`);
				return { text: `${text}-valid` };
			},
			shouldRewrite: () => true,
			rewrite: async (text) => {
				order.push(`rewrite:${text}`);
				return "short";
			},
		});

		expect(order).toEqual([
			"validate:original",
			"rewrite:original-valid",
			"validate:short",
		]);
		expect(outcome).toMatchObject({
			result: { text: "short-valid" },
			attempted: true,
			applied: true,
		});
	});

	it("keeps a validated original when the provider blocks the optional rewrite", async () => {
		const blocked = new Error("PROHIBITED_CONTENT");
		const onFallback = vi.fn();
		const outcome = await applyOptionalValidatedRewrite({
			initialText: "explicit but valid scene",
			validate: async (text) => ({ text }),
			shouldRewrite: () => true,
			rewrite: async () => {
				throw blocked;
			},
			onFallback,
		});

		expect(outcome.result.text).toBe("explicit but valid scene");
		expect(outcome.applied).toBe(false);
		expect(outcome.fallbackError).toBe(blocked);
		expect(onFallback).toHaveBeenCalledWith(
			{ text: "explicit but valid scene" },
			blocked,
		);
	});

	it("keeps the original when the rewritten candidate fails validation", async () => {
		const outcome = await applyOptionalValidatedRewrite({
			initialText: "original",
			validate: async (text) => {
				if (text === "bad rewrite") throw new Error("invalid attribution");
				return { text };
			},
			shouldRewrite: () => true,
			rewrite: async () => "bad rewrite",
		});

		expect(outcome).toMatchObject({
			result: { text: "original" },
			attempted: true,
			applied: false,
		});
	});

	it("does not swallow cancellation", async () => {
		const controller = new AbortController();
		const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
		await expect(
			applyOptionalValidatedRewrite({
				initialText: "original",
				validate: async (text) => ({ text }),
				shouldRewrite: () => true,
				rewrite: async () => {
					controller.abort();
					throw abortError;
				},
				signal: controller.signal,
			}),
		).rejects.toBe(abortError);
	});
});
