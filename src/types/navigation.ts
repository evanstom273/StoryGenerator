import type { ComponentType } from "react";
import type { IconProps } from "../components/icons";

export interface NavigationItem {
  label: string;
  to: string;
  description: string;
  icon: ComponentType<IconProps>;
}
