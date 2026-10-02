import QRCode from "qrcode";

import kataCatalog from "../reference/kata-catalog.v2.json";
import {
  CREDENTIAL_ISSUER,
  CREDENTIAL_SCHEMA,
  CREDENTIAL_VERSION,
  decodeCanonicalBase64Url,
  encodeUnpaddedBase64Url,
  type Rank,
  type TrustedKeyBootstrap
} from "./credential-v1";

export const MEMBER_ONBOARDING_TYPE = "member-onboarding" as const;
export const ONBOARDING_PRODUCTION_BASE_URL = "https://sungjuhwankr-oss.github.io";
export const ONBOARDING_PRODUCTION_ROUTE = "/Samsungdang-DojoLog-Member/onboarding/";
export const ONBOARDING_QUERY_PARAMETER = "bundle";
export const ONBOARDING_QR_ERROR_CORRECTION = "L" as const;
export const ONBOARDING_INFLATED_LIMIT = 128 * 1024;

const BINARY_ID = /^[A-Za-z0-9_-]{22}$/;
const CREDENTIAL_ID = /^c1_[A-Za-z0-9_-]{22}$/;
const KEY_ID = /^k1_[A-Za-z0-9_-]{43}$/;
const CANONICAL_MEMBER_ID = /^ASD-[0-9]{3,}$/;
const ISSUED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const KATA_IDS = new Set(kataCatalog.kata.map(item => item.id));

export type OnboardingRank = Rank & {
  entryId: string;
  rankDate: string | null;
};

export type KataBaseline = { kataId: string; count: number | null };

export type MemberOnboardingPayload = {
  onboardingId: string;
  revision: number;
  supersedesCredentialId: string | null;
  recognizedAt: string;
  membership: { name: string; memberId: string; joinedAt: string };
  recognizedRanks: OnboardingRank[];
  currentRankEntryId: string;
  baselineAsOf: string;
  currentRankSessionBaseline: number | null;
  kataBaselines: KataBaseline[];
};

export type MemberOnboardingSigned = {
  schema: typeof CREDENTIAL_SCHEMA;
  credentialVersion: typeof CREDENTIAL_VERSION;
  issuer: typeof CREDENTIAL_ISSUER;
  type: typeof MEMBER_ONBOARDING_TYPE;
  credentialId: string;
  keyId: string;
  issuedAt: string;
  payload: MemberOnboardingPayload;
};

export type MemberOnboardingCredential = {
  signed: MemberOnboardingSigned;
  signature: string;
};

const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
  }
  return true;
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function rankOrdinal(rank: Rank): number {
  if (rank.rankType === "kyu" && Number.isSafeInteger(rank.rankValue) && rank.rankValue >= 1 && rank.rankValue <= 9) {
    return 10 - rank.rankValue;
  }
  if (rank.rankType === "dan" && Number.isSafeInteger(rank.rankValue) && rank.rankValue > 0) return 9 + rank.rankValue;
  throw new Error("invalid recognized rank");
}

export function normalizeOnboardingMemberId(value: string | number | null | undefined): string {
  if (value === null || value === undefined) throw new Error("memberId is required");
  const text = String(value).trim();
  if (!text) throw new Error("memberId is required");
  if (CANONICAL_MEMBER_ID.test(text)) return text;
  if (!/^\d+$/.test(text)) throw new Error("memberId must contain digits or canonical ASD- digits");
  return `ASD-${text.padStart(3, "0")}`;
}

export function createOnboardingId(randomBytes: Uint8Array): string {
  if (randomBytes.byteLength !== 16) throw new Error("onboardingId requires exactly 16 random bytes");
  return `on1_${encodeUnpaddedBase64Url(randomBytes)}`;
}

export function createOnboardingRankEntryId(randomBytes: Uint8Array): string {
  if (randomBytes.byteLength !== 16) throw new Error("entryId requires exactly 16 random bytes");
  return `or1_${encodeUnpaddedBase64Url(randomBytes)}`;
}

