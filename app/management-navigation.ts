export const MANAGEMENT_RETURN_EVENT = "samsungdang-management-return";
const HISTORY_MARKER = "samsungdangManagementSubview";

type ManagementHistory = Pick<History, "state" | "pushState" | "back">;

// Push a history entry for the existing nitron.backButton=history runtime.
// Android consumption is checked separately on device; only navigation state is written.
export function enterManagementHistory(history: ManagementHistory) {
  if (!history.state?.[HISTORY_MARKER]) {
    history.pushState({ ...history.state, [HISTORY_MARKER]: true }, "");
  }
}

export function leaveManagementHistory(history: ManagementHistory) {
  if (history.state?.[HISTORY_MARKER]) history.back();
}
