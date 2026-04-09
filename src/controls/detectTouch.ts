/**
 * Returns true if the current device primarily uses a coarse pointer
 * (finger), false for precise pointers (mouse). Matches most phones +
 * tablets and excludes desktops even if a touchscreen is attached.
 */
export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    'matchMedia' in window &&
    window.matchMedia('(pointer: coarse)').matches
  );
}