export function generateOnboardingId(): string {
  return createOnboardingId(crypto.getRandomValues(new Uint8Array(16)));
}

export function generateOnboardingRankEntryId(): string {
  return createOnboardingRankEntryId(crypto.getRandomValues(new Uint8Array(16)));
}

export function validateMemberOnboardingPayload(value: unknown): asserts value is MemberOnboardingPayload {
  if (!plainObject(value) || !exactKeys(value, [
    "onboardingId", "revision", "supersedesCredentialId", "recognizedAt", "membership",
    "recognizedRanks", "currentRankEntryId", "baselineAsOf", "currentRankSessionBaseline", "kataBaselines"
  ])) throw new Error("invalid member-onboarding payload fields");
  if (typeof value.onboardingId !== "string" || !value.onboardingId.startsWith("on1_") || !BINARY_ID.test(value.onboardingId.slice(4))) {
    throw new Error("invalid onboardingId");
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) throw new Error("invalid revision");
  if ((value.revision === 1 && value.supersedesCredentialId !== null) ||
      (value.revision !== 1 && (typeof value.supersedesCredentialId !== "string" || !CREDENTIAL_ID.test(value.supersedesCredentialId)))) {
    throw new Error("invalid supersedesCredentialId");
  }
  if (!calendarDate(value.recognizedAt) || !calendarDate(value.baselineAsOf)) throw new Error("invalid onboarding date");
  if ((value.baselineAsOf as string) < (value.recognizedAt as string)) throw new Error("baselineAsOf must not be before recognizedAt");
  if (!plainObject(value.membership) || !exactKeys(value.membership, ["name", "memberId", "joinedAt"])) throw new Error("invalid membership fields");
  if (typeof value.membership.name !== "string" || !value.membership.name.trim() ||
      !hasWellFormedUnicode(value.membership.name) || value.membership.name.length > 200) {
    throw new Error("invalid member name");
  }
  if (typeof value.membership.memberId !== "string" || !CANONICAL_MEMBER_ID.test(value.membership.memberId)) throw new Error("invalid canonical memberId");
  if (!calendarDate(value.membership.joinedAt)) throw new Error("invalid joinedAt");
  if (!Array.isArray(value.recognizedRanks) || value.recognizedRanks.length === 0) throw new Error("recognizedRanks must not be empty");
  let previous = 0;
  const entryIds = new Set<string>();
  for (const raw of value.recognizedRanks) {
    if (!plainObject(raw) || !exactKeys(raw, ["entryId", "rankType", "rankValue", "rankDate"])) throw new Error("invalid recognized rank fields");
    if (typeof raw.entryId !== "string" || !raw.entryId.startsWith("or1_") || !BINARY_ID.test(raw.entryId.slice(4)) || entryIds.has(raw.entryId)) {
      throw new Error("invalid or duplicate entryId");
    }
    entryIds.add(raw.entryId);
    if (raw.rankDate !== null && !calendarDate(raw.rankDate)) throw new Error("invalid rankDate");
    const ordinal = rankOrdinal(raw as unknown as Rank);
    if (ordinal <= previous) throw new Error("recognized ranks must be strictly ascending");
    previous = ordinal;
  }
  const last = value.recognizedRanks[value.recognizedRanks.length - 1] as Record<string, unknown>;
  if (value.currentRankEntryId !== last.entryId) throw new Error("currentRankEntryId must identify the highest rank");
  if (value.currentRankSessionBaseline !== null && (!Number.isSafeInteger(value.currentRankSessionBaseline) || (value.currentRankSessionBaseline as number) < 0)) {
    throw new Error("invalid currentRankSessionBaseline");
  }
  if (!Array.isArray(value.kataBaselines)) throw new Error("kataBaselines must be an array");
  const kataIds = new Set<string>();
  for (const raw of value.kataBaselines) {
    if (!plainObject(raw) || !exactKeys(raw, ["kataId", "count"])) throw new Error("invalid kata baseline fields");
    if (typeof raw.kataId !== "string" || !KATA_IDS.has(raw.kataId) || kataIds.has(raw.kataId)) throw new Error("invalid or duplicate canonical kataId");
    kataIds.add(raw.kataId);
    if (raw.count !== null && (!Number.isSafeInteger(raw.count) || (raw.count as number) < 0)) throw new Error("invalid kata baseline count");
  }
}

