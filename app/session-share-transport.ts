import {
  createImportLink, IMPORT_BASE_URL, serializeSessionSharePayload,
  SESSION_SHARE_DOJO, SESSION_SHARE_SCHEMA, SESSION_SHARE_VERSION,
  type SessionSharePayload,
} from "./session-share";

// Member D1 production decoder: 53d76e0be401074d1d50f538f6d384beecea219e.
// These are transport/acceptance limits, not a change to Payload v1.
export const SESSION_GZIP_PREFIX = "gz1.";
export const SESSION_TOKEN_LIMIT = 16_384;
export const SESSION_COMPRESSED_LIMIT = 12_285;
export const SESSION_SOURCE_LIMIT = 8_192;

export type SessionShareCandidates = { raw: string | null; compressed: string | null };

function memberAccepts(payload: SessionSharePayload, bytes: Uint8Array): boolean {
  if (bytes.byteLength > SESSION_SOURCE_LIMIT || payload.schema !== SESSION_SHARE_SCHEMA
    || payload.version !== SESSION_SHARE_VERSION || payload.dojo !== SESSION_SHARE_DOJO
    || !Number.isSafeInteger(payload.sessionNo) || payload.sessionNo <= 0
    || typeof payload.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return false;
  const [year, month, day] = payload.date.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const validString = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 200;
  return Array.isArray(payload.kata) && payload.kata.length >= 1 && payload.kata.length <= 50
    && payload.kata.every(item => item !== null && typeof item === "object" && !Array.isArray(item)
      && validString(item.id) && validString(item.name));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function compressedToken(bytes: Uint8Array): Promise<string | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (typeof globalThis.CompressionStream !== "function") return null;
    // The same native gzip API already used by onboarding/special-training.
    const gzip = new CompressionStream("gzip");
    if (!(gzip.readable instanceof ReadableStream) || !(gzip.writable instanceof WritableStream)) return null;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    reader = new Blob([copy.buffer]).stream().pipeThrough(gzip).getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SESSION_COMPRESSED_LIMIT) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    const token = SESSION_GZIP_PREFIX + encodeBytes(output);
    return token.length <= SESSION_TOKEN_LIMIT ? token : null;
  } catch {
    // Compression is additive. An unavailable/failed native API retains raw.
    await reader?.cancel().catch(() => {});
    return null;
  } finally {
    reader?.releaseLock();
  }
}

export async function createSessionShareCandidates(
  payload: SessionSharePayload, baseUrl = IMPORT_BASE_URL,
): Promise<SessionShareCandidates> {
  // Snapshot once before awaiting; both candidates describe the same JSON.
  const text = serializeSessionSharePayload(payload);
  const snapshot = JSON.parse(text) as SessionSharePayload;
  const rawLink = createImportLink(snapshot, baseUrl);
  const bytes = new TextEncoder().encode(text);
  if (!memberAccepts(snapshot, bytes)) return { raw: null, compressed: null };
  const raw = new URL(rawLink).hash.slice("#session=".length).length <= SESSION_TOKEN_LIMIT ? rawLink : null;
  const token = await compressedToken(bytes);
  if (token === null) return { raw, compressed: null };
  const compressed = new URL(rawLink);
  compressed.hash = `session=${token}`;
  return { raw, compressed: compressed.toString() };
}

// Only candidates that passed the preceding validity gates reach selection.
export function selectSessionShareLink({ raw, compressed }: SessionShareCandidates): string {
  if (raw !== null && (compressed === null || raw.length <= compressed.length)) return raw;
  if (compressed !== null) return compressed;
  throw new Error("수련기록이 회원용 앱의 가져오기 허용 범위를 벗어났습니다.");
}

export async function createShortestImportLink(payload: SessionSharePayload, baseUrl = IMPORT_BASE_URL): Promise<string> {
  return selectSessionShareLink(await createSessionShareCandidates(payload, baseUrl));
}
