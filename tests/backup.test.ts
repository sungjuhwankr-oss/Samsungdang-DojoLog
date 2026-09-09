import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BackupError,
  PREIMPORT_STORAGE_KEY,
  PRIMARY_STORAGE_KEY,
  backupFilename,
  createBackupEnvelope,
  parseBackupText,
  restoreBackupAtomically,
  serializeBackup,
  summarizeBackup,
  validateState,
  type DojoLogState,
  type StorageLike,
} from "../app/backup";
import { KATAS } from "../app/data";

const kata = KATAS.find((item) => item.name === "엇서한손잡기 사방던지기")!;
const genericKata = KATAS.find((item) => item.name === "찌르기 손목뒤집기")!;
const state: DojoLogState = {
  logs: [
    { id: "cancelled", date: "2026-09-03", status: "취소", participants: [5], katas: [], note: "취소 메모", createdAt: "2026-09-03T10:00:00.000Z" },
    { id: "session-only", date: "2026-09-02", session: 1012, status: "완료", recordType: "sessionOnly", participants: ["ungraded", 7], katas: [], note: "실시만 기록", createdAt: "2026-09-02T10:00:00.000Z" },
    { id: "detailed", date: "2026-09-01", session: 1011, status: "완료", recordType: "detailed", participants: [9, 7, 5, 2], katas: [kata, genericKata], note: "상세 메모", createdAt: "2026-09-01T10:00:00.000Z" },
  ],
  lastSession: 1012,
};

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  failWriteKey?: string;
  mismatchWriteKey?: string;
  mismatchNextReadKey?: string;
  getItem(key: string) {
    const value = this.values.get(key) ?? null;
    if (this.mismatchNextReadKey === key && value !== null) {
      this.mismatchNextReadKey = undefined;
      return `${value} `;
    }
    return value;
  }
  setItem(key: string, value: string) {
    if (this.failWriteKey === key) throw new Error("simulated write failure");
    this.values.set(key, value);
    if (this.mismatchWriteKey === key) this.mismatchNextReadKey = key;
  }
  removeItem(key: string) { this.values.delete(key); }
}

function expectCode(run: () => unknown, code: BackupError["code"]) {
  assert.throws(run, (error) => error instanceof BackupError && error.code === code);
}

test("schema 1 serializer emits the fixed envelope", () => {
  const envelope = createBackupEnvelope(state, "0.9.9", new Date("2026-09-08T20:22:00.000Z"));
  assert.equal(envelope.format, BACKUP_FORMAT);
  assert.equal(envelope.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(envelope.appVersion, "0.9.9");
  assert.equal(envelope.exportedAt, "2026-09-08T20:22:00.000Z");
  assert.deepEqual(envelope.data, state);
});

test("schema 1 round trip preserves the entire current state", () => {
  const parsed = parseBackupText(serializeBackup(state, "0.9.9", new Date("2026-09-08T20:22:00.000Z")));
  assert.equal(parsed.source, "schema1");
  assert.deepEqual(parsed.state, state);
});

test("round trip preserves detailed, session-only, cancelled and log order", () => {
  const restored = parseBackupText(serializeBackup(state, "0.9.9")).state;
  assert.deepEqual(restored.logs.map((log) => [log.id, log.recordType, log.status]), state.logs.map((log) => [log.id, log.recordType, log.status]));
});

test("round trip preserves ungraded and mixed participants", () => {
  const restored = parseBackupText(serializeBackup(state, "0.9.9")).state;
  assert.deepEqual(restored.logs[1].participants, ["ungraded", 7]);
});

test("round trip preserves kata snapshots and links", () => {
  const restored = parseBackupText(serializeBackup(state, "0.9.9")).state;
  assert.deepEqual(restored.logs[2].katas, state.logs[2].katas);
  assert.equal(restored.logs[2].katas[1].links.length, 2);
});

test("round trip preserves notes and sessions without normalization", () => {
  const restored = parseBackupText(serializeBackup(state, "0.9.9")).state;
  assert.deepEqual(restored.logs.map((log) => log.note), state.logs.map((log) => log.note));
  assert.deepEqual(restored.logs.map((log) => log.session), state.logs.map((log) => log.session));
});

test("legacy v0.9.8 raw JSON is detected and preserved", () => {
  const parsed = parseBackupText(JSON.stringify(state));
  assert.equal(parsed.source, "legacy");
  assert.deepEqual(parsed.state, state);
});

test("legacy plannedGrades and missing recordType use the existing loader compatibility", () => {
  const legacy = { logs: [{ ...state.logs[2], participants: undefined, plannedGrades: [7], recordType: undefined }], lastSession: 1011 };
  const parsed = parseBackupText(JSON.stringify(legacy));
  assert.deepEqual(parsed.state.logs[0].participants, [7]);
  assert.equal(parsed.state.logs[0].recordType, "detailed");
  assert.equal("plannedGrades" in parsed.state.logs[0], false);
});

test("summary reports schema metadata and latest session", () => {
  const summary = summarizeBackup(parseBackupText(serializeBackup(state, "0.9.9", new Date("2026-09-08T20:22:00.000Z"))));
  assert.deepEqual(summary, { source: "schema1", schemaVersion: 1, appVersion: "0.9.9", exportedAt: "2026-09-08T20:22:00.000Z", logCount: 3, latestSession: 1012 });
});

test("legacy summary does not invent unavailable metadata", () => {
  const summary = summarizeBackup(parseBackupText(JSON.stringify(state)));
  assert.equal(summary.source, "legacy");
  assert.equal(summary.exportedAt, undefined);
  assert.equal(summary.appVersion, undefined);
});

test("backup filename is safe and includes seconds", () => {
  assert.match(backupFilename(new Date("2026-09-08T20:22:00.000Z")), /^Samsungdang-DojoLog-Instructor-backup-\d{14}\.json$/);
});

test("empty input is rejected", () => expectCode(() => parseBackupText("   "), "empty"));
test("malformed JSON is rejected", () => expectCode(() => parseBackupText("{"), "json"));
test("array root is rejected", () => expectCode(() => parseBackupText("[]"), "unrelated"));
test("unrelated JSON is rejected", () => expectCode(() => parseBackupText('{"hello":"world"}'), "unrelated"));
test("wrong format is rejected", () => expectCode(() => parseBackupText(JSON.stringify({ format: "other", schemaVersion: 1, data: state })), "wrong-format"));
test("schema version zero envelope is rejected", () => expectCode(() => parseBackupText(JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 0, data: state })), "unsupported-schema"));
test("future schema is rejected with a distinct error", () => expectCode(() => parseBackupText(JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 2, data: state })), "future-schema"));
test("missing envelope data is rejected", () => expectCode(() => parseBackupText(JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 1, appVersion: "0.9.9", exportedAt: new Date().toISOString() })), "invalid-data"));

