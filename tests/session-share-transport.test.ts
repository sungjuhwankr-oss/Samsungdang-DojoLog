import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { KATAS } from "../app/data";
import { AWASE_BUNDLES, expandPlan } from "../app/plan-units";
import { createBandShareText, createImportLink, createQrContent, createSessionSharePayload, type SessionSharePayload } from "../app/session-share";
import { createQrDataUrl } from "../app/session-share-card";
import { createSessionShareCandidates, createShortestImportLink, selectSessionShareLink, SESSION_TOKEN_LIMIT, SESSION_COMPRESSED_LIMIT, SESSION_SOURCE_LIMIT } from "../app/session-share-transport";
// Read-only exact production D1 decoder snapshot; provenance is pinned below.
import { parseSessionHashAsync } from "./fixtures/member-d1/session-share.mjs";

const fixtureRoot = new URL("./fixtures/member-d1/", import.meta.url);
const fixture = JSON.parse(readFileSync(new URL("session-share-v1-transport.json", fixtureRoot), "utf8"));
const log = { id: "d2", date: "2026-10-07", session: 1050, status: "완료" as const, recordType: "detailed" as const, participants: [], note: "", createdAt: "2026-10-07T00:00:00Z", katas: KATAS.slice(0, 5) };
const normal = createSessionSharePayload(log);

async function d1(link: string, payload: SessionSharePayload) {
  const native = await parseSessionHashAsync(new URL(link).hash);
  assert.equal(native.ok, true, JSON.stringify(native));
  assert.deepEqual(native.payload, payload);
  const original = globalThis.DecompressionStream;
  try {
    Object.defineProperty(globalThis, "DecompressionStream", { value: undefined, configurable: true });
    assert.deepEqual(await parseSessionHashAsync(new URL(link).hash), native);
  } finally {
    Object.defineProperty(globalThis, "DecompressionStream", { value: original, configurable: true });
  }
}

async function withGzip<T>(compress: (input: Uint8Array) => Uint8Array, action: () => Promise<T>): Promise<T> {
  const original = globalThis.CompressionStream;
  // Inject a valid gzip producer to exercise candidate sizes independently of
  // the platform's compression level (stored DEFLATE and optional gzip fields).
  class GzipStream extends TransformStream<Uint8Array, Uint8Array> {
    constructor(format: string) {
      assert.equal(format, "gzip");
      super({ transform(input, controller) { controller.enqueue(compress(input)); } });
    }
  }
  try {
    Object.defineProperty(globalThis, "CompressionStream", { value: GzipStream, configurable: true });
    return await action();
  } finally {
    Object.defineProperty(globalThis, "CompressionStream", { value: original, configurable: true });
  }
}

function gzipWithLength(input: Uint8Array, length: number): Uint8Array {
  const gzip = gzipSync(input), header = Buffer.from(gzip.subarray(0, 10));
  header[3] |= 4;
  const extra = length - gzip.length - 2;
  assert.ok(extra >= 0 && extra <= 65535);
  const size = Buffer.alloc(2); size.writeUInt16LE(extra);
  return Buffer.concat([header, size, Buffer.alloc(extra), gzip.subarray(10)]);
}

function boundaryPayload(): SessionSharePayload {
  const result = { ...normal, kata: Array.from({ length: 40 }, (_, i) => ({ id: `poc-${i}`, name: "가".repeat(55) })) };
  let remaining = SESSION_SOURCE_LIMIT - Buffer.byteLength(JSON.stringify(result));
  for (const kata of result.kata) {
    const count = Math.min(remaining, 200 - kata.name.length);
    kata.name += "a".repeat(count); remaining -= count;
  }
  assert.equal(remaining, 0);
  return result;
}

test("D2 oracle files are unchanged exact D1 production source/fixture snapshots", () => {
  const provenance = JSON.parse(readFileSync(new URL("provenance.json", fixtureRoot), "utf8"));
  assert.equal(provenance.commit, "53d76e0be401074d1d50f538f6d384beecea219e");
  for (const [name, hash] of Object.entries(provenance.sha256)) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(name, fixtureRoot))).digest("hex"), hash);
  }
});

