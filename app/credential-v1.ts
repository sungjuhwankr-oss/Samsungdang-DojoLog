export const CREDENTIAL_SCHEMA = "samsungdang-dojolog-credential";
export const CREDENTIAL_VERSION = 1;
export const CREDENTIAL_ISSUER = "aikido-samsungdang";
export const MEMBERSHIP_TYPE = "membership";
export const TRUSTED_KEY_BOOTSTRAP_SCHEMA = "samsungdang-dojolog-trusted-key-bootstrap";

export type MembershipInput = {
  name: string;
  memberId: string;
  joinedAt: string;
};

export type MembershipSigned = {
  schema: typeof CREDENTIAL_SCHEMA;
  credentialVersion: typeof CREDENTIAL_VERSION;
  issuer: typeof CREDENTIAL_ISSUER;
  type: typeof MEMBERSHIP_TYPE;
  credentialId: string;
  keyId: string;
  issuedAt: string;
  payload: MembershipInput;
};

export type MembershipCredential = {
  signed: MembershipSigned;
  signature: string;
};

export type TrustedKeyBootstrap = {
  schema: typeof TRUSTED_KEY_BOOTSTRAP_SCHEMA;
  schemaVersion: 1;
  purpose: "credential-v1-initial-trust-provisioning";
  keyId: string;
  algorithm: "ECDSA-SHA-256";
  curve: "P-256";
  publicKeyFormat: "X.509 SubjectPublicKeyInfo DER";
  publicKeySpkiBase64Url: string;
  publicKeyByteLength: number;
  trustStatus: "pending-member-pwa-distribution";
  intendedRegistryStatus: "active";
  generatedOrReused: "generated" | "reused";
  androidKeyStoreUsed: true;
  privateKeyEncodedIsNull: true;
};

const MEMBER_ID = /^ASD-[0-9]{3}$/;
const CREDENTIAL_ID = /^c1_[A-Za-z0-9_-]{22}$/;
const KEY_ID = /^k1_[A-Za-z0-9_-]{43}$/;
const ISSUED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function membershipInputErrors(input: MembershipInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("이름은 비워둘 수 없습니다.");
  if (!hasWellFormedUnicode(input.name)) errors.push("이름에 올바르지 않은 Unicode가 있습니다.");
  if (input.name.length > 200) errors.push("이름은 200자 이하여야 합니다.");
  if (!MEMBER_ID.test(input.memberId)) errors.push("회원번호는 ASD-숫자 3자리 형식이어야 합니다.");
  if (!isCalendarDate(input.joinedAt)) errors.push("입회일은 실제로 존재하는 YYYY-MM-DD 날짜여야 합니다.");
  return errors;
}

function validUtcSecond(value: string): boolean {
  if (!ISSUED_AT.test(value)) return false;
  const date = value.slice(0, 10);
  if (!isCalendarDate(date)) return false;
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  return hour <= 23 && minute <= 59 && second <= 59;
}

export function validateMembershipSigned(value: unknown): asserts value is MembershipSigned {
  if (!plainObject(value) || !exactKeys(value, [
    "schema", "credentialVersion", "issuer", "type", "credentialId", "keyId", "issuedAt", "payload"
  ])) throw new Error("signed object fields are invalid");
  if (value.schema !== CREDENTIAL_SCHEMA) throw new Error("unsupported credential schema");
  if (value.credentialVersion !== CREDENTIAL_VERSION) throw new Error("unsupported credential version");
  if (value.issuer !== CREDENTIAL_ISSUER) throw new Error("unsupported credential issuer");
  if (value.type !== MEMBERSHIP_TYPE) throw new Error("unsupported credential type");
  if (typeof value.credentialId !== "string" || !CREDENTIAL_ID.test(value.credentialId)) throw new Error("invalid credentialId");
  if (typeof value.keyId !== "string" || !KEY_ID.test(value.keyId)) throw new Error("invalid keyId");
  if (typeof value.issuedAt !== "string" || !validUtcSecond(value.issuedAt)) throw new Error("invalid issuedAt");
  if (!plainObject(value.payload) || !exactKeys(value.payload, ["name", "memberId", "joinedAt"])) throw new Error("invalid membership payload fields");
  if (typeof value.payload.name !== "string" || typeof value.payload.memberId !== "string" || typeof value.payload.joinedAt !== "string") {
    throw new Error("membership payload must contain strings only");
  }
  const errors = membershipInputErrors(value.payload as MembershipInput);
  if (errors.length) throw new Error(errors.join(" "));
}

export function parseMembershipCredential(json: string): MembershipCredential {
  const value: unknown = JSON.parse(json);
  if (!plainObject(value) || !exactKeys(value, ["signed", "signature"])) throw new Error("credential envelope fields are invalid");
  validateMembershipSigned(value.signed);
  if (typeof value.signature !== "string") throw new Error("credential signature is invalid");
  decodeCanonicalBase64Url(value.signature, 64);
  return value as MembershipCredential;
}

