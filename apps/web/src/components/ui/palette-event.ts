/** Anything that asks the console to open ⌘K (the phone header's search button) dispatches this. */
export const OPEN_PALETTE_EVENT = "pms:palette";

const SHORTCUTS_KEY = "pms:shortcuts";

/**
 * Single-letter shortcuts can be switched off (WCAG 2.1.4: a speech-input user saying "e" must not
 * close a conversation). ⌘K and Escape stay on: they need a modifier or close something.
 */
export function shortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setShortcutsEnabled(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(SHORTCUTS_KEY);
    else window.localStorage.setItem(SHORTCUTS_KEY, "off");
  } catch {
    // storage blocked: the setting lasts for this page only
  }
}
