import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { serializeBackup } from "../app/backup";

import {
  calculateKeyId,
  canonicalizeSpecialTrainingV2Signed,
  canonicalizeSpecialTrainingSigned,
  createCredentialId,
  createCredentialTransportToken,
  createSpecialTrainingEventId,
  generateSpecialTrainingSessionId,
  decodeCanonicalBase64Url,
  encodeUnpaddedBase64Url,
  generateSpecialTrainingEventId,
  parseSpecialTrainingCredential,
  parseSpecialTrainingV2Credential,
  parseTrustedKeyBootstrap,
  specialTrainingInputErrors,
  specialTrainingV2InputErrors,
  verifySpecialTrainingCredential,
  verifySpecialTrainingV2Credential,
  type SpecialTrainingCredential,
  type SpecialTrainingPayload,
  type SpecialTrainingV2Credential,
  type SpecialTrainingV2Payload,
  type TrustedKeyBootstrap
} from "../app/credential-v1";
import {
  SPECIAL_TRAINING_PRODUCTION_BASE_URL,
  SPECIAL_TRAINING_PRODUCTION_ROUTE,
  SPECIAL_TRAINING_QR_ERROR_CORRECTION,
  SPECIAL_TRAINING_QR_MARGIN,
  SPECIAL_TRAINING_QR_SIZE,
  SPECIAL_TRAINING_QUERY_PARAMETER,
  SPECIAL_TRAINING_SAVED_QR_MIN_QUIET_ZONE_MODULES,
  calculateSpecialTrainingSavedQrGeometry,
  createSpecialTrainingProductionLink,
  createSpecialTrainingQrDataUrl,
  createSpecialTrainingSavedQrDataUrl,
  createSpecialTrainingV2ProductionLink,
  createSpecialTrainingV2TransportToken
} from "../app/special-training-output";
import {
  INSTRUCTOR_EVENT_MEMO_STORAGE_KEY,
  loadInstructorEventMemo,
  saveInstructorEventMemo
} from "../app/instructor-event-memo";

const eventId = "st1_AAECAwQFBgcICQoLDA0ODw";
const specialPayload: SpecialTrainingPayload = {
  eventId,
  title: "Phase 4J 테스트 특별수련",
  category: "special-training",
  startDate: "2026-10-24",
  endDate: null,
  instructor: "테스트 지도자"
};
const specialCommon = {
  schema: "samsungdang-dojolog-credential",
  credentialVersion: 1,
  issuer: "aikido-samsungdang",
  type: "special-training",
  credentialId: "c1_AAECAwQFBgcICQoLDA0ODw",
  keyId: "k1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  issuedAt: "2026-10-24T04:00:00Z",
  payload: specialPayload
} as const;

test("Special-training payload uses exact fields and TS JCS bytes match the Java vector", () => {
  const expected = "{\"credentialId\":\"c1_AAECAwQFBgcICQoLDA0ODw\",\"credentialVersion\":1,"
    + "\"issuedAt\":\"2026-10-24T04:00:00Z\",\"issuer\":\"aikido-samsungdang\","
    + "\"keyId\":\"k1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\","
    + "\"payload\":{\"category\":\"special-training\",\"endDate\":null,"
    + "\"eventId\":\"st1_AAECAwQFBgcICQoLDA0ODw\",\"instructor\":\"테스트 지도자\","
    + "\"startDate\":\"2026-10-24\",\"title\":\"Phase 4J 테스트 특별수련\"},"
    + "\"schema\":\"samsungdang-dojolog-credential\",\"type\":\"special-training\"}";
  assert.equal(canonicalizeSpecialTrainingSigned(specialCommon), expected);
  assert.equal(
    canonicalizeSpecialTrainingSigned({
      ...specialCommon,
      payload: {
        instructor: specialPayload.instructor,
        endDate: null,
        title: specialPayload.title,
        startDate: specialPayload.startDate,
        eventId: specialPayload.eventId,
        category: specialPayload.category
      }
    }),
    expected
  );
});

