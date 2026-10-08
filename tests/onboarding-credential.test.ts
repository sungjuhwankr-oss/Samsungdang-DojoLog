import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import catalog from "../reference/kata-catalog.v2.json";
import { OnboardingIssuer } from "../app/credential-issuer/onboarding-issuer";
import {
  calculateKeyId,
  decodeCanonicalBase64Url,
  encodeUnpaddedBase64Url,
  type TrustedKeyBootstrap
} from "../app/credential-v1";
import {
  ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT,
  ONBOARDING_QR_ERROR_CORRECTION,
  canonicalizeMemberOnboardingSigned,
  createOnboardingProductionLink,
  createOnboardingRankEntryId,
  createOnboardingTransportToken,
  normalizeOnboardingMemberId,
  validateMemberOnboardingCorrection,
  validateMemberOnboardingPayload,
  verifyMemberOnboardingCredential,
  type MemberOnboardingCredential,
  type MemberOnboardingPayload
} from "../app/onboarding-credential";

const id = (prefix: string, character: string) => `${prefix}${character.repeat(22)}`;

function rankIdFromIndex(index: number): string {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, index);
  return createOnboardingRankEntryId(bytes);
}

function payload(): MemberOnboardingPayload {
  const ranks = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((rankValue, index) => ({
    entryId: id("or1_", String.fromCharCode(65 + index)), rankType: "kyu" as const,
    rankValue, rankDate: index % 2 === 0 ? null : `202${index}-01-01`
  }));
  ranks.push({ entryId: id("or1_", "J"), rankType: "dan" as const, rankValue: 1, rankDate: null });
  return {
    onboardingId: id("on1_", "K"), revision: 1, supersedesCredentialId: null,
    recognizedAt: "2026-10-02",
    membership: { name: "가".repeat(200), memberId: "ASD-000", joinedAt: "2015-12-06" },
    recognizedRanks: ranks,
    currentRankEntryId: ranks.at(-1)!.entryId,
    baselineAsOf: "2026-10-02",
    currentRankSessionBaseline: Number.MAX_SAFE_INTEGER,
    kataBaselines: catalog.kata.map(item => ({ kataId: item.id, count: Number.MAX_SAFE_INTEGER }))
  };
}

function credential(): MemberOnboardingCredential {
  return {
    signed: {
      schema: "samsungdang-dojolog-credential", credentialVersion: 1,
      issuer: "aikido-samsungdang", type: "member-onboarding",
      credentialId: id("c1_", "L"), keyId: `k1_${"M".repeat(43)}`,
      issuedAt: "2026-10-02T06:00:00Z", payload: payload()
    },
    signature: "A".repeat(86)
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

test("memberId number 0, string 0, and ASD-000 normalize to one canonical identity", () => {
  assert.equal(normalizeOnboardingMemberId(0), "ASD-000");
  assert.equal(normalizeOnboardingMemberId("0"), "ASD-000");
  assert.equal(normalizeOnboardingMemberId("ASD-000"), "ASD-000");
  for (const value of ["", null, undefined]) assert.throws(() => normalizeOnboardingMemberId(value));
});

test("issuer builds the current-rank-only actual-device payload without a runtime reference error", () => {
  const markup = renderToStaticMarkup(createElement(OnboardingIssuer, { nativeAvailable: true }));
  assert.doesNotMatch(markup, /currentRankEntryId is not defined/);
  assert.doesNotMatch(markup, /credential-error/);
  assert.match(markup, /<button class="primary large" type="button">기존 회원 초기등록 전자 증명서 발급<\/button>/);

  const currentEntryId = createOnboardingRankEntryId(new Uint8Array(16));
  const value: MemberOnboardingPayload = {
    onboardingId: id("on1_", "A"), revision: 1, supersedesCredentialId: null,
    recognizedAt: "2026-10-06",
    membership: { name: "테스트회원", memberId: normalizeOnboardingMemberId(0), joinedAt: "2015-12-06" },
    recognizedRanks: [{ entryId: currentEntryId, rankType: "kyu", rankValue: 8, rankDate: null }],
    currentRankEntryId: currentEntryId,
    baselineAsOf: "2026-10-06",
    currentRankSessionBaseline: null,
    kataBaselines: []
  };
  assert.doesNotThrow(() => validateMemberOnboardingPayload(value));
  assert.equal(value.membership.memberId, "ASD-000");
  assert.equal(value.recognizedRanks.length, 1);
  assert.deepEqual(value.recognizedRanks[0], {
    entryId: currentEntryId, rankType: "kyu", rankValue: 8, rankDate: null
  });
  assert.equal(value.currentRankEntryId, value.recognizedRanks[0].entryId);
  assert.equal(value.currentRankSessionBaseline, null);
  assert.deepEqual(value.kataBaselines, []);
});

test("member-onboarding exact payload and JCS preserve rank, zero, unknown, and canonical Kata ids", () => {
  const value = payload();
  validateMemberOnboardingPayload(value);
  const signed = credential().signed;
  assert.equal(canonicalizeMemberOnboardingSigned(signed), canonical(signed));
  assert.throws(() => validateMemberOnboardingPayload({ ...value, extra: true }));
  assert.throws(() => validateMemberOnboardingPayload({ ...value, kataBaselines: [{ kataId: "unknown", count: 0 }] }));
  assert.throws(() => validateMemberOnboardingPayload({ ...value, onboardingId: "on1_short" }));
  assert.throws(() => validateMemberOnboardingPayload({ ...value, recognizedRanks: [...value.recognizedRanks].reverse() }));
  assert.throws(() => validateMemberOnboardingPayload({ ...value, currentRankEntryId: value.recognizedRanks[0].entryId }));
  assert.throws(() => validateMemberOnboardingPayload({ ...value, membership: { ...value.membership, name: "\ud800" } }));
});

test("onboarding signature uses 64-byte r||s and tampering fails verification", async () => {
  const value = credential();
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  value.signed.keyId = await calculateKeyId(spki);
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(canonicalizeMemberOnboardingSigned(value.signed))
  ));
  value.signature = encodeUnpaddedBase64Url(signature);
  const bootstrap: TrustedKeyBootstrap = {
    schema: "samsungdang-dojolog-trusted-key-bootstrap",
    schemaVersion: 1,
    purpose: "credential-v1-initial-trust-provisioning",
    keyId: value.signed.keyId,
    algorithm: "ECDSA-SHA-256",
    curve: "P-256",
    publicKeyFormat: "X.509 SubjectPublicKeyInfo DER",
    publicKeySpkiBase64Url: encodeUnpaddedBase64Url(spki),
    publicKeyByteLength: spki.byteLength,
    trustStatus: "pending-member-pwa-distribution",
    intendedRegistryStatus: "active",
    generatedOrReused: "reused",
    androidKeyStoreUsed: true,
    privateKeyEncodedIsNull: true
  };
  assert.equal(signature.byteLength, 64);
  assert.equal(await verifyMemberOnboardingCredential(value, bootstrap), true);
  const tampered = structuredClone(value);
  tampered.signed.payload.currentRankSessionBaseline = 1;
  assert.equal(await verifyMemberOnboardingCredential(tampered, bootstrap), false);
});

