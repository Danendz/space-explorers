/**
 * Thin wrappers around the Fullscreen + Screen Orientation APIs.
 * All calls are best-effort and silently swallow failures — fullscreen
 * can be refused by the browser at any time (no user gesture, iframe
 * restrictions, etc.) and orientation.lock() is often unavailable.
 */

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

interface LockableOrientation {
  lock?: (type: string) => Promise<void>;
}

export function isFullscreen(): boolean {
  const doc = document as WebkitDocument;
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export async function enterFullscreen(
  el: HTMLElement = document.documentElement,
): Promise<void> {
  try {
    const e = el as WebkitElement;
    if (e.requestFullscreen) await e.requestFullscreen();
    else if (e.webkitRequestFullscreen) await e.webkitRequestFullscreen();
  } catch {
    /* best-effort */
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    const doc = document as WebkitDocument;
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
  } catch {
    /* best-effort */
  }
}

export async function toggleFullscreen(el?: HTMLElement): Promise<void> {
  if (isFullscreen()) await exitFullscreen();
  else await enterFullscreen(el);
}

export async function tryLockLandscape(): Promise<void> {
  const orientation = (screen as { orientation?: LockableOrientation }).orientation;
  if (orientation && typeof orientation.lock === 'function') {
    try {
      await orientation.lock('landscape');
    } catch {
      /* not supported or refused — silent */
    }
  }
}
