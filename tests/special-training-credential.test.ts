import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

import {
  calculateKeyId,
  canonicalizeSpecialTrainingSigned,
  createCredentialId,
  createCredentialTransportToken,
  createSpecialTrainingEventId,
  decodeCanonicalBase64Url,
  encodeUnpaddedBase64Url,
  generateSpecialTrainingEventId,
  parseSpecialTrainingCredential,
  parseTrustedKeyBootstrap,
  specialTrainingInputErrors,
  verifySpecialTrainingCredential,
  type SpecialTrainingCredential,
  type SpecialTrainingPayload,
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
  createSpecialTrainingSavedQrDataUrl
} from "../app/special-training-output";

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

test("Android bridge and issuer UI add only stateless test-only special issuance", async () => {
  const bridge = await readFile(new URL("../android/CredentialIssuerBridge.java", import.meta.url), "utf8");
  const issuerPage = await readFile(new URL("../app/credential-issuer/page.tsx", import.meta.url), "utf8");
  assert.match(bridge, /issueSpecialTrainingCredential/);
  assert.match(bridge, /run\("issue-special-training"/);
  assert.match(bridge, /requireExactKeys\(payload, "eventId", "title", "category", "startDate",\s*"endDate", "instructor"\)/);
  assert.match(bridge, /return signCredential\("special-training"/);
  assert.equal((bridge.match(/StrictEcdsaDer\.toP256Raw/g) ?? []).length, 1);
  assert.match(issuerPage, /const eventIdBeforeIssuance = specialPayload\.eventId/);
  assert.match(issuerPage, /credentialId was unexpectedly reused/);
  assert.match(issuerPage, /createSpecialTrainingSavedQrDataUrl\(specialQrDataUrl, productionLink\)/);
  assert.match(issuerPage, /실제 운영용 특별수련 Credential 발급 — actual E2E 완료 전 비활성/);
  assert.match(issuerPage, /QR PNG 저장/);
  assert.doesNotMatch(issuerPage, /Production HTTPS link|copySpecialTrainingLink|link 복사|shareSpecialTrainingQr|QR PNG 공유/);
  assert.doesNotMatch(issuerPage, /localStorage|indexedDB|issuedCredential|credentialLedger|deleteEntry/);
});
