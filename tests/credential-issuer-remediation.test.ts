import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildOnboardingPayload,
  createPreviousRankRow,
  nextKataBaseline,
  ONBOARDING_KATA_OPTIONS,
  updateKataBaseline,
  updatePreviousRankRow
} from "../app/credential-issuer/onboarding-form";
import { issuerFailure, koreanInputError, koreanInputErrors } from "../app/credential-issuer/presentation";
import { normalizeOnboardingMemberId, validateMemberOnboardingPayload } from "../app/onboarding-credential";

const binaryId = (prefix: string, character: string) => `${prefix}${character.repeat(22)}`;
const catalog = JSON.parse(readFileSync(new URL("../reference/kata-catalog.v2.json", import.meta.url), "utf8")) as {
  kata: Array<{ id: string; nameKo: string }>;
};

test("expected issuer validation errors become Korean actionable messages without raw English leakage", () => {
  const cases = [
    ["eventId must be st1_ plus 16 random bytes as unpadded base64url", "행사 ID가 올바르지 않습니다. 새 행사 ID를 생성해 주세요."],
    ["invalid title", "행사명을 입력해 주세요."],
    ["invalid instructor", "지도자명을 입력해 주세요."],
    ["memberId must contain digits or canonical ASD- digits", "회원번호를 숫자 또는 ASD-숫자 형식으로 입력해 주세요."],
    ["recognized ranks must be strictly ascending", "이전 인정 단급부터 현재 단급까지 낮은 단급에서 높은 단급 순서로 입력해 주세요."],
    ["invalid or duplicate canonical kataId", "카타는 목록에서 중복 없이 선택해 주세요."],
    ["session date is outside event range", "수련 회차 날짜를 행사 기간 안으로 입력해 주세요."]
  ] as const;
  for (const [raw, expected] of cases) {
    assert.deepEqual(koreanInputError(raw), { message: expected, diagnostic: null });
  }
  assert.deepEqual(koreanInputErrors(["invalid title", "invalid title"]), [
    { message: "행사명을 입력해 주세요.", diagnostic: null }
  ]);
});

test("unexpected issuer failures keep a Korean primary message and separate technical diagnostic", () => {
  assert.deepEqual(issuerFailure(new Error("native bridge unavailable"), "전자 증명서 발급에 실패했습니다."), {
    message: "전자 증명서 발급에 실패했습니다.",
    diagnostic: "native bridge unavailable"
  });
  assert.deepEqual(koreanInputError("unexpected validator state"), {
    message: "입력값을 확인해 주세요.",
    diagnostic: "unexpected validator state"
  });
  assert.deepEqual(issuerFailure(new Error("special-training eventId changed during issuance"), "특별수련 전자 증명서 생성에 실패했습니다."), {
    message: "특별수련 전자 증명서 생성에 실패했습니다.",
    diagnostic: "special-training eventId changed during issuance"
  });
});

test("previous-rank rows keep imported and generated entryId across field edits", () => {
  const importedId = binaryId("or1_", "A");
  const imported = createPreviousRankRow(importedId);
  const changedType = updatePreviousRankRow([imported], 0, { rankType: "dan" });
  const changedValue = updatePreviousRankRow(changedType, 0, { rankValue: 2, rankDate: "2020-01-02" });
  assert.equal(changedType[0].entryId, importedId);
  assert.equal(changedValue[0].entryId, importedId);
  assert.deepEqual(changedValue[0], {
    entryId: importedId, rankType: "dan", rankValue: 2, rankDate: "2020-01-02"
  });
});

test("structured onboarding rows produce the unchanged payload shape and ASD-000 identity", () => {
  const previous = createPreviousRankRow(binaryId("or1_", "B"));
  const currentEntryId = binaryId("or1_", "C");
  const kataBaselines = [{ kataId: catalog.kata[0].id, count: null }];
  const payload = buildOnboardingPayload({
    onboardingId: binaryId("on1_", "D"),
    revision: 1,
    supersedesCredentialId: null,
    recognizedAt: "2026-10-08",
    name: "테스트회원",
    memberId: normalizeOnboardingMemberId("0"),
    joinedAt: "2015-12-06",
    previousRanks: [previous],
    currentRankEntryId: currentEntryId,
    currentRankType: "kyu",
    currentRankValue: 8,
    currentRankDate: null,
    baselineAsOf: "2026-10-08",
    currentRankSessionBaseline: null,
    kataBaselines
  });
  validateMemberOnboardingPayload(payload);
  assert.equal(payload.membership.memberId, "ASD-000");
  assert.deepEqual(payload.recognizedRanks.map(rank => rank.entryId), [previous.entryId, currentEntryId]);
  assert.equal(payload.currentRankEntryId, currentEntryId);
  assert.deepEqual(payload.kataBaselines, kataBaselines);
  assert.deepEqual(Object.keys(payload), [
    "onboardingId", "revision", "supersedesCredentialId", "recognizedAt", "membership",
    "recognizedRanks", "currentRankEntryId", "baselineAsOf", "currentRankSessionBaseline", "kataBaselines"
  ]);
});

test("Kata baseline picker projects canonical v2 IDs, names, order, unknown count, and no duplicate default", () => {
  assert.deepEqual(ONBOARDING_KATA_OPTIONS, catalog.kata.map(item => ({ id: item.id, name: item.nameKo })));
  const first = nextKataBaseline([])!;
  const second = nextKataBaseline([first])!;
  assert.deepEqual(first, { kataId: catalog.kata[0].id, count: null });
  assert.deepEqual(second, { kataId: catalog.kata[1].id, count: null });
  const known = updateKataBaseline([first], 0, { count: 0 });
  assert.deepEqual(known, [{ kataId: catalog.kata[0].id, count: 0 }]);
  assert.equal(nextKataBaseline(catalog.kata.map(item => ({ kataId: item.id, count: null }))), null);
});
