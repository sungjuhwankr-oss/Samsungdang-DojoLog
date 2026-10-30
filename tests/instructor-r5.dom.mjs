// Separate DOM interaction gate, with no production dependency or package change.
// node --import tsx tests/instructor-r5.dom.mjs /path/to/happy-dom/lib/index.js [Member-repo]
// This uses an ephemeral mock signer, never Android Keystore or actual member data.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { setTimeout as tick } from "node:timers/promises";
import {
  calculateKeyId, canonicalizeMembershipSigned, canonicalizeSpecialTrainingSigned, canonicalizeSpecialTrainingV2Signed,
  createCredentialId, createCredentialTransportToken, encodeUnpaddedBase64Url
} from "../app/credential-v1.ts";
import { canonicalizeMemberOnboardingSigned } from "../app/onboarding-credential.ts";

const { Window } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "happy-dom");
const window = new Window({ url: "http://localhost/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event", "CustomEvent", "MutationObserver", "IntersectionObserver", "localStorage", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? window : window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "crypto", { value: webcrypto });
let routerTraversals = 0;
window.addEventListener("popstate", () => { routerTraversals++; });
let scrollY = 0, documentHeight = 2400;
Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: () => documentHeight });
window.scrollTo = (options, y) => {
  scrollY = Math.max(0, Math.min(documentHeight - window.innerHeight, typeof options === "object" ? options.top : y));
  window.dispatchEvent(new window.Event("scroll"));
};
const style = document.createElement("style");
style.textContent = readFileSync(new URL("../app/extra.css", import.meta.url), "utf8");
document.head.append(style);
const nativeActivitySource = readFileSync(new URL("../android/SaveActivity.java", import.meta.url), "utf8");
assert.match(nativeActivitySource, /public void onBackPressed\(\)/);
assert.match(nativeActivitySource, /if \(target == null \|\| !isTrustedAppPage\(\)\)/);
assert.match(nativeActivitySource, /samsungdang-android-back/);
assert.match(nativeActivitySource, /androidBackPending/);
assert.match(nativeActivitySource, /SaveActivity\.super\.onBackPressed\(\)/);
assert.match(nativeActivitySource, /ANDROID_BACK_TIMEOUT_MS = 1500L/);
assert.match(nativeActivitySource, /target\.postDelayed\(/);
assert.match(nativeActivitySource, /androidBackGeneration == requestGeneration/);
assert.match(nativeActivitySource, /if \(!androidBackPending \|\| androidBackGeneration != requestGeneration\) return;/);
const watchdogSource = nativeActivitySource.split("// A missing WebView callback")[1]?.split("}, ANDROID_BACK_TIMEOUT_MS)")[0];
assert.ok(watchdogSource, "native Back watchdog must exist");
assert.doesNotMatch(watchdogSource, /super\.onBackPressed\(/, "watchdog must never navigate when JavaScript might have handled Back");
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
const nativeBackRequest = async () => {
  const detail = { handled: false };
  await act(async () => { window.dispatchEvent(new window.CustomEvent("samsungdang-android-back", { detail })); await tick(20); });
  return detail.handled;
};
const workspace = title => [...document.querySelectorAll("details.credential-workspace")].find(element => element.querySelector("summary span").textContent === title);
const disclose = async (title, open = true) => { const element = workspace(title); await act(async () => { element.open = open; element.dispatchEvent(new window.Event("toggle")); await tick(5); }); return element; };
const values = scope => [...scope.querySelectorAll("input, select")].map(element => element.value);
// Happy DOM evaluates media-query/cascade values; these are not rendered hitboxes.
const responsiveWidths = [320, 360, 390, 480, 768];
function assertResponsiveControls() {
  for (const width of responsiveWidths) {
    // Reparse the sheet because Happy DOM does not invalidate computed CSS on resize.
    window.happyDOM.setViewport({ width, height: 800 });
    style.textContent = style.textContent;
    const narrow = width <= 480;
    assert.equal(window.getComputedStyle(document.querySelector(".content")).paddingRight,
      `calc(${narrow ? 65 : 103}px + env(safe-area-inset-right))`);
    const rail = document.querySelector(".scroll-controls");
    if (rail) {
      assert.equal(window.getComputedStyle(rail).position, "fixed");
      assert.equal(window.getComputedStyle(rail).width, narrow ? "44px" : "80px");
    }
    for (const control of [...document.querySelectorAll(".scroll-controls button, .management-back")].filter(visible)) {
      const computed = window.getComputedStyle(control);
      assert.equal(computed.minHeight, "44px");
      if (narrow) {
        assert.equal(computed.width, "44px"); assert.equal(computed.height, "44px");
        assert.equal(computed.minWidth, "44px"); assert.equal(computed.boxSizing, "border-box");
      }
      assert.ok(["맨 위 ↑", "맨 아래 ↓", "← 관리"].includes(control.textContent.trim()));
    }
    if (narrow) {
      for (const element of document.querySelectorAll(".content .edit-actions, .app-shell > .toast")) {
        const computed = window.getComputedStyle(element);
        // Happy DOM cannot resolve left:max()/nested safe-area math. Unit tests
        // check those declarations and geometry; only cascade is asserted here.
        assert.equal(computed.transform, "none");
      }
      for (const element of document.querySelectorAll(".content .section-head, .content .journal-title, .content .log-head, .content .curriculum-row, .content .exam-list li, .content .beginner-library article")) {
        assert.equal(window.getComputedStyle(element).flexWrap, "wrap");
      }
    }
  }
  window.happyDOM.setViewport({ width: 1024, height: 800 });
  style.textContent = style.textContent;
}
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
  assert.ok(document.querySelector(".scroll-controls"), "credential workspace must retain floating scroll controls");
  assert.equal(window.getComputedStyle(document.querySelector(".scroll-controls")).position, "fixed");
  assert.equal(window.getComputedStyle(button("← 관리")).position, "fixed");
  await click(button("맨 아래 ↓")); await act(async () => { await tick(30); });
  assert.equal(scrollY, 1600);
  assert.equal(document.querySelector(".scroll-controls").textContent.trim(), "맨 위 ↑");
  await click(button("맨 위 ↑")); await act(async () => { await tick(30); });
  assert.equal(scrollY, 0);
  assert.equal(document.querySelector(".scroll-controls").textContent.trim(), "맨 아래 ↓");
  await act(async () => { window.scrollTo({ top: 700 }); await tick(30); });
  assert.equal(document.querySelectorAll(".scroll-controls button").length, 2);
  await act(async () => { documentHeight = 800; window.scrollTo({ top: 0 }); await tick(30); });
  assert.equal(document.querySelector(".scroll-controls"), null);
  await act(async () => { documentHeight = 2400; window.dispatchEvent(new window.Event("resize")); await tick(30); });
  passed.push("D1-02 floating scroll controls remain in credentials; top/middle/bottom/short-page boundaries and scroll-only actions");
  assertResponsiveControls();
  const onboarding = await disclose("기존 회원 초기등록");
  const originalInput = onboarding.querySelector("input");
  await disclose("기존 회원 초기등록", false); await disclose("기존 회원 초기등록"); assert.equal(onboarding.querySelector("input"), originalInput);
  await nav("본부 카타"); await nav("관리");
  assert.equal(onboarding.querySelector("input"), originalInput); assert.equal(onboarding.open, false);
  await nav("관리"); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]); await click(button("← 관리")); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]); await act(async () => { window.history.back(); await tick(20); }); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]);
  passed.push("R4-01/04/06 five closed independent mounted workspaces, management re-tap/return/history-back, floating scroll controls retained");

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
  selected = { filename: "기존특별수련_" + "long-filename-".repeat(20) + ".json", content: JSON.stringify(specialCredential, null, 2) };
  const callsBeforeImport = signCalls;
  async function selectAndVerifySpecial(expected) {
    const input = button("JSON 파일 선택", special);
    await click(input);
    assert.equal(special.querySelector(".credential-selected-file").textContent, selected.filename);
    assert.equal(special.querySelector('textarea[aria-label="기존 특별수련 전자 증명서 JSON"]').value, selected.content);
    const verify = button("서명 검증 후 불러오기", special);
    assert.equal(verify.disabled, false, "selected JSON must be ready for verification");
    await click(verify);
    const deadline = Date.now() + 5000;
    const successText = "서명과 서명 키 ID를 검증한 뒤 정정 발급 입력폼을 만들었습니다. 발급은 실행하지 않았습니다.";
    const outcome = () => {
      const status = correction.querySelector('[role="status"]');
      const alert = correction.querySelector('[role="alert"]');
      return !input.disabled && ((status && status.textContent === successText) || alert);
    };
    while (!outcome() && Date.now() < deadline) await act(async () => { await tick(20); });
    assert.ok(outcome(), `special-training verification timed out for ${selected.filename}`);
    assert.equal(verify.disabled, false, "verification must return to idle");
    if (expected === "success") {
      assert.equal(correction.querySelector('[role="alert"]'), null, "valid credential must not fail");
      assert.equal(correction.querySelector('[role="status"]').textContent, successText);
    } else {
      assert.ok(correction.querySelector('[role="alert"]')?.textContent.trim(), "invalid credential must be rejected");
    }
    assert.equal(signCalls, callsBeforeImport, "verification must not issue a credential");
  }
  await selectAndVerifySpecial("success");
  assert.equal(special.querySelector(".credential-form input").value, "가상 특별수련");
  assert.equal(signCalls, callsBeforeImport); const specialValues = values(special);
  const invalid = structuredClone(specialCredential); invalid.signed.payload.title = "위변조";
  selected = { filename: "tampered-v1.json", content: JSON.stringify(invalid) };
  await selectAndVerifySpecial("reject"); assert.deepEqual(values(special), specialValues);
  const v2 = await sign("special-training", { ...specialCredential.signed.payload, category: "special-training", revision: 2,
    supersedesCredentialId: specialCredential.signed.credentialId, sessions: [{ sessionId: `sts1_${"A".repeat(22)}`, date: "2026-10-09", label: "가상 회차" }] }, 2);
  selected = { filename: "special-v2.json", content: JSON.stringify(v2) };
  await selectAndVerifySpecial("success");
  const revision = [...special.querySelectorAll("dt")].find(element => element.textContent === "정정 차수 (revision)").nextElementSibling.textContent;
  assert.equal(revision, "3"); assert.ok(special.textContent.includes(v2.signed.credentialId)); assert.equal(signCalls, callsBeforeImport);
  selected = { filename: "wrong-kind.json", content: JSON.stringify(onboardCredential) };
  const v2Values = values(special); await selectAndVerifySpecial("reject"); assert.deepEqual(values(special), v2Values);
  const wrongKey = structuredClone(v2); wrongKey.signed.keyId = "k1_" + "A".repeat(43);
  for (const content of [JSON.stringify(wrongKey), "{"] ) {
    selected = { filename: "rejected.json", content };
    await selectAndVerifySpecial("reject"); assert.deepEqual(values(special), v2Values);
  }
  const originalJsonBox = special.querySelector('textarea[aria-label="기존 특별수련 전자 증명서 JSON"]');
  const longRawJson = JSON.stringify({ diagnostic: "긴원문_".repeat(4000) }, null, 2);
  const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  await act(async () => { textareaSetter.call(originalJsonBox, longRawJson); originalJsonBox.dispatchEvent(new window.Event("input", { bubbles: true })); await tick(10); });
  assert.equal(originalJsonBox.value, longRawJson, "long raw JSON is preserved byte-for-byte");
  assert.equal(window.getComputedStyle(originalJsonBox).overflow, "auto");
  assert.equal(window.getComputedStyle(originalJsonBox).resize, "vertical");
  assert.equal(window.getComputedStyle(originalJsonBox).width, "calc(100% - 28px)");
  assert.equal(parseFloat(window.getComputedStyle(originalJsonBox).minWidth), 0);
  assert.equal(window.getComputedStyle(correction.querySelector(".credential-selected-file")).overflowWrap, "anywhere");
  await click(button("서명 검증 후 불러오기", special));
  assert.deepEqual(values(special), v2Values); assert.equal(signCalls, callsBeforeImport);
  passed.push("D1-04 long JSON and filename retain original text; inset textarea width, scroll and resize; fail-closed verification remains");
  passed.push("R4-05 special v1/v2 verify-only correction; invalid/wrong-kind fail closed; no issuance");

  const newMember = await disclose("신규 회원 발급");
  const issue = button("가상 신규 회원 전자 증명서 발급", newMember);
  window.confirm = () => false; await click(issue); assert.equal(signCalls, 0);
  window.confirm = () => true;
  const issuanceStarted = Date.now();
  await act(async () => { issue.click(); issue.click(); await tick(0); });
  assert.equal(signCalls, 1, "synchronous duplicate issuance must be blocked");
  const issuanceDeadline = issuanceStarted + 5000;
  while (Date.now() < issuanceDeadline && !newMember.querySelector('[role="alert"]') &&
    !(newMember.querySelector('[role="status"]') && newMember.querySelector('.credential-qr-output img'))) {
    await act(async () => { await tick(20); });
  }
  const issuanceElapsedMs = Date.now() - issuanceStarted;
  assert.equal(newMember.querySelector('[role="alert"]'), null, "issuance error is not success");
  assert.ok(newMember.querySelector('[role="status"]') && newMember.querySelector('.credential-qr-output img'),
    `issuance timed out without success status and QR after ${issuanceElapsedMs}ms`);
  assert.ok(newMember.querySelector('[role="status"]').textContent.includes("서명 검증 완료"));
  assert.equal(signCalls, 1); assert.ok(issue.disabled, "issued result must prevent reissuance");
  console.log(JSON.stringify({check:"issuance-completion", status:"PASS", signCalls, qr:true, elapsedMs:issuanceElapsedMs, timeout:false}));
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
  // R5: the existing verified URL is copied without regeneration and is the decoded QR.
  let copied = "";
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async value => { copied = value; } } });
  await disclose("신규 회원 발급");
  const details = newMember.querySelector("details.verified-url");
  assert.equal(details.open, false); assert.equal(details.querySelector("summary").getAttribute("aria-expanded"), "false");
  assert.ok(button("URL 전체 복사", newMember).classList.contains("primary"));
  assert.equal(details.querySelectorAll("summary svg").length, 1);
  assert.match(style.textContent, /\.credential-shell \.verified-url > summary::after,[\s\S]*?content: none/);
  await click(button("URL 전체 복사", newMember));
  const displayed = details.querySelector(".credential-preview").textContent;
  assert.equal(copied, displayed); assert.ok(displayed.startsWith("https://"));
  const qrImage = PNG.sync.read(Buffer.from(newMember.querySelector("img").src.split(",")[1], "base64"));
  assert.equal(jsQR(new Uint8ClampedArray(qrImage.data), qrImage.width, qrImage.height).data, displayed);
  assert.ok(newMember.textContent.includes("URL 전체를 복사했습니다."));
  window.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
  await click(button("URL 전체 복사", newMember)); assert.ok(newMember.querySelector('[role="alert"]').textContent.includes("복사하지 못했습니다"));
  await act(async () => { details.open = true; details.dispatchEvent(new window.Event("toggle")); await tick(10); });
  assert.equal(details.querySelector("summary").getAttribute("aria-expanded"), "true");
  assert.equal(signCalls, 1); passed.push("R5-04/05 verified URL equals decoded QR and clipboard; failure and disclosure state");

  // Registering a router-like listener before React must not intercept management Back.
  const initialDocument = window.document;
  const initialRoute = window.location.pathname;
  for (const index of [0, 1, 2]) {
    await nav("관리"); assert.ok(document.querySelector(".management-menu"));
    const rootUrl = window.location.href;
    await click([...document.querySelectorAll(".management-menu button")][index]);
    assertResponsiveControls();
    const slotLength = window.history.length;
    assert.notEqual(window.location.href, rootUrl, "WebView subview needs a distinct same-document fragment");
    assert.equal(window.location.pathname, initialRoute);
    for (let repeat = 0; repeat < 3; repeat++) {
      await click(button("← 관리")); assert.ok(document.querySelector(".management-menu"));
      assert.equal(window.location.href, rootUrl);
      await click([...document.querySelectorAll(".management-menu button")][index]);
      await nav("관리"); assert.ok(document.querySelector(".management-menu"));
      assert.equal(window.location.href, rootUrl);
      await click([...document.querySelectorAll(".management-menu button")][index]);
      assert.equal(window.history.length, slotLength, "re-entry reuses one slot without history growth");
    }
    await act(async () => { window.history.back(); await tick(40); });
    assert.ok(document.querySelector(".management-menu"));
    assert.equal(window.location.href, rootUrl);
    assert.equal(window.document, initialDocument);
    assert.equal(document.querySelector(".bottom-nav .active").textContent.trim(), "관리");
    await click([...document.querySelectorAll(".management-menu button")][index]);
    const nativeHistoryLength = window.history.length;
    assert.equal(await nativeBackRequest(), true, "native Back handshake must consume an active management subview");
    assert.ok(document.querySelector(".management-menu"));
    assert.equal(window.location.href, rootUrl);
    assert.equal(window.history.length, nativeHistoryLength, "native Back must not grow or traverse history");
    assert.equal(window.document, initialDocument, "native Back must stay on the existing document");
    assert.equal(await nativeBackRequest(), false, "management-root Back belongs to the original native policy");
  }
  assert.equal(routerTraversals, 0);
  await click([...document.querySelectorAll(".management-menu button")][0]);
  await disclose("신규 회원 발급"); assert.ok(newMember.querySelector("img")); assert.equal(signCalls, 1);
  assert.deepEqual(values(onboarding), verifiedValues);
  assert.deepEqual(values(special), v2Values);
  for (const label of ["수업구성", "수업일지", "본부 카타", "삼성당 심사표", "초심자용 교본"]) {
    await nav(label); assert.equal(document.querySelector(".bottom-nav .active").textContent.trim(), label);
    assert.equal(await nativeBackRequest(), false, `native Back from ${label} must use the existing policy`);
    assertResponsiveControls();
    await nav("관리"); await disclose("신규 회원 발급"); assert.ok(newMember.querySelector("img"));
    assert.deepEqual(values(onboarding), verifiedValues); assert.deepEqual(values(special), v2Values);
  }
  passed.push("D3-WU-A all three UI/browser/native Back paths in three subviews; root and five other tabs delegate native Back; no history growth or credential loss");
  passed.push("D1 narrow layout media-query cascade at 320/360/390/480/768 across three management subviews and five other tabs; names and minimum touch CSS retained (not rendered geometry)");

  // A management-owned entry can be traversed while another top-level tab is active.
  // Returning to the management root must leave its existing Back policy intact.
  const routeBeforeInactiveHistory = window.history.state.samsungdangManagementReturnUrl;
  const documentBeforeInactiveHistory = window.document;
  await nav("본부 카타");
  await act(async () => { window.history.back(); await tick(40); });
  assert.equal(document.querySelector('.bottom-nav .active').textContent.trim(), "본부 카타");
  assert.equal(routerTraversals, 0);
  await act(async () => { window.history.forward(); await tick(40); });
  assert.equal(document.querySelector('.bottom-nav .active').textContent.trim(), "본부 카타");
  assert.equal(window.location.href, routeBeforeInactiveHistory);
  assert.equal(window.document, documentBeforeInactiveHistory);
  await nav("관리");
  assert.ok(document.querySelector('.management-menu'));
  const routerBeforeRootBack = routerTraversals;
  await act(async () => { window.history.back(); await tick(40); });
  assert.equal(routerTraversals, routerBeforeRootBack + 1, "management root Back must reach the router instead of being consumed as a subview return");
  await click([...document.querySelectorAll(".management-menu button")][0]);
  await disclose("신규 회원 발급"); assert.ok(newMember.querySelector("img"));
  assert.equal(signCalls, 1);
  passed.push("R5 inactive-tab history keeps the other tab and preserves management-root Back and credential state");

  // Reset an open disclosure, then verify the next mock issuance starts closed.
  assert.equal(details.open, true);
  assert.equal(details.querySelector("summary").getAttribute("aria-expanded"), "true");
  await click(button("가상 고정 테스트 입력으로 준비", newMember));
  assert.equal(newMember.querySelector(".credential-qr-output"), null, "reset removes the previous result");
  assert.equal(signCalls, 1, "reset does not issue a credential");
  const reissueButton = button("가상 신규 회원 전자 증명서 발급", newMember);
  assert.equal(reissueButton.disabled, false);
  await act(async () => { reissueButton.click(); reissueButton.click(); await tick(0); });
  assert.equal(signCalls, 2, "only one additional mock issuance is allowed");
  const reissueDeadline = Date.now() + 5000;
  while (Date.now() < reissueDeadline && !newMember.querySelector('[role="alert"]') &&
    !(newMember.querySelector('[role="status"]') && newMember.querySelector('.credential-qr-output img'))) {
    await act(async () => { await tick(20); });
  }
  assert.equal(newMember.querySelector('[role="alert"]'), null, "reissuance error is not success");
  assert.ok(newMember.querySelector('[role="status"]')?.textContent.includes("서명 검증 완료"), "reissuance timed out without verified status");
  const newQr = newMember.querySelector('.credential-qr-output img');
  assert.ok(newQr, "reissuance timed out without QR");
  assert.ok(reissueButton.disabled, "issued result prevents unnecessary reissuance");
  const newDetails = newMember.querySelector("details.verified-url");
  const newSummary = newDetails.querySelector("summary");
  assert.equal(newDetails.open, false); assert.equal(newSummary.getAttribute("aria-expanded"), "false");
  await act(async () => { newDetails.open = true; newDetails.dispatchEvent(new window.Event("toggle")); await tick(10); });
  assert.equal(newSummary.getAttribute("aria-expanded"), "true");
  await act(async () => { newDetails.open = false; newDetails.dispatchEvent(new window.Event("toggle")); await tick(10); });
  assert.equal(newSummary.getAttribute("aria-expanded"), "false");
  const newUrl = newDetails.querySelector(".credential-preview").textContent;
  const newQrImage = PNG.sync.read(Buffer.from(newQr.src.split(",")[1], "base64"));
  assert.equal(jsQR(new Uint8ClampedArray(newQrImage.data), newQrImage.width, newQrImage.height).data, newUrl);
  window.navigator.clipboard.writeText = async value => { copied = value; };
  await click(button("URL 전체 복사", newMember)); assert.equal(copied, newUrl);
  assert.ok(newMember.textContent.includes("실제 회원 운영 발급·배포 HOLD"));
  assert.equal(signCalls, 2);
  passed.push("R5-05 reset and reissue keeps disclosure and aria-expanded synchronized; QR and clipboard exact");

  // R5 edit cancellation opens the same ID despite memo/search mode and never writes the journal.
  await nav("수업일지");
  const originalRaw = localStorage.getItem(PRIMARY_STORAGE_KEY);
  for (const mode of ["전체", "메모", "검색"]) {
    await click(button(mode));
    if (mode === "검색") {
      const search = document.querySelector('input[placeholder="메모 본문 검색"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      await act(async () => { setter.call(search, "보존 메모 0"); search.dispatchEvent(new window.Event("input", { bubbles: true })); await tick(10); });
    }
    if (mode === "메모") await click([...document.querySelectorAll(".journal-memo-card button")][0]);
    if (mode === "검색") await click(button("원본 수업일지 보기"));
    const card = document.querySelector('#journal-journal-0'); assert.ok(card);
    await click(card.querySelector(".edit"));
    assertResponsiveControls();
    const note = document.querySelector('#note');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    await act(async () => { setter.call(note, "취소할 변경"); note.dispatchEvent(new window.Event("input", { bubbles: true })); await tick(10); });
    await click(button("수정 취소"));
    assert.ok(document.querySelector('#journal-journal-0.expanded')); assert.equal(localStorage.getItem(PRIMARY_STORAGE_KEY), originalRaw);
    assert.equal(document.querySelector('#journal-journal-0 .note').textContent, "보존 메모 0");
  }
  assert.equal(document.querySelectorAll('.scroll-inline').length, 0);
  passed.push("R5-03 cancellation returns original ID in all/memo/search without storage writes");
  // Direct /credential-issuer uses the same management shell without a reload.
  const { default: DirectIssuer } = await import("../app/credential-issuer/page.tsx");
  await act(async () => root.unmount());
  window.history.replaceState({}, "", "/credential-issuer");
  const directRoot = createRoot(rootElement);
  await act(async () => { directRoot.render(React.createElement(DirectIssuer)); await tick(30); });
  assert.equal(document.querySelectorAll("details.credential-workspace").length, 5);
  const directInput = document.querySelector(".credential-form input");
  await click(button("← 관리")); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]);
  assert.equal(document.querySelector(".credential-form input"), directInput);
  await nav("관리"); assert.ok(document.querySelector(".management-menu"));
  await click([...document.querySelectorAll(".management-menu button")][0]);
  const directRouterBefore = routerTraversals;
  await act(async () => { window.history.back(); await tick(40); });
  assert.ok(document.querySelector(".management-menu"));
  assert.equal(routerTraversals, directRouterBefore);
  assert.equal(window.location.pathname, "/credential-issuer");
  await click([...document.querySelectorAll(".management-menu button")][0]);
  assert.equal(document.querySelector(".credential-form input"), directInput);
  assert.equal(await nativeBackRequest(), true, "direct route native Back handshake must return to management root");
  assert.ok(document.querySelector(".management-menu"));
  assert.equal(window.location.pathname, "/credential-issuer");
  assert.equal(await nativeBackRequest(), false, "direct route management root must delegate native Back");
  await click([...document.querySelectorAll(".management-menu button")][0]);
  assert.equal(document.querySelector(".credential-form input"), directInput);
  // A real path change belongs to the router even while a management slot is owned.
  window.history.pushState({}, "", "/other-route");
  window.dispatchEvent(new window.PopStateEvent("popstate", { state: window.history.state }));
  assert.equal(routerTraversals, directRouterBefore + 1);
  assert.equal(await nativeBackRequest(), false, "a changed path must keep the router/native Back policy");
  await act(async () => directRoot.unmount());
  passed.push("D1-01 direct /credential-issuer keeps input through all returns and does not swallow another route");
  console.log(JSON.stringify({ status: "PASS", count: passed.length, passed, openCalls, signCalls, scope: "Happy DOM + ephemeral mock native signer; not Android/Fold8" }, null, 2));
} finally { await act(async () => root.unmount()); await window.happyDOM.close(); }
