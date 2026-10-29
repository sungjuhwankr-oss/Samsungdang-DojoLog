export const MANAGEMENT_RETURN_EVENT = "samsungdang-management-return";
const HISTORY_MARKER = "samsungdangManagementSubview";

type ManagementHistory = Pick<History, "state" | "pushState" | "back">;

// Push a history entry for the existing nitron.backButton=history runtime.
// Android consumption is checked separately on device; only navigation state is written.
export function isManagementHistory(history: Pick<History, "state">) {
  return history.state?.[HISTORY_MARKER] === true;
}

// An inactive workspace cannot restore its subview on Forward. Remove only our
// marker from that existing entry so a later root Back is handled by the router.
export function clearManagementHistory(history: Pick<History, "state" | "replaceState">) {
  if (!isManagementHistory(history)) return;
  const state = { ...history.state };
  delete state[HISTORY_MARKER];
  history.replaceState(state, "");
}

export function enterManagementHistory(history: ManagementHistory) {
  if (!history.state?.[HISTORY_MARKER]) {
    history.pushState({ ...history.state, [HISTORY_MARKER]: true }, "");
  }
}

export function leaveManagementHistory(history: ManagementHistory) {
  if (history.state?.[HISTORY_MARKER]) history.back();
}