for (const invalidParticipant of [0, 10, -1, "7", "0", "10", "foo", null, {}]) {
  test(`invalid participant ${JSON.stringify(invalidParticipant)} is rejected`, () => {
    const changed = structuredClone(state) as DojoLogState;
    changed.logs[0].participants = [invalidParticipant as never];
    expectCode(() => validateState(changed), "invalid-data");
  });
}

test("invalid recordType is rejected", () => {
  const changed = structuredClone(state) as unknown as { logs: Record<string, unknown>[]; lastSession: number };
  changed.logs[1].recordType = "other";
  expectCode(() => validateState(changed), "invalid-data");
});

test("invalid log shape is rejected", () => {
  const changed = structuredClone(state) as unknown as { logs: Record<string, unknown>[]; lastSession: number };
  delete changed.logs[0].note;
  expectCode(() => validateState(changed), "invalid-data");
});

test("duplicate or non-contiguous sessions are rejected instead of renumbered", () => {
  const changed = structuredClone(state);
  changed.logs[1].session = 1011;
  expectCode(() => validateState(changed), "invalid-data");
});

test("atomic restore snapshots current raw and writes verified imported raw", () => {
  const storage = new MemoryStorage();
  const before = JSON.stringify({ logs: [], lastSession: 1010 });
  storage.setItem(PRIMARY_STORAGE_KEY, before);
  restoreBackupAtomically(storage, state);
  assert.equal(storage.getItem(PREIMPORT_STORAGE_KEY), before);
  assert.deepEqual(JSON.parse(storage.getItem(PRIMARY_STORAGE_KEY)!), state);
});

test("snapshot failure leaves primary byte-for-byte unchanged", () => {
  const storage = new MemoryStorage();
  const before = '{"logs":[],"lastSession":1010}';
  storage.setItem(PRIMARY_STORAGE_KEY, before);
  storage.failWriteKey = PREIMPORT_STORAGE_KEY;
  expectCode(() => restoreBackupAtomically(storage, state), "restore-failed");
  assert.equal(storage.getItem(PRIMARY_STORAGE_KEY), before);
});

test("primary write failure rolls back current raw", () => {
  const storage = new MemoryStorage();
  const before = '{"logs":[],"lastSession":1010}';
  storage.setItem(PRIMARY_STORAGE_KEY, before);
  storage.failWriteKey = PRIMARY_STORAGE_KEY;
  expectCode(() => restoreBackupAtomically(storage, state), "restore-failed");
  storage.failWriteKey = undefined;
  assert.equal(storage.getItem(PRIMARY_STORAGE_KEY), before);
});

test("read-back mismatch rolls back current raw", () => {
  const storage = new MemoryStorage();
  const before = '{"logs":[],"lastSession":1010}';
  storage.setItem(PRIMARY_STORAGE_KEY, before);
  storage.mismatchWriteKey = PRIMARY_STORAGE_KEY;
  expectCode(() => restoreBackupAtomically(storage, state), "restore-failed");
  storage.mismatchWriteKey = undefined;
  storage.mismatchNextReadKey = undefined;
  assert.equal(storage.getItem(PRIMARY_STORAGE_KEY), before);
});