test("Special-training validation rejects identifiers, text, categories, dates, and extra fields fail-closed", () => {
  const invalid: unknown[] = [
    { ...specialPayload, eventId: "st1_short" },
    { ...specialPayload, title: " " },
    { ...specialPayload, title: "　" },
    { ...specialPayload, title: "x".repeat(201) },
    { ...specialPayload, title: "invalid\ud800" },
    { ...specialPayload, category: "class" },
    { ...specialPayload, startDate: "2026-02-30" },
    { ...specialPayload, endDate: "2026-02-30" },
    { ...specialPayload, startDate: "2026-10-24", endDate: "2026-10-23" },
    { ...specialPayload, instructor: "\n\t" },
    { ...specialPayload, instructor: "지".repeat(201) },
    { ...specialPayload, instructor: "invalid\udc00" },
    { ...specialPayload, note: "forbidden" },
    { eventId, title: specialPayload.title, category: specialPayload.category,
      startDate: specialPayload.startDate, instructor: specialPayload.instructor }
  ];
  for (const payload of invalid) {
    assert.ok(specialTrainingInputErrors(payload).length > 0, JSON.stringify(payload));
  }
  for (const category of ["seminar", "workshop", "special-training", "camp", "other"] as const) {
    assert.deepEqual(specialTrainingInputErrors({ ...specialPayload, category }), []);
  }
  assert.deepEqual(specialTrainingInputErrors({ ...specialPayload, endDate: "2026-10-24" }), []);
  assert.deepEqual(specialTrainingInputErrors({ ...specialPayload, endDate: "2026-10-25" }), []);
});

test("eventId uses exactly 128 random bits and stays separate from credentialId", () => {
  const random = Uint8Array.from({ length: 16 }, (_, index) => index);
  assert.equal(createSpecialTrainingEventId(random), eventId);
  assert.match(generateSpecialTrainingEventId(), /^st1_[A-Za-z0-9_-]{22}$/);
  assert.equal(decodeCanonicalBase64Url(eventId.slice(4)).length, 16);
  assert.throws(() => createSpecialTrainingEventId(new Uint8Array(15)), /16 random bytes/);
  const firstCredentialId = createCredentialId(Uint8Array.from({ length: 16 }, (_, index) => index + 1));
  const secondCredentialId = createCredentialId(Uint8Array.from({ length: 16 }, (_, index) => index + 2));
  assert.notEqual(firstCredentialId, secondCredentialId);
  assert.equal(specialPayload.eventId, eventId);
});

test("Special-training credential signs, self-verifies, round trips, and rejects tamper", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const keyId = await calculateKeyId(spki);
  const bootstrap = parseTrustedKeyBootstrap(JSON.stringify({
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
    generatedOrReused: "reused",
    androidKeyStoreUsed: true,
    privateKeyEncodedIsNull: true
  })) as TrustedKeyBootstrap;
  const signed = { ...specialCommon, keyId };
  const signedBytes = new TextEncoder().encode(canonicalizeSpecialTrainingSigned(signed));
  const wireSignature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, signedBytes
  ));
  assert.equal(wireSignature.length, 64);
  const credential = parseSpecialTrainingCredential(JSON.stringify({
    signed,
    signature: encodeUnpaddedBase64Url(wireSignature)
  }));
  assert.equal(await verifySpecialTrainingCredential(credential, bootstrap), true);
  const token = createCredentialTransportToken(credential);
  assert.deepEqual(
    parseSpecialTrainingCredential(new TextDecoder().decode(decodeCanonicalBase64Url(token))),
    credential
  );
  const tampered = structuredClone(credential) as SpecialTrainingCredential;
  tampered.signed.payload.title = "tampered";
  assert.equal(await verifySpecialTrainingCredential(tampered, bootstrap), false);
});

