export const MANAGEMENT_RETURN_EVENT = "samsungdang-management-return";
export const MANAGEMENT_ANDROID_BACK_EVENT = "samsungdang-android-back";
const HISTORY_MARKER = "samsungdangManagementSubview";
const RETURN_URL = "samsungdangManagementReturnUrl";

type ManagementHistory = Pick<History, "state" | "pushState" | "back"> & Partial<Pick<History, "replaceState">>;

export function isManagementHistory(history: Pick<History, "state">) {
  return history.state?.[HISTORY_MARKER] === true;
}

// Keep a reusable same-document slot. UI returns never traverse into the router;
// the existing Android history Back can still traverse from the subview to its anchor.
export function clearManagementHistory(history: Pick<History, "state" | "replaceState">) {
  if (!isManagementHistory(history)) return;
  const state = { ...history.state };
  delete state[HISTORY_MARKER];
  history.replaceState(state, "", state[RETURN_URL]);
}

export function enterManagementHistory(history: ManagementHistory, returnUrl?: string) {
  if (isManagementHistory(history)) return;
  const state = { ...history.state, [HISTORY_MARKER]: true };
  let subviewUrl: string | undefined;
  if (returnUrl) {
    state[RETURN_URL] = returnUrl;
    // A distinct fragment gives WebView a same-document history destination.
    // Preserve the original URL (including any fragment) for the management root.
    const url = new URL(returnUrl);
    url.hash = `${url.hash.slice(1)}${url.hash ? "&" : ""}dojolog-management`;
    subviewUrl = url.href;
  }
  if (returnUrl && history.state?.[RETURN_URL] === returnUrl && history.replaceState) {
    history.replaceState(state, "", subviewUrl);
  } else {
    history.pushState(state, "", subviewUrl);
  }
}

export function leaveManagementHistory(history: ManagementHistory, inPlace = false) {
  if (!isManagementHistory(history)) return;
  if (inPlace) {
    if (!history.replaceState) throw new Error("Management return requires replaceState");
    clearManagementHistory(history as Pick<History, "state" | "replaceState">);
  } else {
    history.back();
  }
}