test("D2 preserves the distributed legacy raw URL byte-for-byte and route semantics", async () => {
  assert.equal(createImportLink(fixture.payload), fixture.legacyUrl);
  await d1(fixture.legacyUrl, fixture.payload);
  for (const base of ["https://dojolog.example.test", "https://dojolog.example.test/import/", "https://dojolog.example.test/import/?old=1#old"]) {
    const candidates = await createSessionShareCandidates(normal, base);
    assert.equal(candidates.raw, createImportLink(normal, base));
    assert.equal(new URL(candidates.compressed!).pathname, "/import/");
    assert.equal(new URL(candidates.compressed!).search, "");
  }
});

const roundTrips: [string, SessionSharePayload][] = [
  ["five Kata", normal],
  ["awase 15", createSessionSharePayload({ ...log, katas: expandPlan(AWASE_BUNDLES) })],
  ["50 Kata", createSessionSharePayload({ ...log, katas: KATAS.slice(0, 50) })],
  ["Korean UTF-8 and emoji", { ...normal, sessionNo: Number.MAX_SAFE_INTEGER, date: "2028-02-29", kata: [{ id: "한국어-😀", name: "한글 카타 😀" }] }],
];
for (const [label, payload] of roundTrips) {
  test(`D2 ${label} gzip round-trips through D1 native/fallback with exact fields and order`, async () => {
    const candidates = await createSessionShareCandidates(payload);
    assert.ok(candidates.raw && candidates.compressed);
    const token = new URL(candidates.compressed).hash.slice(9);
    assert.match(token, /^gz1\.[A-Za-z0-9_-]+$/);
    const encoded = token.slice(4), bytes = Buffer.from(encoded, "base64url");
    assert.equal(encoded, bytes.toString("base64url"));
    assert.equal(bytes[0], 31); assert.equal(bytes[1], 139); assert.equal(bytes[2], 8);
    assert.equal(gunzipSync(bytes).toString("utf8"), JSON.stringify(payload));
    await d1(candidates.raw, payload); await d1(candidates.compressed, payload);
    assert.ok(candidates.compressed.length < candidates.raw.length);
    assert.equal(await createShortestImportLink(payload), candidates.compressed);
  });
}

test("D2 awase remains 15 ordered individual canonical IDs and names", async () => {
  const payload = createSessionSharePayload({ ...log, katas: expandPlan(AWASE_BUNDLES) });
  assert.deepEqual(payload.kata.map(k => k.id), AWASE_BUNDLES.flatMap(b => b.canonicalIds));
  assert.equal(payload.kata.length, 15);
  await d1(await createShortestImportLink(payload), payload);
});

test("D2 shorter raw wins over valid stored-DEFLATE gzip, with exact BAND/decoded QR identity", async () => {
  await withGzip(input => gzipSync(input, { level: 0 }), async () => {
    const candidates = await createSessionShareCandidates(normal);
    assert.ok(candidates.raw && candidates.compressed && candidates.raw.length < candidates.compressed.length);
    await d1(candidates.compressed, normal);
    const final = await createShortestImportLink(normal);
    assert.equal(final, candidates.raw);
    await bandQr(log, final);
  });
});

test("D2 equal actual URL lengths prefer raw", async () => {
  // raw base64 length equals prefix + gzip base64 length when c = source - 3.
  await withGzip(input => gzipWithLength(input, input.length - 3), async () => {
    const candidates = await createSessionShareCandidates(normal);
    assert.ok(candidates.raw && candidates.compressed);
    assert.equal(candidates.raw.length, candidates.compressed.length);
    await d1(candidates.compressed, normal);
    assert.equal(await createShortestImportLink(normal), candidates.raw);
  });
});

test("D2 only-valid candidate wins, both invalid reject, repeated selection is deterministic", async () => {
  assert.equal(selectSessionShareLink({ raw: null, compressed: "https://a.test/#session=gz1.AA" }), "https://a.test/#session=gz1.AA");
  assert.equal(selectSessionShareLink({ raw: "https://a.test/#session=AA", compressed: null }), "https://a.test/#session=AA");
  assert.throws(() => selectSessionShareLink({ raw: null, compressed: null }));
  assert.equal(await createShortestImportLink(normal), await createShortestImportLink(normal));
});

async function bandQr(record: typeof log, final: string) {
  const payload = createSessionSharePayload(record);
  const text = createBandShareText(record, final);
  const qr = await createQrDataUrl(createQrContent(payload, final));
  const png = PNG.sync.read(Buffer.from(qr.split(",")[1], "base64"));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, final);
  assert.equal(text.split("\n").at(-1), final);
}