export function validateMemberOnboardingSigned(value: unknown): asserts value is MemberOnboardingSigned {
  if (!plainObject(value) || !exactKeys(value, ["schema", "credentialVersion", "issuer", "type", "credentialId", "keyId", "issuedAt", "payload"])) {
    throw new Error("invalid member-onboarding signed fields");
  }
  if (value.schema !== CREDENTIAL_SCHEMA || value.credentialVersion !== CREDENTIAL_VERSION || value.issuer !== CREDENTIAL_ISSUER || value.type !== MEMBER_ONBOARDING_TYPE) {
    throw new Error("unsupported member-onboarding credential");
  }
  if (typeof value.credentialId !== "string" || !CREDENTIAL_ID.test(value.credentialId)) throw new Error("invalid credentialId");
  if (typeof value.keyId !== "string" || !KEY_ID.test(value.keyId)) throw new Error("invalid keyId");
  if (typeof value.issuedAt !== "string" || !ISSUED_AT.test(value.issuedAt) || Number.isNaN(Date.parse(value.issuedAt))) throw new Error("invalid issuedAt");
  validateMemberOnboardingPayload(value.payload);
}

export function validateMemberOnboardingCorrection(
  previous: MemberOnboardingCredential,
  nextPayload: MemberOnboardingPayload
): void {
  validateMemberOnboardingSigned(previous.signed);
  validateMemberOnboardingPayload(nextPayload);
  if (nextPayload.onboardingId !== previous.signed.payload.onboardingId ||
      nextPayload.membership.memberId !== previous.signed.payload.membership.memberId) {
    throw new Error("identity-conflict");
  }
  if (nextPayload.revision !== previous.signed.payload.revision + 1 ||
      nextPayload.supersedesCredentialId !== previous.signed.credentialId) {
    throw new Error("correction must use revision+1 and exact supersedesCredentialId");
  }
}

export function parseMemberOnboardingCredential(json: string): MemberOnboardingCredential {
  const value: unknown = JSON.parse(json);
  if (!plainObject(value) || !exactKeys(value, ["signed", "signature"])) throw new Error("invalid credential envelope");
  validateMemberOnboardingSigned(value.signed);
  if (typeof value.signature !== "string") throw new Error("invalid signature");
  decodeCanonicalBase64Url(value.signature, 64);
  return value as MemberOnboardingCredential;
}

function canonicalRank(rank: OnboardingRank): string {
  return `{"entryId":${JSON.stringify(rank.entryId)},"rankDate":${rank.rankDate === null ? "null" : JSON.stringify(rank.rankDate)},"rankType":${JSON.stringify(rank.rankType)},"rankValue":${rank.rankValue}}`;
}

