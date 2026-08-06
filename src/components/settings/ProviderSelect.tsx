import type { SelectHTMLAttributes } from "react";
import {
	getProviderLabel,
	VISIBLE_AI_PROVIDERS,
} from "../../lib/ai/providerConfig";
import { SelectInput } from "../forms/Fields";

export function ProviderSelect({
	className,
	children,
	...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<SelectInput className={className} {...props}>
			{VISIBLE_AI_PROVIDERS.map((provider) => (
				<option key={provider} value={provider}>
					{getProviderLabel(provider)}
				</option>
			))}
			{children}
		</SelectInput>
	);
}
