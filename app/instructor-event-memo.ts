export const INSTRUCTOR_EVENT_MEMO_STORAGE_KEY = "samsungdang-dojolog-instructor-event-memo-v1";

export type InstructorEventMemo = { memo: string; updatedAt: string };
export type InstructorEventMemoMap = Record<string, InstructorEventMemo>;

function readAll(storage: Pick<Storage, "getItem">): InstructorEventMemoMap {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(INSTRUCTOR_EVENT_MEMO_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as InstructorEventMemoMap;
  } catch {
    return {};
  }
}

export function loadInstructorEventMemo(eventId: string, storage: Pick<Storage, "getItem"> = localStorage): InstructorEventMemo | null {
  return readAll(storage)[eventId] ?? null;
}

export function saveInstructorEventMemo(
  eventId: string,
  memo: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
  now = () => new Date().toISOString()
): InstructorEventMemo {
  if (!/^st1_[A-Za-z0-9_-]{22}$/.test(eventId) || !memo.isWellFormed()) throw new Error("invalid event memo");
  const record = { memo, updatedAt: now() };
  storage.setItem(INSTRUCTOR_EVENT_MEMO_STORAGE_KEY, JSON.stringify({ ...readAll(storage), [eventId]: record }));
  return record;
}
