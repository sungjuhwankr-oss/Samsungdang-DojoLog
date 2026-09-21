import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateKeyId,
  canonicalizeMembershipSigned,
  createCredentialDeepLink,
  createCredentialId,
  createCredentialTransportToken,
  decodeCanonicalBase64Url,
  encodeUnpaddedBase64Url,
  membershipInputErrors,
  parseMembershipCredential,
  parseTrustedKeyBootstrap
} from "../app/credential-v1";

const signature = encodeUnpaddedBase64Url(Uint8Array.from({ length: 64 }, (_, index) => index));
const signed = {
  payload: { memberId: "ASD-000", name: "테스트회원", joinedAt: "2026-09-21" },
  type: "membership",
  issuer: "aikido-samsungdang",
  keyId: "k1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  schema: "samsungdang-dojolog-credential",
  issuedAt: "2026-09-21T08:30:00Z",
  credentialId: "c1_AAECAwQFBgcICQoLDA0ODw",
  credentialVersion: 1
};

test("Membership signed object uses deterministic credential-specific RFC 8785 JCS", () => {
  const first = canonicalizeMembershipSigned(signed);
  const second = canonicalizeMembershipSigned({
    credentialVersion: 1,
    credentialId: signed.credentialId,
    payload: { joinedAt: "2026-09-21", name: "테스트회원", memberId: "ASD-000" },
    keyId: signed.keyId,
    issuedAt: signed.issuedAt,
    type: signed.type,
    schema: signed.schema,
    issuer: signed.issuer
  });
  assert.equal(first, second);
  assert.match(first, /"payload":\{"joinedAt":"2026-09-21","memberId":"ASD-000","name":"테스트회원"\}/);
});

test("JCS preserves Korean UTF-8 and JSON escaping without Unicode normalization", () => {
  const value = structuredClone(signed);
  value.payload.name = "한글\n\"\\😀";
  const canonical = canonicalizeMembershipSigned(value);
  assert.match(canonical, /"name":"한글\\n\\\"\\\\😀"/);
  assert.ok(new TextEncoder().encode(canonical).length > canonical.length);
  const invalid = structuredClone(signed);
  invalid.payload.name = "invalid\ud800";
  assert.throws(() => canonicalizeMembershipSigned(invalid), /Unicode/);
});

test("transport property order and whitespace do not change signing bytes", () => {
  const compact = JSON.stringify(signed);
  const spaced = JSON.stringify(signed, null, 2);
  assert.equal(canonicalizeMembershipSigned(JSON.parse(compact)), canonicalizeMembershipSigned(JSON.parse(spaced)));
});

test("Credential v1 rejects extra numeric fields and non-fixed credentialVersion", () => {
  assert.throws(() => canonicalizeMembershipSigned({ ...signed, score: 1.25 }), /fields/);
  assert.throws(() => canonicalizeMembershipSigned({ ...signed, credentialVersion: 2 }), /version/);
});

test("credentialId is exactly 128 random bits rendered as unpadded base64url", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = createCredentialId(bytes);
  assert.match(id, /^c1_[A-Za-z0-9_-]{22}$/);
  assert.equal(decodeCanonicalBase64Url(id.slice(3)).length, 16);
  assert.throws(() => createCredentialId(new Uint8Array(15)), /16 random bytes/);
});

test("keyId is deterministic SHA-256 over complete SPKI bytes", async () => {
  const spki = Uint8Array.from({ length: 91 }, (_, index) => (index * 17) & 0xff);
  const first = await calculateKeyId(spki);
  const second = await calculateKeyId(spki);
  assert.equal(first, second);
  assert.match(first, /^k1_[A-Za-z0-9_-]{43}$/);
  assert.equal(decodeCanonicalBase64Url(first.slice(3)).length, 32);
});

test("base64url is unpadded, canonical, and rejects padding whitespace and alphabet changes", () => {
  const encoded = encodeUnpaddedBase64Url(Uint8Array.from([251, 255, 239]));
  assert.equal(encoded, "-__v");
  assert.deepEqual([...decodeCanonicalBase64Url(encoded, 3)], [251, 255, 239]);
  for (const invalid of ["-__v=", "-__v ", "+//v", "A"]) {
    assert.throws(() => decodeCanonicalBase64Url(invalid), /base64url|byte length/);
  }
});

