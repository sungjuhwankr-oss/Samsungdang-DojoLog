import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { MAX_CREDENTIAL_FILE_BYTES, openCredentialFile } from "../app/credential-file";
import { enterManagementHistory, leaveManagementHistory } from "../app/management-navigation";
import { NEW_MEMBER_TEST_PROFILE, isNewMemberTestProfile, issueControlledMembership } from "../app/credential-issuer/new-membership";
import {
  calculateKeyId, canonicalizeMembershipSigned, createCredentialId, createCredentialTransportToken,
  encodeUnpaddedBase64Url, type MembershipCredential, type MembershipInput, type TrustedKeyBootstrap
} from "../app/credential-v1";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("R4 SAF reads bytes only, permits cancel/reselect, bounds size and rejects overlapping selection", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const host = Object.assign(new EventTarget(), { SamsungdangBackupBridge: { openJson: () => { calls++; }, saveJson: () => { throw new Error("must never save"); } } });
  Object.defineProperty(globalThis, "window", { value: host, configurable: true });
  let calls = 0;
  const input = { click: () => { throw new Error("native must not use HTML click"); } } as unknown as HTMLInputElement;
  const respond = (status: string, content?: string) => host.dispatchEvent(new CustomEvent("samsungdang-backup-result", { detail: { operation: "open", status, filename: "test.json", content } }));
  try {
    const cancelled = openCredentialFile(input); respond("cancel"); assert.equal(await cancelled, null);
    for (let index = 0; index < 2; index++) {
      const pending = openCredentialFile(input); respond("success", "{\"test\":true}");
      assert.deepEqual(await pending, { filename: "test.json", content: "{\"test\":true}" });
    }
    const pending = openCredentialFile(input);
    await assert.rejects(openCredentialFile(input), /이미 JSON/);
    respond("error"); await assert.rejects(pending, /native open failed/);
    for (const value of ["", "한".repeat(Math.ceil(MAX_CREDENTIAL_FILE_BYTES / 3) + 1)]) {
      const pending = openCredentialFile(input); respond("success", value);
      await assert.rejects(pending);
    }
    const recovered = openCredentialFile(input); respond("success", "{}"); assert.ok(await recovered);
    assert.equal(calls, 7);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("R4 browser fallback resets same-file selection and cancellation without saving", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  let mode: "change" | "cancel" = "change", clicks = 0;
  const target = new EventTarget();
  const input = Object.assign(target, {
    value: "old", files: [{ name: "same.json", size: 2, text: async () => "{}" }],
    click() { clicks++; target.dispatchEvent(new Event(mode)); }
  });
  try {
    for (let index = 0; index < 2; index++) {
      assert.deepEqual(await openCredentialFile(input as unknown as HTMLInputElement), { filename: "same.json", content: "{}" });
      assert.equal(input.value, "");
    }
    mode = "cancel"; assert.equal(await openCredentialFile(input as unknown as HTMLInputElement), null);
    assert.equal(clicks, 3); assert.equal(input.value, "");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("R4 management creates one history entry and consumes it without writing application data", () => {
  const base = { vinext: "preserved" }, calls: unknown[] = [];
  const history = { state: base, pushState(state: typeof base) { this.state = state; calls.push(state); }, back() { calls.push("back"); this.state = base; } };
  enterManagementHistory(history); enterManagementHistory(history);
  assert.equal(calls.length, 1); assert.equal(history.state.vinext, "preserved");
  leaveManagementHistory(history); assert.equal(calls.at(-1), "back");
  leaveManagementHistory(history); assert.equal(calls.length, 2);
  assert.deepEqual(base, { vinext: "preserved" });
});

async function membershipVector(input: MembershipInput = { ...NEW_MEMBER_TEST_PROFILE }) {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const keyId = await calculateKeyId(spki);
  const bootstrap: TrustedKeyBootstrap = {
    schema: "samsungdang-dojolog-trusted-key-bootstrap", schemaVersion: 1,
    purpose: "credential-v1-initial-trust-provisioning", keyId, algorithm: "ECDSA-SHA-256", curve: "P-256",
    publicKeyFormat: "X.509 SubjectPublicKeyInfo DER", publicKeySpkiBase64Url: encodeUnpaddedBase64Url(spki),
    publicKeyByteLength: spki.byteLength, trustStatus: "pending-member-pwa-distribution", intendedRegistryStatus: "active",
    generatedOrReused: "reused", androidKeyStoreUsed: true, privateKeyEncodedIsNull: true
  };
  const signed: MembershipCredential["signed"] = {
    schema: "samsungdang-dojolog-credential", credentialVersion: 1, issuer: "aikido-samsungdang", type: "membership",
    credentialId: createCredentialId(crypto.getRandomValues(new Uint8Array(16))), keyId, issuedAt: "2026-10-09T06:00:00Z", payload: input
  };
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(canonicalizeMembershipSigned(signed))));
  const credential = { signed, signature: encodeUnpaddedBase64Url(signature) };
  return { bootstrap, credential, native: { operation: "issue-membership" as const, status: "success" as const, json: JSON.stringify(credential), bootstrap: JSON.stringify(bootstrap), transportToken: createCredentialTransportToken(credential) } };
}

test("R4 new member HOLD rejects every changed identity before invoking the native signer", async () => {
  const { bootstrap, native } = await membershipVector();
  let called = 0;
  for (const input of [
    { ...NEW_MEMBER_TEST_PROFILE, name: "실제 회원" }, { ...NEW_MEMBER_TEST_PROFILE, memberId: "ASD-001" },
    { ...NEW_MEMBER_TEST_PROFILE, joinedAt: "2026-10-10" }, { ...NEW_MEMBER_TEST_PROFILE, joinedAt: "2026-02-30" }
  ]) {
    assert.equal(isNewMemberTestProfile(input), false);
    await assert.rejects(issueControlledMembership(input, bootstrap, async () => { called++; return native; }), /HOLD/);
  }
  assert.equal(called, 0);
});

test("R4 new member signs existing Membership v1 and QR decodes to the exact verified Member URL", async () => {
  const { bootstrap, native, credential } = await membershipVector();
  const result = await issueControlledMembership({ ...NEW_MEMBER_TEST_PROFILE }, bootstrap, async (...input) => {
    assert.deepEqual(input, [NEW_MEMBER_TEST_PROFILE.name, NEW_MEMBER_TEST_PROFILE.memberId, NEW_MEMBER_TEST_PROFILE.joinedAt]); return native;
  });
  assert.deepEqual(result.credential, credential);
  assert.equal(result.json, native.json);
  const url = new URL(result.link);
  assert.equal(url.origin, "https://sungjuhwankr-oss.github.io");
  assert.equal(url.pathname, "/Samsungdang-DojoLog-Member/membership/");
  assert.deepEqual([...url.searchParams.keys()], ["credential"]);
  assert.equal(url.searchParams.get("credential"), native.transportToken);
  const png = PNG.sync.read(Buffer.from(result.qr.split(",")[1], "base64"));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, result.link);
});

test("R4 new member rejects wrong key, wrong output identity, tampering and mismatched transport", async () => {
  const { bootstrap, native } = await membershipVector();
  const wrongKey = await membershipVector();
  await assert.rejects(issueControlledMembership({ ...NEW_MEMBER_TEST_PROFILE }, bootstrap, async () => wrongKey.native), /서명 키/);
  const wrongPayload = await membershipVector({ ...NEW_MEMBER_TEST_PROFILE, name: "다른 회원" });
  await assert.rejects(issueControlledMembership({ ...NEW_MEMBER_TEST_PROFILE }, wrongPayload.bootstrap, async () => wrongPayload.native), /입력·서명/);
  const tampered = JSON.parse(native.json); tampered.signed.issuedAt = "2026-10-09T06:00:01Z";
  await assert.rejects(issueControlledMembership({ ...NEW_MEMBER_TEST_PROFILE }, bootstrap, async () => ({ ...native, json: JSON.stringify(tampered) })), /입력·서명/);
  await assert.rejects(issueControlledMembership({ ...NEW_MEMBER_TEST_PROFILE }, bootstrap, async () => ({ ...native, transportToken: "different" })), /token mismatch/);
});

test("R4 scope contains no destructive import or persisted credential directory and old fixture is exact", () => {
  const file = read("../app/credential-file.ts");
  assert.doesNotMatch(file, /restoreBackup|parseBackup|localStorage|sessionStorage|indexedDB/);
  const sources = ["new-membership.ts", "new-membership-issuer.tsx", "workspace.tsx", "issuer-workspace.tsx", "onboarding-issuer.tsx"].map(path => read(`../app/credential-issuer/${path}`)).join("\n");
  assert.doesNotMatch(sources, /localStorage|sessionStorage|indexedDB|deleteEntry|deleteKey|removeItem/);
  const fixture = readFileSync(new URL("./fixtures/membership-test-credential-v1.json", import.meta.url));
  assert.equal(createHash("sha256").update(fixture).digest("hex"), "376ea76504eca6050bf48e058c7cd14a392703db46a161ee7b698671c61ffef9");
});
