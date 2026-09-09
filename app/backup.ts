import type { Grade, Kata, NumericGrade, VideoLink } from "./data";

export const PRIMARY_STORAGE_KEY = "samsungdang-dojolog-instructor-v1";
export const PREIMPORT_STORAGE_KEY = `${PRIMARY_STORAGE_KEY}-preimport`;
export const BACKUP_FORMAT = "samsungdang-dojolog-instructor-backup";
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export type RecordType = "detailed" | "sessionOnly";
export type DojoLog = {
  id: string;
  date: string;
  session?: number;
  status: "완료" | "취소";
  recordType?: RecordType;
  participants: Grade[];
  katas: Kata[];
  note: string;
  createdAt: string;
};
export type StoredDojoLog = DojoLog & {
  plannedGrades?: Grade[];
  actualGrades?: Grade[];
  participants?: Grade[];
};
export type DojoLogState = { logs: DojoLog[]; lastSession: number };
export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  appVersion: string;
  exportedAt: string;
  data: DojoLogState;
};
export type ParsedBackup = {
  source: "schema1" | "legacy";
  state: DojoLogState;
  metadata: { schemaVersion?: number; appVersion?: string; exportedAt?: string };
};

export class BackupError extends Error {
  constructor(
    public readonly code:
      | "empty"
      | "too-large"
      | "json"
      | "unrelated"
      | "wrong-format"
      | "future-schema"
      | "unsupported-schema"
      | "invalid-data"
      | "restore-failed",
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isInteger(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const numericGrade = (value: unknown): value is NumericGrade =>
  integer(value) && value >= 1 && value <= 9;
const grade = (value: unknown): value is Grade => value === "ungraded" || numericGrade(value);

function invalid(path: string): never {
  throw new BackupError("invalid-data", `백업 데이터의 ${path} 항목이 올바르지 않습니다.`);
}

function validateVideoLink(value: unknown, path: string): VideoLink {
  if (!object(value) || !nonempty(value.url)) invalid(path);
  if (value.label !== undefined && typeof value.label !== "string") invalid(`${path}.label`);
  return value as VideoLink;
}

function validateKata(value: unknown, path: string): Kata {
  if (!object(value)) invalid(path);
  if (!nonempty(value.id) || !nonempty(value.name) || !nonempty(value.attack) || !nonempty(value.technique)) invalid(path);
  if (!(["입기", "좌기", "반신반립"] as unknown[]).includes(value.form)) invalid(`${path}.form`);
  if (!(["일반 체술", "호흡력", "다인 잡기", "무기 잡기"] as unknown[]).includes(value.area)) invalid(`${path}.area`);
  if (value.grade !== undefined && !numericGrade(value.grade)) invalid(`${path}.grade`);
  if (typeof value.hombu !== "boolean" || typeof value.exam !== "boolean" || !Array.isArray(value.links)) invalid(path);
  value.links.forEach((link, index) => validateVideoLink(link, `${path}.links[${index}]`));
  return value as Kata;
}

function validateParticipants(value: unknown, path: string): Grade[] {
  if (!Array.isArray(value) || !value.every(grade)) invalid(path);
  return value as Grade[];
}

function validateLog(value: unknown, index: number, legacy: boolean): DojoLog {
  const path = `logs[${index}]`;
  if (!object(value) || !nonempty(value.id) || !nonempty(value.date) || !nonempty(value.createdAt)) invalid(path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date as string)) invalid(`${path}.date`);
  if (value.status !== "완료" && value.status !== "취소") invalid(`${path}.status`);
  if (value.session !== undefined && (!integer(value.session) || value.session < 1011)) invalid(`${path}.session`);
  if (value.recordType !== undefined && value.recordType !== "detailed" && value.recordType !== "sessionOnly") invalid(`${path}.recordType`);
  if (value.status === "완료" && value.session === undefined) invalid(`${path}.session`);
  if (value.status === "취소" && value.session !== undefined) invalid(`${path}.session`);
  if (value.recordType === "sessionOnly" && value.status !== "완료") invalid(`${path}.recordType`);
  if (typeof value.note !== "string") invalid(`${path}.note`);

  const legacyParticipants = value.participants ?? value.actualGrades ?? value.plannedGrades;
  const participants = validateParticipants(legacyParticipants, `${path}.participants`);
  const rawKatas = value.katas ?? (legacy ? [] : undefined);
  if (!Array.isArray(rawKatas)) invalid(`${path}.katas`);
  const katas = rawKatas.map((kata, kataIndex) => validateKata(kata, `${path}.katas[${kataIndex}]`));
  const recordType = value.status === "완료" ? (value.recordType ?? "detailed") : value.recordType;

  if (!legacy) return value as DojoLog;
  const { plannedGrades: _planned, actualGrades: _actual, ...rest } = value;
  void _planned;
  void _actual;
  return { ...rest, participants, katas, ...(recordType === undefined ? {} : { recordType }) } as DojoLog;
}

export function validateState(value: unknown, legacy = false): DojoLogState {
  if (!object(value) || !Array.isArray(value.logs) || !integer(value.lastSession) || value.lastSession < 1010) invalid("root");
  const logs = value.logs.map((log, index) => validateLog(log, index, legacy));
  const sessions = logs.filter((log) => log.status === "완료").map((log) => log.session as number).sort((a, b) => a - b);
  if (new Set(sessions).size !== sessions.length) invalid("logs.session");
  if (sessions.some((session, index) => session !== 1011 + index)) invalid("logs.session");
  if (value.lastSession !== 1010 + sessions.length) invalid("lastSession");
  return legacy ? { logs, lastSession: value.lastSession } : (value as DojoLogState);
}

export function createBackupEnvelope(state: DojoLogState, appVersion: string, now = new Date()): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    data: validateState(state),
  };
}