test("Special-training production link and screen QR encode the exact same HTTPS URL", async () => {
  const credential = parseSpecialTrainingCredential(JSON.stringify({
    signed: specialCommon,
    signature: encodeUnpaddedBase64Url(new Uint8Array(64))
  }));
  const token = createCredentialTransportToken(credential);
  const link = createSpecialTrainingProductionLink(credential);
  assert.equal(
    link,
    `${SPECIAL_TRAINING_PRODUCTION_BASE_URL}${SPECIAL_TRAINING_PRODUCTION_ROUTE}?${SPECIAL_TRAINING_QUERY_PARAMETER}=${token}`
  );
  assert.equal(SPECIAL_TRAINING_QR_ERROR_CORRECTION, "M");
  assert.ok(SPECIAL_TRAINING_QR_MARGIN >= 4);
  const dataUrl = await createSpecialTrainingQrDataUrl(link);
  const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
  assert.equal(png.width, SPECIAL_TRAINING_QR_SIZE);
  assert.equal(png.height, SPECIAL_TRAINING_QR_SIZE);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, link);
});

test("Saved Special-training QR adds module-relative white padding without changing screen pixels or URL", async () => {
  const credential = parseSpecialTrainingCredential(JSON.stringify({
    signed: specialCommon,
    signature: encodeUnpaddedBase64Url(new Uint8Array(64))
  }));
  const link = createSpecialTrainingProductionLink(credential);
  const screenDataUrl = await createSpecialTrainingQrDataUrl(link);
  const screen = PNG.sync.read(Buffer.from(screenDataUrl.split(",")[1], "base64"));
  const geometry = calculateSpecialTrainingSavedQrGeometry(link);
  assert.equal(SPECIAL_TRAINING_SAVED_QR_MIN_QUIET_ZONE_MODULES, 16);
  assert.ok(geometry.outerPaddingPixels > 0);
  assert.ok(geometry.minimumEffectiveQuietZoneModules >= SPECIAL_TRAINING_SAVED_QR_MIN_QUIET_ZONE_MODULES);

  const savedDataUrl = await createSpecialTrainingSavedQrDataUrl(screenDataUrl, link, async (dataUrl, padding) => {
    assert.equal(padding, geometry.outerPaddingPixels);
    const source = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
    const output = new PNG({ width: source.width + (padding * 2), height: source.height + (padding * 2) });
    output.data.fill(255);
    PNG.bitblt(source, output, 0, 0, source.width, source.height, padding, padding);
    return `data:image/png;base64,${PNG.sync.write(output).toString("base64")}`;
  });
  const saved = PNG.sync.read(Buffer.from(savedDataUrl.split(",")[1], "base64"));
  assert.equal(saved.width, geometry.outputSize);
  assert.equal(saved.height, geometry.outputSize);

  for (let y = 0; y < saved.height; y += 1) {
    for (let x = 0; x < saved.width; x += 1) {
      const targetOffset = ((y * saved.width) + x) * 4;
      const insideSource = x >= geometry.outerPaddingPixels
        && x < geometry.outerPaddingPixels + screen.width
        && y >= geometry.outerPaddingPixels
        && y < geometry.outerPaddingPixels + screen.height;
      if (insideSource) {
        const sourceOffset = ((((y - geometry.outerPaddingPixels) * screen.width)
          + (x - geometry.outerPaddingPixels)) * 4);
        assert.deepEqual(
          saved.data.subarray(targetOffset, targetOffset + 4),
          screen.data.subarray(sourceOffset, sourceOffset + 4)
        );
      } else {
        assert.deepEqual([...saved.data.subarray(targetOffset, targetOffset + 4)], [255, 255, 255, 255]);
      }
    }
  }
  const decoded = jsQR(new Uint8ClampedArray(saved.data), saved.width, saved.height);
  assert.equal(decoded?.data, link);
});