export function canonicalizeMemberOnboardingSigned(value: unknown): string {
  validateMemberOnboardingSigned(value);
  const payload = value.payload;
  const ranks = payload.recognizedRanks.map(canonicalRank).join(",");
  const kata = payload.kataBaselines.map(item =>
    `{"count":${item.count === null ? "null" : item.count},"kataId":${JSON.stringify(item.kataId)}}`
  ).join(",");
  const canonicalPayload = `{"baselineAsOf":${JSON.stringify(payload.baselineAsOf)}`
    + `,"currentRankEntryId":${JSON.stringify(payload.currentRankEntryId)}`
    + `,"currentRankSessionBaseline":${payload.currentRankSessionBaseline === null ? "null" : payload.currentRankSessionBaseline}`
    + `,"kataBaselines":[${kata}]`
    + `,"membership":{"joinedAt":${JSON.stringify(payload.membership.joinedAt)},"memberId":${JSON.stringify(payload.membership.memberId)},"name":${JSON.stringify(payload.membership.name)}}`
    + `,"onboardingId":${JSON.stringify(payload.onboardingId)}`
    + `,"recognizedAt":${JSON.stringify(payload.recognizedAt)}`
    + `,"recognizedRanks":[${ranks}]`
    + `,"revision":${payload.revision}`
    + `,"supersedesCredentialId":${payload.supersedesCredentialId === null ? "null" : JSON.stringify(payload.supersedesCredentialId)}}`;
  return `{"credentialId":${JSON.stringify(value.credentialId)},"credentialVersion":1,"issuedAt":${JSON.stringify(value.issuedAt)},"issuer":${JSON.stringify(value.issuer)},"keyId":${JSON.stringify(value.keyId)},"payload":${canonicalPayload},"schema":${JSON.stringify(value.schema)},"type":"member-onboarding"}`;
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function verifyMemberOnboardingCredential(credential: MemberOnboardingCredential, bootstrap: TrustedKeyBootstrap): Promise<boolean> {
  if (credential.signed.keyId !== bootstrap.keyId) return false;
  const spki = decodeCanonicalBase64Url(bootstrap.publicKeySpkiBase64Url, bootstrap.publicKeyByteLength);
  const publicKey = await crypto.subtle.importKey("spki", copyBuffer(spki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, publicKey,
    copyBuffer(decodeCanonicalBase64Url(credential.signature, 64)),
    copyBuffer(new TextEncoder().encode(canonicalizeMemberOnboardingSigned(credential.signed)))
  );
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([copyBuffer(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function tokenLimit(): number {
  const prefix = `${ONBOARDING_PRODUCTION_BASE_URL}${ONBOARDING_PRODUCTION_ROUTE}?${ONBOARDING_QUERY_PARAMETER}=`;
  let low = 0;
  let high = 4000;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    try {
      QRCode.create(prefix + "_".repeat(middle), { version: 40, errorCorrectionLevel: ONBOARDING_QR_ERROR_CORRECTION });
      low = middle;
    } catch {
      high = middle - 1;
    }
  }
  return low;
}

export const ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT = tokenLimit();

export async function createOnboardingTransportToken(credential: MemberOnboardingCredential): Promise<string> {
  parseMemberOnboardingCredential(JSON.stringify(credential));
  const jsonBytes = new TextEncoder().encode(JSON.stringify(credential));
  if (jsonBytes.byteLength > ONBOARDING_INFLATED_LIMIT) throw new Error("onboarding envelope exceeds inflated size limit");
  const token = `gz1.${encodeUnpaddedBase64Url(await gzip(jsonBytes))}`;
  if (token.length > ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT) throw new Error("onboarding bundle exceeds QR Version 40-L capacity");
  return token;
}

export async function createOnboardingProductionLink(credential: MemberOnboardingCredential): Promise<string> {
  const url = new URL(ONBOARDING_PRODUCTION_ROUTE, ONBOARDING_PRODUCTION_BASE_URL);
  url.searchParams.set(ONBOARDING_QUERY_PARAMETER, await createOnboardingTransportToken(credential));
  const link = url.toString();
  QRCode.create(link, { version: 40, errorCorrectionLevel: ONBOARDING_QR_ERROR_CORRECTION });
  return link;
}

export function createOnboardingQrDataUrl(link: string): Promise<string> {
  const parsed = new URL(link);
  if (parsed.protocol !== "https:" || parsed.origin !== ONBOARDING_PRODUCTION_BASE_URL || parsed.pathname !== ONBOARDING_PRODUCTION_ROUTE || parsed.searchParams.getAll(ONBOARDING_QUERY_PARAMETER).length !== 1) {
    throw new Error("invalid onboarding production link");
  }
  return QRCode.toDataURL(link, { errorCorrectionLevel: ONBOARDING_QR_ERROR_CORRECTION, margin: 4, width: 900 });
}