test("reissue is deterministic and correction requires exact identity, revision, and predecessor", async () => {
  const previous = credential();
  assert.equal(await createOnboardingProductionLink(previous), await createOnboardingProductionLink(previous));
  const correction = structuredClone(previous.signed.payload);
  correction.revision += 1;
  correction.supersedesCredentialId = previous.signed.credentialId;
  validateMemberOnboardingCorrection(previous, correction);
  assert.throws(() => validateMemberOnboardingCorrection(previous, { ...correction, revision: correction.revision + 1 }));
  assert.throws(() => validateMemberOnboardingCorrection(previous, { ...correction, supersedesCredentialId: id("c1_", "Z") }));
  assert.throws(() => validateMemberOnboardingCorrection(previous, {
    ...correction,
    membership: { ...correction.membership, memberId: "ASD-001" }
  }), /identity-conflict/);
});

test("gzip transport round-trips and enforces inflated and QR token bounds", async () => {
  const value = credential();
  const token = await createOnboardingTransportToken(value);
  const compressed = decodeCanonicalBase64Url(token.slice(4));
  const inflated = await new Response(
    new Blob([compressed.slice().buffer]).stream().pipeThrough(new DecompressionStream("gzip"))
  ).text();
  assert.deepEqual(JSON.parse(inflated), value);

  const manyRanks = Array.from({ length: 500 }, (_, index) => ({
    entryId: rankIdFromIndex(index + 1),
    rankType: "dan" as const,
    rankValue: index + 1,
    rankDate: null
  }));
  const hardLimit = credential();
  hardLimit.signed.payload.recognizedRanks = manyRanks;
  hardLimit.signed.payload.currentRankEntryId = manyRanks.at(-1)!.entryId;
  await assert.rejects(createOnboardingTransportToken(hardLimit), /QR Version 40-L/);

  const oversizedRanks = Array.from({ length: 2_500 }, (_, index) => ({
    entryId: rankIdFromIndex(index + 1),
    rankType: "dan" as const,
    rankValue: index + 1,
    rankDate: null
  }));
  const oversized = credential();
  oversized.signed.payload.recognizedRanks = oversizedRanks;
  oversized.signed.payload.currentRankEntryId = oversizedRanks.at(-1)!.entryId;
  await assert.rejects(createOnboardingTransportToken(oversized), /inflated size limit/);
});

test("full-97 worst-case gzip bundle fits one Version 40-L QR and link equals QR input", async () => {
  const value = credential();
  const compactBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const token = await createOnboardingTransportToken(value);
  const link = await createOnboardingProductionLink(value);
  const qr = QRCode.create(link, { errorCorrectionLevel: ONBOARDING_QR_ERROR_CORRECTION });
  assert.equal(catalog.kata.length, 97);
  assert.ok(compactBytes < 128 * 1024);
  assert.ok(token.startsWith("gz1."));
  assert.ok(token.length <= ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT);
  assert.ok(qr.version <= 40);
  assert.equal(new URL(link).searchParams.get("bundle"), token);
  const gzipBytes = decodeCanonicalBase64Url(token.slice(4)).byteLength;
  console.log(JSON.stringify({ compactBytes, gzipBytes, tokenCharacters: token.length, urlCharacters: link.length, qrVersion: qr.version, errorCorrection: "L", tokenHardLimit: ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT }));
});
