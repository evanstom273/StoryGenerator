import type { ReactNode, SVGProps } from "react";
import { cn } from "../utils/cn";

export type IconProps = SVGProps<SVGSVGElement>;

function SvgIcon({
  children,
  className,
  viewBox = "0 0 24 24",
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox={viewBox}
      className={cn("h-5 w-5 shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </SvgIcon>
  );
}

export function StoriesIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17.5A2.5 2.5 0 0 0 16.5 17H5Z" />
      <path d="M5 4.5v15A2.5 2.5 0 0 0 7.5 22H19" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
    </SvgIcon>
  );
}

export function CharactersIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M16 19a4 4 0 0 0-8 0" />
      <circle cx="12" cy="9" r="3.5" />
      <path d="M4 18a3 3 0 0 1 2.5-2.95" />
      <path d="M20 18a3 3 0 0 0-2.5-2.95" />
    </SvgIcon>
  );
}

export function UniversesIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M3 12c2.5-3.3 6-5 9-5s6.5 1.7 9 5c-2.5 3.3-6 5-9 5s-6.5-1.7-9-5Z" />
      <path d="M12 3c3.3 2.5 5 6 5 9s-1.7 6.5-5 9c-3.3-2.5-5-6-5-9s1.7-6.5 5-9Z" />
    </SvgIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 2.75v3" />
      <path d="m18.54 5.46-2.12 2.12" />
      <path d="M21.25 12h-3" />
      <path d="m18.54 18.54-2.12-2.12" />
      <path d="M12 18.25v3" />
      <path d="m7.58 16.42-2.12 2.12" />
      <path d="M5.75 12h-3" />
      <path d="m7.58 7.58-2.12-2.12" />
      <circle cx="12" cy="12" r="3.5" />
    </SvgIcon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </SvgIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </SvgIcon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </SvgIcon>
  );
}

export function OrbitIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M4 14c2.1 3.5 5.3 5.5 8 5.5s5.9-2 8-5.5c-2.1-3.5-5.3-5.5-8-5.5S6.1 10.5 4 14Z" />
      <path d="M9.5 4.5c-1.4 3.8-.9 7.4 1 9.3s5.5 2.4 9.3 1c-1.4-3.8-3.8-6.2-5.7-7.1-1.9-.9-3.8-.8-4.6-3.2Z" />
    </SvgIcon>
  );
}

export function MemoryIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 1.8-.74 2.95-1.72 4.04-.84.95-1.78 1.91-2.28 3.46h-3c-.5-1.55-1.44-2.51-2.28-3.46C7.24 12.45 6.5 11.3 6.5 9.5Z" />
      <path d="M9.5 20h5" />
      <path d="M10 16h4" />
    </SvgIcon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3 5.5 5.5V11c0 4.5 2.6 7.8 6.5 10 3.9-2.2 6.5-5.5 6.5-10V5.5Z" />
      <path d="m9.5 12 1.75 1.75L15 10" />
    </SvgIcon>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m12 3 8 4.5-8 4.5-8-4.5Z" />
      <path d="m4 12.5 8 4.5 8-4.5" />
      <path d="m4 17 8 4.5 8-4.5" />
    </SvgIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m4 20 4.5-1 9-9a2.12 2.12 0 1 0-3-3l-9 9Z" />
      <path d="m13.5 6.5 4 4" />
    </SvgIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 7h16" />
      <path d="m9 7 .5-2h5L15 7" />
      <path d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </SvgIcon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </SvgIcon>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" />
      <path d="m19 4 .6 1.4L21 6l-1.4.6L19 8l-.6-1.4L17 6l1.4-.6Z" />
      <path d="m5 15 .8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8Z" />
    </SvgIcon>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <ellipse cx="12" cy="5" rx="7" ry="2.75" />
      <path d="M5 5v6c0 1.5 3.13 2.75 7 2.75S19 12.5 19 11V5" />
      <path d="M5 11v6c0 1.5 3.13 2.75 7 2.75S19 18.5 19 17v-6" />
    </SvgIcon>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M14 5h5v5" />
      <path d="m10 14 9-9" />
      <path d="M19 13v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18V6.5A1.5 1.5 0 0 1 6.5 5h5" />
    </SvgIcon>
  );
}
