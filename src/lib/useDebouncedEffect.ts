import { useEffect, useRef } from "react";

export function useDebouncedEffect(
  effect: () => void | (() => void),
  delayMs: number,
  deps: unknown[],
) {
  const cleanupRef = useRef<void | (() => void)>();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      cleanupRef.current?.();
      cleanupRef.current = effect() ?? undefined;
    }, delayMs);

    return () => {
      window.clearTimeout(handle);
    };
  }, [delayMs, effect, ...deps]);

  useEffect(() => () => cleanupRef.current?.(), []);
}