export function parseTrustedKeyBootstrap(json: string): TrustedKeyBootstrap {
  const value: unknown = JSON.parse(json);
  if (!plainObject(value) || !exactKeys(value, [
    "schema", "schemaVersion", "purpose", "keyId", "algorithm", "curve", "publicKeyFormat",
    "publicKeySpkiBase64Url", "publicKeyByteLength", "trustStatus", "intendedRegistryStatus",
    "generatedOrReused", "androidKeyStoreUsed", "privateKeyEncodedIsNull"
  ])) throw new Error("trusted-key bootstrap fields are invalid");
  if (value.schema !== TRUSTED_KEY_BOOTSTRAP_SCHEMA || value.schemaVersion !== 1) throw new Error("trusted-key bootstrap version is invalid");
  if (value.purpose !== "credential-v1-initial-trust-provisioning") throw new Error("trusted-key bootstrap purpose is invalid");
  if (typeof value.keyId !== "string" || !KEY_ID.test(value.keyId)) throw new Error("trusted-key bootstrap keyId is invalid");
  if (value.algorithm !== "ECDSA-SHA-256" || value.curve !== "P-256") throw new Error("trusted-key bootstrap algorithm is invalid");
  if (value.publicKeyFormat !== "X.509 SubjectPublicKeyInfo DER") throw new Error("trusted-key bootstrap public-key format is invalid");
  if (typeof value.publicKeySpkiBase64Url !== "string" || typeof value.publicKeyByteLength !== "number" || !Number.isSafeInteger(value.publicKeyByteLength) || value.publicKeyByteLength <= 0) {
    throw new Error("trusted-key bootstrap public key is invalid");
  }
  decodeCanonicalBase64Url(value.publicKeySpkiBase64Url, value.publicKeyByteLength);
  if (value.trustStatus !== "pending-member-pwa-distribution" || value.intendedRegistryStatus !== "active") throw new Error("trusted-key bootstrap status is invalid");
  if (value.generatedOrReused !== "generated" && value.generatedOrReused !== "reused") throw new Error("trusted-key bootstrap provisioning diagnostic is invalid");
  if (value.androidKeyStoreUsed !== true || value.privateKeyEncodedIsNull !== true) throw new Error("trusted-key bootstrap security diagnostic is invalid");
  return value as TrustedKeyBootstrap;
}

/** Credential-specific RFC 8785 JCS serializer. */
export function canonicalizeMembershipSigned(value: unknown): string {
  validateMembershipSigned(value);
  return `{\"credentialId\":${JSON.stringify(value.credentialId)}`
    + `,\"credentialVersion\":1`
    + `,\"issuedAt\":${JSON.stringify(value.issuedAt)}`
    + `,\"issuer\":${JSON.stringify(value.issuer)}`
    + `,\"keyId\":${JSON.stringify(value.keyId)}`
    + `,\"payload\":{\"joinedAt\":${JSON.stringify(value.payload.joinedAt)}`
    + `,\"memberId\":${JSON.stringify(value.payload.memberId)}`
    + `,\"name\":${JSON.stringify(value.payload.name)}}`
    + `,\"schema\":${JSON.stringify(value.schema)}`
    + `,\"type\":${JSON.stringify(value.type)}}`;
}

export function encodeUnpaddedBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeCanonicalBase64Url(value: string, expectedLength?: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes("=") || /\s/.test(value) || value.length % 4 === 1) {
    throw new Error("invalid unpadded base64url");
  }
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (expectedLength !== undefined && bytes.length !== expectedLength) throw new Error("unexpected decoded byte length");
  if (encodeUnpaddedBase64Url(bytes) !== value) throw new Error("non-canonical base64url");
  return bytes;
}

export function createCredentialId(randomBytes: Uint8Array): string {
  if (randomBytes.byteLength !== 16) throw new Error("credentialId requires exactly 16 random bytes");
  return `c1_${encodeUnpaddedBase64Url(randomBytes)}`;
}

function copiedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function calculateKeyId(spkiDer: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", copiedArrayBuffer(spkiDer));
  return `k1_${encodeUnpaddedBase64Url(new Uint8Array(digest))}`;
}

export function createCredentialTransportToken(credential: MembershipCredential): string {
  const compactJson = JSON.stringify(credential);
  return encodeUnpaddedBase64Url(new TextEncoder().encode(compactJson));
}

export function createCredentialDeepLink(
  credential: MembershipCredential,
  target: { baseUrl: string; route: string; parameterName: string }
): string {
  const base = new URL(target.route, target.baseUrl);
  if (base.protocol !== "https:") throw new Error("credential target must use HTTPS");
  if (!target.parameterName) throw new Error("credential query parameter is required");
  base.searchParams.set(target.parameterName, createCredentialTransportToken(credential));
  return base.toString();
}

export async function verifyMembershipCredential(
  credential: MembershipCredential,
  bootstrap: TrustedKeyBootstrap
): Promise<boolean> {
  if (credential.signed.keyId !== bootstrap.keyId) return false;
  const spki = decodeCanonicalBase64Url(bootstrap.publicKeySpkiBase64Url, bootstrap.publicKeyByteLength);
  if (await calculateKeyId(spki) !== bootstrap.keyId) return false;
  const publicKey = await crypto.subtle.importKey(
    "spki",
    copiedArrayBuffer(spki),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const signature = decodeCanonicalBase64Url(credential.signature, 64);
  const signedBytes = new TextEncoder().encode(canonicalizeMembershipSigned(credential.signed));
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    copiedArrayBuffer(signature),
    copiedArrayBuffer(signedBytes)
  );
}