export function serializeBackup(state: DojoLogState, appVersion: string, now = new Date()): string {
  return JSON.stringify(createBackupEnvelope(state, appVersion, now), null, 2);
}

export function backupFilename(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString();
  return `Samsungdang-DojoLog-Instructor-backup-${local.slice(0, 19).replace(/[-:T]/g, "")}.json`;
}

export function parseBackupText(text: string): ParsedBackup {
  if (!text.trim()) throw new BackupError("empty", "JSON 파일을 읽을 수 없습니다.");
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new BackupError("too-large", "백업 파일이 너무 큽니다.");
  }
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new BackupError("json", "JSON 파일을 읽을 수 없습니다.");
  }
  if (!object(root)) throw new BackupError("unrelated", "삼성당 DojoLog 백업 파일이 아닙니다.");

  const envelopeLike = "format" in root || "schemaVersion" in root || "data" in root;
  if (envelopeLike) {
    if (root.format !== BACKUP_FORMAT) throw new BackupError("wrong-format", "삼성당 DojoLog 백업 파일이 아닙니다.");
    if (!integer(root.schemaVersion)) throw new BackupError("unsupported-schema", "지원하지 않는 백업 형식입니다.");
    if (root.schemaVersion > BACKUP_SCHEMA_VERSION) throw new BackupError("future-schema", "이 백업 파일은 현재 앱보다 새로운 형식입니다.");
    if (root.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new BackupError("unsupported-schema", "지원하지 않는 백업 형식입니다.");
    if (!nonempty(root.appVersion) || !nonempty(root.exportedAt) || Number.isNaN(Date.parse(root.exportedAt as string))) invalid("metadata");
    return {
      source: "schema1",
      state: validateState(root.data),
      metadata: { schemaVersion: root.schemaVersion, appVersion: root.appVersion, exportedAt: root.exportedAt },
    };
  }

  if (!("logs" in root) || !("lastSession" in root)) {
    throw new BackupError("unrelated", "삼성당 DojoLog 백업 파일이 아닙니다.");
  }
  return { source: "legacy", state: validateState(root, true), metadata: {} };
}

export function summarizeBackup(parsed: ParsedBackup) {
  const completedSessions = parsed.state.logs
    .filter((log) => log.status === "완료" && log.session !== undefined)
    .map((log) => log.session as number);
  return {
    source: parsed.source,
    schemaVersion: parsed.metadata.schemaVersion,
    appVersion: parsed.metadata.appVersion,
    exportedAt: parsed.metadata.exportedAt,
    logCount: parsed.state.logs.length,
    latestSession: completedSessions.length ? Math.max(...completedSessions) : undefined,
  };
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function restoreBackupAtomically(storage: StorageLike, imported: DojoLogState): void {
  const validated = validateState(imported);
  const nextRaw = JSON.stringify(validated);
  const currentRaw = storage.getItem(PRIMARY_STORAGE_KEY);
  const safeCurrentRaw = currentRaw ?? JSON.stringify({ logs: [], lastSession: 1010 });

  try {
    storage.setItem(PREIMPORT_STORAGE_KEY, safeCurrentRaw);
    storage.setItem(PRIMARY_STORAGE_KEY, nextRaw);
    const written = storage.getItem(PRIMARY_STORAGE_KEY);
    if (written !== nextRaw) throw new Error("read-back mismatch");
    const verified = parseBackupText(written);
    if (JSON.stringify(verified.state) !== nextRaw) throw new Error("verification mismatch");
  } catch {
    try {
      if (currentRaw === null) storage.removeItem(PRIMARY_STORAGE_KEY);
      else storage.setItem(PRIMARY_STORAGE_KEY, currentRaw);
    } catch {
      // The caller still receives a failure; no further destructive action is attempted.
    }
    throw new BackupError("restore-failed", "백업을 복원하지 못했습니다.");
  }
}
