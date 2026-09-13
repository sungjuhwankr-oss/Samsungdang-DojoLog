import assert from "node:assert/strict";
import test from "node:test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { KATAS, bandText } from "../app/data";
import type { DojoLog } from "../app/backup";
import {
  SESSION_SHARE_DOJO,
  SESSION_SHARE_SCHEMA,
  SESSION_SHARE_VERSION,
  createBandShareText,
  createImportLink,
  createQrContent,
  createSessionSharePayload,
  decodeImportLink,
  serializeSessionSharePayload,
} from "../app/session-share";
import { createQrDataUrl } from "../app/session-share-card";
import { hasNativeSessionShare, shareSessionCard, type ShareHost } from "../app/session-share-file";

const katas = KATAS.slice(0, 7);
const log: DojoLog = {
  id: "confirmed",
  date: "2026-09-13",
  session: 1042,
  status: "완료",
  recordType: "detailed",
  participants: [7, 1],
  katas: katas.slice(0, 5),
  note: "공유 테스트",
  createdAt: "2026-09-13T09:00:00.000Z",
};
const baseUrl = "https://dojolog.example.test";

test("creates the fixed session interchange payload from a confirmed log", () => {
  const payload = createSessionSharePayload(log);
  assert.equal(payload.schema, SESSION_SHARE_SCHEMA);
  assert.equal(payload.version, SESSION_SHARE_VERSION);
  assert.equal(payload.dojo, SESSION_SHARE_DOJO);
  assert.equal(payload.sessionNo, 1042);
  assert.equal(payload.date, "2026-09-13");
  assert.deepEqual(payload.kata, log.katas.map(({ id, name }) => ({ id, name })));
});

test("uses stable canonical kata ids, preserves order, and rejects duplicates", () => {
  const payload = createSessionSharePayload(log);
  assert.deepEqual(payload.kata.map(item => item.id), log.katas.map(item => item.id));
  assert.ok(payload.kata.every(item => item.name.length > 0));
  assert.throws(() => createSessionSharePayload({ ...log, katas: [log.katas[0], log.katas[0]] }));
});

test("rejects cancelled, session-only, and unconfirmed records", () => {
  assert.throws(() => createSessionSharePayload({ ...log, status: "취소" }));
  assert.throws(() => createSessionSharePayload({ ...log, recordType: "sessionOnly", katas: [] }));
  assert.throws(() => createSessionSharePayload({ ...log, session: undefined }));
});

test("serialization and import links are deterministic and UTF-8 safe", () => {
  const payload = createSessionSharePayload(log);
  const first = serializeSessionSharePayload(payload);
  assert.equal(first, serializeSessionSharePayload(payload));
  const link = createImportLink(payload, baseUrl)!;
  assert.equal(link, createImportLink(payload, baseUrl));
  assert.deepEqual(decodeImportLink(link), payload);
  assert.match(link, /^https:\/\/dojolog\.example\.test\/import#session=/);
});

test("creates practical links for five, seven, and long Korean kata names", () => {
  for (const source of [
    log,
    { ...log, katas },
    { ...log, katas: katas.map((kata, index) => ({ ...kata, id: `long-${index}`, name: `${kata.name} 매우 긴 한국어 수련 카타 이름 ${index + 1}` })) },
  ]) {
    const payload = createSessionSharePayload(source);
    const link = createImportLink(payload, baseUrl)!;
    assert.deepEqual(decodeImportLink(link), payload);
    assert.ok(link.length < 4096);
  }
});

test("QR encodes the exact import link", async () => {
  const payload = createSessionSharePayload(log);
  const link = createImportLink(payload, baseUrl)!;
  const dataUrl = await createQrDataUrl(createQrContent(payload, link));
  const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, link);
});

test("QR falls back to the same serialized payload when no public endpoint exists", () => {
  const payload = createSessionSharePayload(log);
  assert.equal(createImportLink(payload, ""), null);
  assert.equal(createQrContent(payload, null), serializeSessionSharePayload(payload));
});

test("BAND share text prepends the import block without changing its existing body", () => {
  const link = createImportLink(createSessionSharePayload(log), baseUrl)!;
  const text = createBandShareText(log, link);
  const original = bandText(log.date, log.session!, log.katas);
  assert.ok(text.startsWith(`[회원용 DojoLog 수련기록 가져오기]\n\n▶ 링크로 가져오기\n${link}`));
  assert.ok(text.endsWith(original));
  assert.equal(text.slice(text.length - original.length), original);
});

test("missing endpoint produces an honest notice rather than a fake URL", () => {
  const text = createBandShareText(log, null);
  assert.match(text, /회원용 앱 공개 링크 준비 중/);
  assert.ok(text.endsWith(bandText(log.date, log.session!, log.katas)));
});

test("native bridge absence is safe and native sharing passes text and PNG once", async () => {
  const absent = new EventTarget() as ShareHost;
  assert.equal(hasNativeSessionShare(absent), false);
  assert.equal(await shareSessionCard("text", "data:image/png;base64,AA==", "card.png", absent), "unavailable");
  const calls: unknown[][] = [];
  const target = new EventTarget() as ShareHost;
  target.SamsungdangBackupBridge = { shareSession: (...args) => {
    calls.push(args);
    target.dispatchEvent(new CustomEvent("samsungdang-share-result", { detail: { status: "success" } }));
  } };
  assert.equal(await shareSessionCard("text", "data:image/png;base64,AA==", "card.png", target), "shared");
  assert.deepEqual(calls, [["text", "AA==", "card.png"]]);
});

test("payload and share helpers do not mutate the journal state", () => {
  const before = structuredClone(log);
  const payload = createSessionSharePayload(log);
  createImportLink(payload, baseUrl);
  createBandShareText(log, null);
  assert.deepEqual(log, before);
});