test("Membership validation rejects invalid memberId and calendar dates", () => {
  assert.deepEqual(membershipInputErrors({ name: "회원", memberId: "ASD-001", joinedAt: "2024-02-29" }), []);
  assert.ok(membershipInputErrors({ name: " ", memberId: "ASD-1", joinedAt: "2026-02-30" }).length >= 3);
});

test("Credential envelope requires exactly signed and signature and a 64-byte wire signature", () => {
  const json = JSON.stringify({ signed, signature });
  assert.equal(parseMembershipCredential(json).signature, signature);
  assert.throws(() => parseMembershipCredential(JSON.stringify({ signed, signature, publicKey: "forbidden" })), /envelope fields/);
  assert.throws(() => parseMembershipCredential(JSON.stringify({ signed, signature: encodeUnpaddedBase64Url(new Uint8Array(63)) })), /byte length/);
});

test("trusted bootstrap carries public SPKI only and independently recomputable keyId", async () => {
  const spki = Uint8Array.from({ length: 91 }, (_, index) => index);
  const keyId = await calculateKeyId(spki);
  const value = {
    schema: "samsungdang-dojolog-trusted-key-bootstrap",
    schemaVersion: 1,
    purpose: "credential-v1-initial-trust-provisioning",
    keyId,
    algorithm: "ECDSA-SHA-256",
    curve: "P-256",
    publicKeyFormat: "X.509 SubjectPublicKeyInfo DER",
    publicKeySpkiBase64Url: encodeUnpaddedBase64Url(spki),
    publicKeyByteLength: spki.length,
    trustStatus: "pending-member-pwa-distribution",
    intendedRegistryStatus: "active",
    generatedOrReused: "generated",
    androidKeyStoreUsed: true,
    privateKeyEncodedIsNull: true
  };
  const parsed = parseTrustedKeyBootstrap(JSON.stringify(value));
  assert.equal(await calculateKeyId(decodeCanonicalBase64Url(parsed.publicKeySpkiBase64Url)), parsed.keyId);
  const serialized = JSON.stringify(parsed);
  assert.doesNotMatch(serialized, /privateKeyBytes|privateKeyBase64|privateKeyPem/);
});

test("transport token is ready while production HTTPS target remains injected", () => {
  const credential = parseMembershipCredential(JSON.stringify({ signed, signature }));
  const token = createCredentialTransportToken(credential);
  assert.doesNotMatch(token, /=|\s/);
  assert.equal(new TextDecoder().decode(decodeCanonicalBase64Url(token)), JSON.stringify(credential));
  assert.equal(
    createCredentialDeepLink(credential, { baseUrl: "https://example.invalid", route: "/credential/", parameterName: "credential" }),
    `https://example.invalid/credential/?credential=${token}`
  );
  assert.throws(() => createCredentialDeepLink(credential, { baseUrl: "http://example.invalid", route: "/", parameterName: "c" }), /HTTPS/);
});

test("production bridge uses idempotent alias semantics and has no deletion path", async () => {
  const bridge = await readFile(new URL("../android/CredentialIssuerBridge.java", import.meta.url), "utf8");
  const activity = await readFile(new URL("../android/SaveActivity.java", import.meta.url), "utf8");
  assert.match(bridge, /samsungdang\.dojolog\.instructor\.credential\.v1\.active/);
  assert.match(bridge, /if \(!keyStore\.containsAlias\(PRODUCTION_ALIAS\)\)/);
  assert.match(bridge, /generated \? "generated" : "reused"/);
  assert.match(bridge, /privateKey\.getEncoded\(\)/);
  assert.doesNotMatch(bridge, /deleteEntry|privateKeyBytes|privateKeyBase64/);
  assert.match(activity, /SamsungdangCredentialBridge/);
});

test("issuer UI is test-fixture-only and the packaged route is explicit", async () => {
  const issuerPage = await readFile(new URL("../app/credential-issuer/page.tsx", import.meta.url), "utf8");
  const homePage = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(homePage, /href="\/credential-issuer\.html"/);
  assert.match(issuerPage, /테스트회원 \(실제 회원 아님\)/);
  assert.match(issuerPage, /memberId: "ASD-000"/);
  assert.match(issuerPage, /실제 회원 Credential 발급 — Phase 4H-B 이후 활성화/);
  assert.match(issuerPage, /<button className="credential-production-disabled" type="button" disabled>/);
  assert.doesNotMatch(issuerPage, /localStorage|indexedDB|deleteEntry/);
  assert.doesNotMatch(issuerPage, /https:\/\/(?!example\.invalid)/);
});