test("legacy v1 issuer remains byte-compatible while v2 reuses the production signing path", async () => {
  const bridge = await readFile(new URL("../android/CredentialIssuerBridge.java", import.meta.url), "utf8");
  const issuerPage = await readFile(new URL("../app/credential-issuer/issuer-workspace.tsx", import.meta.url), "utf8");
  const v2Issuer = await readFile(new URL("../app/credential-issuer/special-training-v2-issuer.tsx", import.meta.url), "utf8");
  assert.match(bridge, /issueSpecialTrainingCredential/);
  assert.match(bridge, /run\("issue-special-training"/);
  assert.match(bridge, /requireExactKeys\(payload, "eventId", "title", "category", "startDate",\s*"endDate", "instructor"\)/);
  assert.match(bridge, /return signCredential\("special-training"/);
  assert.equal((bridge.match(/StrictEcdsaDer\.toP256Raw/g) ?? []).length, 1);
  assert.match(issuerPage, /const eventIdBeforeIssuance = specialPayload\.eventId/);
  assert.match(issuerPage, /credentialId was unexpectedly reused/);
  assert.match(issuerPage, /createSpecialTrainingSavedQrDataUrl\(specialQrDataUrl, productionLink\)/);
  assert.match(issuerPage, /실제 운영용 특별수련 전자 증명서 발급 — 실제 연동 검증 완료 전 비활성/);
  assert.match(issuerPage, /QR PNG 저장/);
  assert.doesNotMatch(issuerPage, /Production HTTPS link|copySpecialTrainingLink|link 복사|shareSpecialTrainingQr|QR PNG 공유/);
  assert.doesNotMatch(issuerPage, /localStorage|indexedDB|issuedCredential|credentialLedger|deleteEntry/);
  assert.match(bridge, /issueSpecialTrainingV2Credential/);
  assert.match(bridge, /run\("issue-special-training-v2"/);
  assert.equal((bridge.match(/StrictEcdsaDer\.toP256Raw/g) ?? []).length, 1);
  assert.match(v2Issuer, /createSpecialTrainingV2ProductionLink/);
  assert.match(v2Issuer, /QR과 동일한 운영용 HTTPS 링크/);
  assert.match(v2Issuer, /QR PNG 저장/);
  assert.match(v2Issuer, /현재 지도자용 Backup v1에도 포함되지 않습니다/);
});

const v2Payload: SpecialTrainingV2Payload = {
  eventId,
  revision: 1,
  supersedesCredentialId: null,
  title: "Phase 4K-D 특별수련",
  category: "special-training",
  startDate: "2026-10-24",
  endDate: "2026-10-25",
  instructor: "테스트 지도자",
  sessions: [
    { sessionId: "sts1_AAECAwQFBgcICQoLDA0ODw", date: "2026-10-24", label: "오전 수련" },
    { sessionId: "sts1_EBESExQVFhcYGRobHB0eHw", date: "2026-10-25", label: "오후 수련" }
  ]
};

test("Special-training v2 exact schema, JCS and session validation preserve signed display order", () => {
  const signed = { ...specialCommon, credentialVersion: 2 as const, payload: v2Payload };
  const canonical = canonicalizeSpecialTrainingV2Signed(signed);
  assert.match(canonical, /"credentialVersion":2/);
  assert.ok(canonical.indexOf("오전 수련") < canonical.indexOf("오후 수련"));
  assert.deepEqual(specialTrainingV2InputErrors(v2Payload), []);
  assert.ok(specialTrainingV2InputErrors({ ...v2Payload, sessions: [] }).length > 0);
  assert.ok(specialTrainingV2InputErrors({ ...v2Payload, sessions: [
    v2Payload.sessions[0], { ...v2Payload.sessions[1], sessionId: v2Payload.sessions[0].sessionId }
  ] }).length > 0);
  assert.ok(specialTrainingV2InputErrors({ ...v2Payload, sessions: [
    { ...v2Payload.sessions[0], date: "2026-10-26" }
  ] }).length > 0);
  assert.match(generateSpecialTrainingSessionId(), /^sts1_[A-Za-z0-9_-]{22}$/);
});

test("Special-training v2 signs and verifies with the common P-256 64-byte primitive", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const keyId = await calculateKeyId(spki);
  const bootstrap = parseTrustedKeyBootstrap(JSON.stringify({
    schema: "samsungdang-dojolog-trusted-key-bootstrap", schemaVersion: 1,
    purpose: "credential-v1-initial-trust-provisioning", keyId,
    algorithm: "ECDSA-SHA-256", curve: "P-256", publicKeyFormat: "X.509 SubjectPublicKeyInfo DER",
    publicKeySpkiBase64Url: encodeUnpaddedBase64Url(spki), publicKeyByteLength: spki.length,
    trustStatus: "pending-member-pwa-distribution", intendedRegistryStatus: "active",
    generatedOrReused: "reused", androidKeyStoreUsed: true, privateKeyEncodedIsNull: true
  })) as TrustedKeyBootstrap;
  const signed = { ...specialCommon, credentialVersion: 2 as const, keyId, payload: v2Payload };
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey,
    new TextEncoder().encode(canonicalizeSpecialTrainingV2Signed(signed))
  ));
  assert.equal(signature.byteLength, 64);
  const credential = parseSpecialTrainingV2Credential(JSON.stringify({ signed, signature: encodeUnpaddedBase64Url(signature) }));
  assert.equal(await verifySpecialTrainingV2Credential(credential, bootstrap), true);
  const tampered = structuredClone(credential);
  tampered.signed.payload.sessions[0].label = "변조";
  assert.equal(await verifySpecialTrainingV2Credential(tampered, bootstrap), false);
});

