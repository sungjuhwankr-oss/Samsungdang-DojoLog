import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { KATAS } from "../app/data";
import {
  ONBOARDING_KATA_OPTIONS,
  serializeKataBaselines
} from "../app/credential-issuer/onboarding-form";
import { orderHombuKatas } from "../app/kata-presentation";
import { PICKER_KATAS } from "../app/plan-units";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../app/page.tsx");
const issuer = read("../app/credential-issuer/issuer-workspace.tsx");
const onboarding = read("../app/credential-issuer/onboarding-issuer.tsx");
const special = read("../app/credential-issuer/special-training-v2-issuer.tsx");
const css = `${read("../app/extra.css")}\n${read("../app/add-panel.css")}`;

test("R3-01 closes only the technical-tools disclosure on credential workspace entry", () => {
  assert.match(page, /<CredentialIssuerPage embedded active=\{view==="credential"&&active\}/);
  // R4 supersedes the keyed disclosure: keep all issuer children mounted.
  assert.match(issuer, /<CredentialWorkspace title="기술 검증 도구" active=\{active\}>/);
  assert.match(page, /credentialMounted&&<div hidden=\{view!=="credential"\}/);
  assert.doesNotMatch(`${issuer}\n${onboarding}\n${special}`, /localStorage|sessionStorage|indexedDB/i);
});

test("R3-02 distinguishes unknown, zero, and transient empty Kata counts", () => {
  const kataId = ONBOARDING_KATA_OPTIONS[0].id;
  assert.deepEqual(serializeKataBaselines([{ kataId, count: null }]), [{ kataId, count: null }]);
  assert.deepEqual(serializeKataBaselines([{ kataId, count: 0 }]), [{ kataId, count: 0 }]);
  assert.throws(() => serializeKataBaselines([{ kataId, count: "" }]), /kata baseline count is required/);
  assert.match(onboarding, /event\.target\.checked \? null : ""/);
  assert.match(onboarding, /event\.target\.value === "" \? "" : Number/);
});

test("R3-03 and R3-08 reuse Hombu presentation ordering without mutating identity or plan order", () => {
  const canonicalBefore = KATAS.map(kata => kata.id);
  const pickerBefore = PICKER_KATAS.map(kata => kata.id);
  assert.deepEqual(ONBOARDING_KATA_OPTIONS.map(item => item.id), orderHombuKatas(KATAS).map(kata => kata.id));
  assert.deepEqual([...ONBOARDING_KATA_OPTIONS.map(item => item.id)].sort(), [...canonicalBefore].sort());
  assert.match(page, /orderHombuKatas\(PICKER_KATAS\.filter\(k=>k\.categoryId===group\.id\)\)/);
  assert.deepEqual(KATAS.map(kata => kata.id), canonicalBefore);
  assert.deepEqual(PICKER_KATAS.map(kata => kata.id), pickerBefore);
});

test("R3-04 resets the onboarding file input so the same JSON can be selected again", () => {
  // R4 routes both native SAF and web reselection through the shared reader.
  assert.match(onboarding, /openCredentialFile\(fileInputRef\.current\)/);
  assert.match(onboarding, /if \(selected\) await loadPrevious\(selected\)/);
  assert.match(read("../app/backup-file.ts"), /input\.value = ""/);
  assert.match(onboarding, /finally \{\s*setBusy\(false\);\s*\}/);
});

test("R3-05 adds a visible v1-v2 correction JSON picker while retaining the verifier", () => {
  for (const text of ["기존 특별수련 전자 증명서 JSON", "JSON 파일 선택", "서명 검증 후 불러오기"]) assert.ok(special.includes(text));
  assert.match(special, /parseSpecialTrainingCredential\(importJson\)/);
  assert.match(special, /parseSpecialTrainingV2Credential\(importJson\)/);
  assert.match(special, /verifySpecialTrainingCredential\(old, bootstrap\)/);
  assert.match(special, /verifySpecialTrainingV2Credential\(old, bootstrap\)/);
  assert.match(special, /revision: old\.signed\.payload\.revision \+ 1, supersedesCredentialId: old\.signed\.credentialId/);
});

test("R3-06 gives native expandable regions a visible state indicator", () => {
  assert.match(css, /\.credential-shell details > summary::after/);
  assert.match(css, /details\[open\] > summary::after \{ transform: rotate\(180deg\)/);
  assert.match(special, /<details className="credential-disclosure">/);
});

test("R3-07 keeps one exact original-journal navigation and presents it as an action", () => {
  assert.equal((page.match(/openOriginalLog\(log\.id\)/g) ?? []).length, 1);
  assert.ok(page.includes('className="ghost original-log-button" onClick={event=>{event.stopPropagation();openOriginalLog(log.id)}}><History/>원본 수업일지 보기'));
  assert.match(css, /\.original-log-button \{[^}]*width: 100%/);
});

test("R3-09 makes registered Kata primary and auxiliary Kata secondary", () => {
  assert.match(page, /className="registered-add" onClick=\{addSelected\}>등록된 카타 추가/);
  assert.match(page, /className="custom-add" onClick=\{addCustom\}>확장·보조 카타로 추가/);
  assert.match(css, /\.registered-add\{border:0;background:var\(--green\)/);
  assert.match(css, /\.custom-add\{border:1px dashed/);
});

test("R3-10 moves QR sharing into the journal action group without changing its handler", () => {
  assert.match(page, /<div className="log-actions">\{log\.session[\s\S]*className="share"[\s\S]*shareLog\(log\)/);
  assert.equal((page.match(/shareLog\(log\)/g) ?? []).length, 1);
  assert.doesNotMatch(page, /session-share-button/);
  assert.match(page, /createShortestImportLink\(payload\)/);
});

test("R3-11 and R3-12 keep reorder actions above navigation and hide only the ordinary list", () => {
  assert.match(page, /className="session-order-actions persistent-actions"/);
  assert.match(page, /\{!sessionOrder&&\(!logs\.length\?/);
  assert.match(css, /\.session-order-actions\.persistent-actions \{[^}]*top: 72px/);
  assert.match(page, /function saveSessionOrder\(\).*setSessionOrder\(null\)/);
});

test("R3-13 places edit cancel and save together while cancel leaves journals untouched", () => {
  assert.match(page, /action-grid edit-actions persistent-actions[\s\S]*수정 취소[\s\S]*수정사항 저장/);
  const reset = page.slice(page.indexOf("function resetEditor()"), page.indexOf("function save("));
  assert.doesNotMatch(reset, /setLogs|setLastSession|localStorage|sessionStorage/);
  assert.match(css, /\.edit-actions \{[^}]*grid-template-columns: 1fr 1\.4fr/);
  assert.match(css, /\.edit-actions \{[^}]*position: fixed;[^}]*bottom: calc\(82px \+ env\(safe-area-inset-bottom\)\)/);
});

test("R3-14 uses the exact Instructor label without changing the beginner route", () => {
  const nav = read("../app/instructor-bottom-nav.tsx");
  assert.match(nav, /id: "beginner", label: "초심자용 교본"/);
  assert.match(page, /tab==="beginner"[\s\S]*<h2>초심자용 교본<\/h2>/);
  assert.doesNotMatch(`${nav}\n${page}`, /초심자 동영상/);
  assert.match(nav, /href=\{`\/\?tab=\$\{id\}`\}/);
});