test("D2 compressed production URL is the exact BAND and decoded QR string", async () => {
  const final = await createShortestImportLink(normal);
  assert.match(new URL(final).hash, /^#session=gz1\./);
  await bandQr(log, final);
});

test("D2 compression API absence, unsupported format, partial API and stream failure retain raw", async () => {
  const original = globalThis.CompressionStream;
  const cases = [undefined, class { constructor() { throw new Error("unsupported"); } }, class {}, class extends TransformStream {
    constructor() { super({ transform() { throw new Error("stream failed"); } }); }
  }];
  try {
    for (const value of cases) {
      Object.defineProperty(globalThis, "CompressionStream", { value, configurable: true });
      assert.deepEqual(await createSessionShareCandidates(normal), { raw: createImportLink(normal), compressed: null });
      assert.equal(await createShortestImportLink(normal), createImportLink(normal));
    }
  } finally { Object.defineProperty(globalThis, "CompressionStream", { value: original, configurable: true }); }
});

test("D2 exact compressed 12285-byte / token 16384-char boundary is D1 compatible; 12286 falls back raw", async () => {
  await withGzip(input => gzipWithLength(input, SESSION_COMPRESSED_LIMIT), async () => {
    const candidates = await createSessionShareCandidates(normal);
    assert.ok(candidates.compressed);
    assert.equal(new URL(candidates.compressed).hash.slice(9).length, SESSION_TOKEN_LIMIT);
    await d1(candidates.compressed, normal);
    assert.equal(await createShortestImportLink(normal), candidates.raw);
  });
  await withGzip(input => gzipWithLength(input, SESSION_COMPRESSED_LIMIT + 1), async () => {
    const candidates = await createSessionShareCandidates(normal);
    assert.equal(candidates.compressed, null);
    assert.equal(await createShortestImportLink(normal), candidates.raw);
  });
});

test("D2 8192-byte logical source is accepted by D1; 8193 rejects both candidates", async () => {
  const payload = boundaryPayload();
  assert.equal(Buffer.byteLength(JSON.stringify(payload)), SESSION_SOURCE_LIMIT);
  const candidates = await createSessionShareCandidates(payload);
  await d1(candidates.raw!, payload); await d1(candidates.compressed!, payload);
  payload.kata[0].name += "a";
  assert.deepEqual(await createSessionShareCandidates(payload), { raw: null, compressed: null });
  await assert.rejects(createShortestImportLink(payload));
});

test("D2 uses D1 logical acceptance for zero/51 Kata, invalid date/session, blank/oversize strings", async () => {
  for (const payload of [
    { ...normal, kata: [] }, { ...normal, kata: Array.from({ length: 51 }, (_, i) => ({ id: `${i}`, name: "カタ" })) },
    { ...normal, date: "2026-02-29" }, { ...normal, date: "2026-13-01" },
    { ...normal, sessionNo: 0 }, { ...normal, sessionNo: Number.MAX_SAFE_INTEGER + 1 },
    { ...normal, kata: [{ id: " ", name: "カタ" }] }, { ...normal, kata: [{ id: "kata", name: "a".repeat(201) }] },
  ]) {
    assert.equal((await parseSessionHashAsync(new URL(createImportLink(payload)).hash)).ok, false);
    assert.deepEqual(await createSessionShareCandidates(payload), { raw: null, compressed: null });
    await assert.rejects(createShortestImportLink(payload));
  }
});

test("D2 snapshots before compression without mutating payload/journal or mixing candidate contents", async () => {
  const before = structuredClone(log);
  const payload = createSessionSharePayload(log), expected = structuredClone(payload);
  const pending = createSessionShareCandidates(payload);
  payload.kata.reverse();
  const candidates = await pending;
  await d1(candidates.raw!, expected); await d1(candidates.compressed!, expected);
  assert.deepEqual(log, before);
});

test("D2 production copy/share call sites await one final link and preserve the text/QR/bridge flow", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal(page.match(/importLink=await createShortestImportLink\(payload\)/g)?.length, 2);
  assert.match(page, /importLink=await createShortestImportLink\(payload\),qrContent=createQrContent\(payload,importLink\),image=await createSessionShareCard\(payload,qrContent\)/);
  assert.match(page, /text=sharedBandText\(log,importLink\),result=await shareSessionCard\(text,image,filename\)/);
  assert.match(page, /setSharePreview\(\{image,filename,importLink,text\}\)/);
  assert.doesNotMatch(page, /createImportLink\(/);
});