test("Special-training v2 chooses raw then gz1 as needed and QR decodes the exact displayed link", async () => {
  const credential = parseSpecialTrainingV2Credential(JSON.stringify({
    signed: { ...specialCommon, credentialVersion: 2, payload: v2Payload },
    signature: encodeUnpaddedBase64Url(new Uint8Array(64))
  })) as SpecialTrainingV2Credential;
  assert.doesNotMatch(await createSpecialTrainingV2TransportToken(credential), /^gz1\./);
  const expanded = structuredClone(credential);
  expanded.signed.payload.sessions = Array.from({ length: 28 }, (_, index) => ({
    sessionId: `sts1_${encodeUnpaddedBase64Url(new Uint8Array(16).fill(index + 1))}`,
    date: index % 2 ? "2026-10-25" : "2026-10-24",
    label: `반복 가능한 긴 session 표시 ${index} ${"가나다라마바사".repeat(8)}`
  }));
  const token = await createSpecialTrainingV2TransportToken(expanded);
  assert.match(token, /^gz1\./);
  const link = await createSpecialTrainingV2ProductionLink(expanded);
  assert.equal(new URL(link).searchParams.get("credential"), token);
  const png = PNG.sync.read(Buffer.from((await createSpecialTrainingQrDataUrl(link)).split(",")[1], "base64"));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, link);
});

test("Instructor event memo stays keyed by eventId and outside signed credential/Backup v1", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
  saveInstructorEventMemo(eventId, "correction에도 유지", storage, () => "2026-10-24T00:00:00.000Z");
  assert.deepEqual(loadInstructorEventMemo(eventId, storage), {
    memo: "correction에도 유지", updatedAt: "2026-10-24T00:00:00.000Z"
  });
  assert.ok(values.has(INSTRUCTOR_EVENT_MEMO_STORAGE_KEY));
  assert.doesNotMatch(JSON.stringify(v2Payload), /correction에도 유지/);
  assert.doesNotMatch(serializeBackup({ logs: [], lastSession: 1010 }, "0.9.9"), new RegExp(INSTRUCTOR_EVENT_MEMO_STORAGE_KEY));
});
