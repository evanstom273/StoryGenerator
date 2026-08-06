import { cn } from "../utils/cn";

export function BrandLogo({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"relative flex items-center justify-center overflow-hidden rounded-2xl border border-divider bg-gradient-to-br from-accent/26 via-accent-secondary/10 to-white/6 shadow-[0_18px_40px_rgb(var(--accent-rgb)/0.16)] ring-1 ring-accent/12",
				className,
			)}
		>
			<svg aria-hidden="true" viewBox="0 0 48 48" className="h-[62%] w-[62%] text-white" fill="none">
				<circle cx="24" cy="24" r="4.5" fill="currentColor" />
				<path
					d="M8 24c4.2-5.4 9.9-8 16-8s11.8 2.6 16 8c-4.2 5.4-9.9 8-16 8S12.2 29.4 8 24Z"
					stroke="currentColor"
					strokeOpacity="0.92"
					strokeWidth="2"
				/>
				<path
					d="M24 8c5.4 4.2 8 9.9 8 16s-2.6 11.8-8 16c-5.4-4.2-8-9.9-8-16s2.6-11.8 8-16Z"
					stroke="currentColor"
					strokeOpacity="0.72"
					strokeWidth="2"
				/>
			</svg>
		</div>
	);
}
