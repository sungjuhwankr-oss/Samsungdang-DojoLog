// Separate DOM interaction gate, with no production dependency or package change.
// node --import tsx tests/instructor-r4.dom.mjs /path/to/happy-dom/lib/index.js [Member-repo]
// This uses an ephemeral mock signer, never Android Keystore or actual member data.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as tick } from "node:timers/promises";
import {
  calculateKeyId, canonicalizeMembershipSigned, canonicalizeSpecialTrainingSigned, canonicalizeSpecialTrainingV2Signed,
  createCredentialId, createCredentialTransportToken, encodeUnpaddedBase64Url
} from "../app/credential-v1.ts";
import { canonicalizeMemberOnboardingSigned } from "../app/onboarding-credential.ts";

const { Window } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "happy-dom");
const window = new Window({ url: "http://localhost/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event", "CustomEvent", "MutationObserver", "localStorage", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? window : window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "crypto", { value: webcrypto });
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.hasPointerCapture = () => false;

const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const spki = new Uint8Array(await webcrypto.subtle.exportKey("spki", pair.publicKey));
const keyId = await calculateKeyId(spki);
const bootstrap = {
  schema: "samsungdang-dojolog-trusted-key-bootstrap", schemaVersion: 1, purpose: "credential-v1-initial-trust-provisioning",
  keyId, algorithm: "ECDSA-SHA-256", curve: "P-256", publicKeyFormat: "X.509 SubjectPublicKeyInfo DER",
  publicKeySpkiBase64Url: encodeUnpaddedBase64Url(spki), publicKeyByteLength: 91,
  trustStatus: "pending-member-pwa-distribution", intendedRegistryStatus: "active", generatedOrReused: "reused",
  androidKeyStoreUsed: true, privateKeyEncodedIsNull: true
};
async function sign(type, payload, version = 1) {
  const signed = { schema: "samsungdang-dojolog-credential", credentialVersion: version, issuer: "aikido-samsungdang", type,
    credentialId: createCredentialId(webcrypto.getRandomValues(new Uint8Array(16))), keyId, issuedAt: "2026-10-09T06:00:00Z", payload };
  const canonical = type === "membership" ? canonicalizeMembershipSigned : type === "member-onboarding" ? canonicalizeMemberOnboardingSigned
    : version === 2 ? canonicalizeSpecialTrainingV2Signed : canonicalizeSpecialTrainingSigned;
  const signature = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(canonical(signed))));
  return { signed, signature: encodeUnpaddedBase64Url(signature) };
}
const emit = (operation, extra = {}) => window.dispatchEvent(new window.CustomEvent("samsungdang-credential-result", {
  detail: { operation, status: "success", ...extra }
}));
let signCalls = 0, selected = null, openCalls = 0, saved = null;
window.SamsungdangCredentialBridge = {
  provisionProductionKey: () => emit("provision-key", { json: JSON.stringify(bootstrap) }),
  issueMembershipCredential: (name, memberId, joinedAt) => {
    signCalls++;
    void sign("membership", { name, memberId, joinedAt }).then(credential => emit("issue-membership", {
      json: JSON.stringify(credential), bootstrap: JSON.stringify(bootstrap), transportToken: createCredentialTransportToken(credential)
    }));
  },
  issuePromotionCredential: () => {}, issueSpecialTrainingCredential: () => {},
  issueSpecialTrainingV2Credential: () => {}, issueMemberOnboardingCredential: () => {}
};
window.SamsungdangBackupBridge = {
  openJson: () => { openCalls++; window.dispatchEvent(new window.CustomEvent("samsungdang-backup-result", {
    detail: { operation: "open", status: selected ? "success" : "cancel", ...selected }
  })); },
  saveJson: (filename, content) => { saved = { filename, content }; window.dispatchEvent(new window.CustomEvent("samsungdang-backup-result", { detail: { operation: "save", status: "success" } })); }
};

const { default: React, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: Home } = await import("../app/page.tsx");
const { ScrollControls } = await import("../app/scroll-controls.tsx");
const { PRIMARY_STORAGE_KEY } = await import("../app/backup.ts");
const rootElement = document.createElement("div"); document.body.append(rootElement);
const root = createRoot(rootElement);
const logs = [0, 1, 2].map(index => ({ id: `journal-${index}`, session: 1011 + index, date: `2026-10-0${index + 1}`, status: "완료",
  recordType: "detailed", participants: [7], katas: [], note: `보존 메모 ${index}`, createdAt: `2026-10-0${index + 1}T00:00:00Z` }));
localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify({ logs, lastSession: 1013 }));
await act(async () => { root.render(React.createElement(React.Fragment, null, React.createElement(Home), React.createElement(ScrollControls))); await tick(15); });
await act(async () => { await tick(15); });
const before = localStorage.getItem(PRIMARY_STORAGE_KEY);
const visible = element => !element.closest("[hidden]") && [...ancestors(element)].every(parent => parent.tagName !== "DETAILS" || parent.open);
function* ancestors(element) { for (let parent = element.parentElement; parent; parent = parent.parentElement) yield parent; }
const button = (label, scope = document) => {
  const matches = [...scope.querySelectorAll("button")].filter(element => visible(element) && element.textContent.trim() === label);
  assert.equal(matches.length, 1, `one visible button: ${label}`); return matches[0];
};
const click = async element => {
  assert.equal(element.disabled, false); await act(async () => { element.click(); await tick(20); });
  if (element.textContent.trim() === "JSON 파일 선택") {
    for (let attempt = 0; element.disabled && attempt < 30; attempt++) await act(async () => { await tick(20); });
    assert.equal(element.disabled, false, "file read/verification must return to idle");
  }
};
const nav = label => click([...document.querySelectorAll(".bottom-nav button")].find(element => element.textContent.trim() === label));
const workspace = title => [...document.querySelectorAll("details.credential-workspace")].find(element => element.querySelector("summary span").textContent === title);
const disclose = async (title, open = true) => { const element = workspace(title); await act(async () => { element.open = open; element.dispatchEvent(new window.Event("toggle")); await tick(5); }); return element; };
const values = scope => [...scope.querySelectorAll("input, select")].map(element => element.value);
const passed = [];
try {
  await nav("수업일지");
  await click(button("검색")); assert.equal([...document.querySelectorAll(".session-order-button")].length, 0);
  await click(button("메모")); assert.equal([...document.querySelectorAll(".session-order-button")].length, 0);
  await click(button("전체")); await click(button("회차 순서 편집"));
  const entryDates = [...document.querySelectorAll(".session-order-row small")].map(element => element.parentElement.textContent);
  async function drag() {
    const handle = document.querySelector(".session-order-row .drag-handle");
    await act(async () => { handle.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, pointerId: 1 })); });
    document.elementFromPoint = () => document.querySelector('[data-session-order-index="2"]');
    await act(async () => { handle.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 20, clientY: 20 })); });
  }
  await drag(); assert.notDeepEqual([...document.querySelectorAll(".session-order-row small")].map(element => element.parentElement.textContent), entryDates);
  await click(button("취소")); assert.ok(document.querySelector(".session-order-editor"));
  assert.deepEqual([...document.querySelectorAll(".session-order-row small")].map(element => element.parentElement.textContent), entryDates);
  assert.equal(localStorage.getItem(PRIMARY_STORAGE_KEY), before);
  await click(button("취소")); await drag(); await click(button("순서 저장"));
  const afterOrder = JSON.parse(localStorage.getItem(PRIMARY_STORAGE_KEY));
  assert.equal(afterOrder.logs.find(log => log.id === "journal-0").session, 1013);
  assert.equal(afterOrder.logs.find(log => log.id === "journal-1").session, 1011);
  assert.deepEqual(afterOrder.logs.map(log => log.note), logs.map(log => log.note));
  const savedOrder = localStorage.getItem(PRIMARY_STORAGE_KEY);
  await click(button("회차 순서 편집")); await drag(); await click(button("편집 종료"));
  assert.equal(document.querySelector(".session-order-editor"), null); assert.equal(localStorage.getItem(PRIMARY_STORAGE_KEY), savedOrder);
  passed.push("R4-02 all-only reorder, cancel stays/reset/no-write, exit and drag-after-cancel/save");

  await nav("삼성당 심사표");
  for (let grade = 9; grade >= 1; grade--) { await click(button(`${grade}급`, document.querySelector(".exam-tabs"))); assert.ok(!document.querySelector(".exam-list").parentElement.textContent.includes("13의 장")); }
  await click(button("유단자용 무기술", document.querySelector(".exam-tabs")));
  assert.deepEqual([...document.querySelectorAll(".exam-list li strong")].map(element => element.textContent), ["13의 장", "31의 장"]);
  passed.push("R4-03 dan-only exact pair in separate tab, absent from all nine kyu views");

  await nav("관리"); await click([...document.querySelectorAll(".management-menu button")][0]);
  assert.deepEqual([...document.querySelectorAll("details.credential-workspace > summary span")].map(element => element.textContent), ["신규 회원 발급", "기존 회원 초기등록", "특별수련 인증서 발급", "회원·수련 인증 결과", "기술 검증 도구"]);
  assert.ok([...document.querySelectorAll(".credential-workspace")].every(element => !element.open));
  assert.equal(document.querySelector(".scroll-controls"), null);
  const onboarding = await disclose("기존 회원 초기등록");
  const originalInput = onboarding.querySelector("input");
  await disclose("기존 회원 초기등록", false); await disclose("기존 회원 초기등록"); assert.equal(onboarding.querySelector("input"), originalInput);
  await nav("본부 카타"); await nav("관리");
  assert.equal(onboarding.querySelector("input"), originalInput); assert.equal(onboarding.open, false);
  await nav("관리"); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]); await click(button("← 관리")); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]); await act(async () => { window.history.back(); await tick(20); }); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]);
  passed.push("R4-01/04/06 five closed independent mounted workspaces, management re-tap/return/history-back, hidden scroll overlays");

  await disclose("기존 회원 초기등록"); const priorValues = values(onboarding);
  selected = null; await click(button("JSON 파일 선택", onboarding)); assert.deepEqual(values(onboarding), priorValues);
  selected = { filename: "invalid.json", content: "{}" }; await click(button("JSON 파일 선택", onboarding)); assert.deepEqual(values(onboarding), priorValues);
  const rankId = `or1_${"A".repeat(22)}`;
  const onboardCredential = await sign("member-onboarding", {
    onboardingId: `on1_${"A".repeat(22)}`, revision: 1, supersedesCredentialId: null, recognizedAt: "2026-10-09",
    membership: { name: "가상 초기등록 회원", memberId: "ASD-000", joinedAt: "2026-10-09" },
    recognizedRanks: [{ entryId: rankId, rankType: "kyu", rankValue: 8, rankDate: null }], currentRankEntryId: rankId,
    baselineAsOf: "2026-10-09", currentRankSessionBaseline: null, kataBaselines: []
  });
  selected = { filename: "onboarding.json", content: JSON.stringify(onboardCredential) };
  await click(button("JSON 파일 선택", onboarding)); assert.equal(onboarding.querySelector(".credential-form input").value, "가상 초기등록 회원");
  const verifiedValues = values(onboarding);
  await click(button("JSON 파일 선택", onboarding)); assert.deepEqual(values(onboarding), verifiedValues);
  const tamperedOnboarding = structuredClone(onboardCredential); tamperedOnboarding.signed.payload.membership.name = "위변조";
  selected = { filename: "tampered.json", content: JSON.stringify(tamperedOnboarding) };
  await click(button("JSON 파일 선택", onboarding)); assert.deepEqual(values(onboarding), verifiedValues);
  passed.push("R4-05 onboarding native mock picker cancel/reselect/valid/tampered, verified inputs unchanged on failure");

  const special = await disclose("특별수련 인증서 발급");
  const correction = special.querySelector("details.credential-disclosure");
  await act(async () => { correction.open = true; correction.dispatchEvent(new window.Event("toggle")); });
  const specialCredential = await sign("special-training", { eventId: `st1_${"A".repeat(22)}`, title: "가상 특별수련", category: "seminar", startDate: "2026-10-09", endDate: null, instructor: "가상 지도자" });
  selected = { filename: "special-v1.json", content: JSON.stringify(specialCredential) };
  const callsBeforeImport = signCalls;
  await click(button("JSON 파일 선택", special)); await click(button("서명 검증 후 불러오기", special));
  assert.equal(special.querySelector(".credential-form input").value, "가상 특별수련");
  assert.equal(signCalls, callsBeforeImport); const specialValues = values(special);
  const invalid = structuredClone(specialCredential); invalid.signed.payload.title = "위변조";
  selected = { filename: "tampered-v1.json", content: JSON.stringify(invalid) };
  await click(button("JSON 파일 선택", special)); await click(button("서명 검증 후 불러오기", special)); assert.deepEqual(values(special), specialValues);
  const v2 = await sign("special-training", { ...specialCredential.signed.payload, category: "special-training", revision: 2,
    supersedesCredentialId: specialCredential.signed.credentialId, sessions: [{ sessionId: `sts1_${"A".repeat(22)}`, date: "2026-10-09", label: "가상 회차" }] }, 2);
  selected = { filename: "special-v2.json", content: JSON.stringify(v2) };
  await click(button("JSON 파일 선택", special)); await click(button("서명 검증 후 불러오기", special));
  const revision = [...special.querySelectorAll("dt")].find(element => element.textContent === "정정 차수 (revision)").nextElementSibling.textContent;
  assert.equal(revision, "3"); assert.ok(special.textContent.includes(v2.signed.credentialId)); assert.equal(signCalls, callsBeforeImport);
  selected = { filename: "wrong-kind.json", content: JSON.stringify(onboardCredential) };
  const v2Values = values(special); await click(button("JSON 파일 선택", special)); await click(button("서명 검증 후 불러오기", special)); assert.deepEqual(values(special), v2Values);
  const wrongKey = structuredClone(v2); wrongKey.signed.keyId = "k1_" + "A".repeat(43);
  for (const content of [JSON.stringify(wrongKey), "{"] ) {
    selected = { filename: "rejected.json", content };
    await click(button("JSON 파일 선택", special)); await click(button("서명 검증 후 불러오기", special)); assert.deepEqual(values(special), v2Values);
  }
  passed.push("R4-05 special v1/v2 verify-only correction; invalid/wrong-kind fail closed; no issuance");

  const newMember = await disclose("신규 회원 발급");
  const issue = button("가상 신규 회원 전자 증명서 발급", newMember);
  window.confirm = () => false; await click(issue); assert.equal(signCalls, 0);
  window.confirm = () => true;
  await act(async () => { issue.click(); issue.click(); await tick(120); });
  assert.equal(signCalls, 1); assert.ok(issue.disabled); assert.ok(newMember.querySelector('[role="status"]'));
  await click(button("가상 테스트 전자 증명서 JSON 저장", newMember));
  assert.ok(saved.filename.includes("TEST-ONLY")); const exported = JSON.parse(saved.content);
  await nav("관리"); await click([...document.querySelectorAll(".management-menu button")][0]); await disclose("신규 회원 발급");
  assert.equal(button("가상 신규 회원 전자 증명서 발급", newMember).disabled, true);
  assert.ok(newMember.querySelector("img")); assert.equal(signCalls, 1);
  passed.push("R4-07 confirmation/cancel/synchronous double tap blocked; test-only signed JSON; navigation preserves outcome");

  if (process.argv[3]) {
    const { verifyMembershipCredentialToken } = await import(pathToFileURL(`${process.argv[3]}/app/credential/membership-verifier.mjs`).href);
    const { parseCredentialTokenFromSearch } = await import(pathToFileURL(`${process.argv[3]}/app/credential/credential-verifier.mjs`).href);
    const registry = { [keyId]: { keyId, publicKeySpkiBase64Url: bootstrap.publicKeySpkiBase64Url, status: "active" } };
    const link = newMember.querySelector(".credential-preview").textContent;
    const parsed = parseCredentialTokenFromSearch(new URL(link).search);
    const verified = await verifyMembershipCredentialToken(parsed.token, { registry, crypto: webcrypto });
    assert.equal(verified.valid, true); assert.deepEqual(verified.verifiedPayload, exported.signed.payload);
    const productionFixture = JSON.parse(readFileSync(new URL("./fixtures/membership-test-credential-v1.json", import.meta.url), "utf8"));
    assert.equal((await verifyMembershipCredentialToken(createCredentialTransportToken(productionFixture))).valid, true);
    passed.push("R4-07 actual read-only Member verifier accepts test vector with injected test trust and unchanged production fixture");
  }
  assert.deepEqual(JSON.parse(localStorage.getItem(PRIMARY_STORAGE_KEY)), afterOrder);
  assert.equal(localStorage.length, 1); assert.equal(keyId, bootstrap.keyId);
  passed.push("R4-08 no credential persistence; journals unchanged outside explicit reorder save; mock key identity retained");
  // Direct /credential-issuer uses the same management shell without a reload.
  const { default: DirectIssuer } = await import("../app/credential-issuer/page.tsx");
  await act(async () => { root.render(React.createElement(DirectIssuer)); await tick(30); });
  assert.equal(document.querySelectorAll("details.credential-workspace").length, 5);
  const directInput = document.querySelector(".credential-form input");
  await click(button("← 관리")); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]);
  assert.equal(document.querySelector(".credential-form input"), directInput);
  passed.push("R4-04 direct issuer route shares mounted management shell and retains input on menu return");
  console.log(JSON.stringify({ status: "PASS", count: passed.length, passed, openCalls, signCalls, scope: "Happy DOM + ephemeral mock native signer; not Android/Fold8" }, null, 2));
} finally { await act(async () => root.unmount()); await window.happyDOM.close(); }
