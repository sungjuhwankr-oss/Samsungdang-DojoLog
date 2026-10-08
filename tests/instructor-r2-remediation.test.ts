import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("R2 uses one six-item instructor navigation with management active on the direct issuer route", async () => {
  const [nav, page, issuer] = await Promise.all([
    read("../app/instructor-bottom-nav.tsx"),
    read("../app/page.tsx"),
    read("../app/credential-issuer/page.tsx")
  ]);
  for (const label of ["수업구성", "수업일지", "본부 카타", "삼성당 심사표", "초심자 동영상", "관리"]) assert.ok(nav.includes(label));
  assert.equal((nav.match(/label:/g) ?? []).length, 6);
  assert.match(page, /<InstructorBottomNav active=\{tab\} onSelect=\{setTab\}/);
  assert.match(issuer, /<InstructorBottomNav active="manage"/);
  for (const item of ["회원·수련 인증", "백업·복원", "앱 정보·사용법"]) assert.ok(page.includes(item));
});

test("R2 keeps planner and credential workspaces mounted in memory without credential browser persistence", async () => {
  const [page, issuer, onboarding] = await Promise.all([
    read("../app/page.tsx"), read("../app/credential-issuer/page.tsx"), read("../app/credential-issuer/onboarding-issuer.tsx")
  ]);
  assert.match(page, /<div hidden=\{tab!=="manage"\}><ManagementScreen/);
  assert.match(page, /credentialMounted&&<div hidden=\{view!=="credential"\}/);
  assert.doesNotMatch(`${issuer}\n${onboarding}`, /localStorage|sessionStorage|indexedDB/i);
});

test("R2 onboarding result is collapsible and exports pretty JSON through the existing file path", async () => {
  const onboarding = await read("../app/credential-issuer/onboarding-issuer.tsx");
  for (const text of ["JSON 파일 선택", "선택된 파일 없음", "발급 결과 접기", "발급 결과 펼치기", "현재 기존 회원 초기등록 전자 증명서 JSON 저장"]) assert.ok(onboarding.includes(text));
  assert.match(onboarding, /saveBackupFile\(filename, `\$\{JSON\.stringify\(JSON\.parse\(outputJson\), null, 2\)\}\\n`\)/);
  assert.match(onboarding, /setResultOpen\(true\)/);
  assert.match(onboarding, /validateMemberOnboardingCorrection\(source, payload\)/);
});

test("R2 automatically restores key readiness and explains v2 issuance blocking states", async () => {
  const [issuer, special] = await Promise.all([
    read("../app/credential-issuer/page.tsx"), read("../app/credential-issuer/special-training-v2-issuer.tsx")
  ]);
  assert.match(issuer, /void provision\(\)/);
  for (const text of ["운영용 서명 키를 확인하는 중입니다", "운영용 서명 키 준비가 완료되었습니다", "운영용 서명 키를 확인하지 못했습니다", "Android 설치형 앱에서만"]) assert.ok(`${issuer}\n${special}`.includes(text));
  assert.match(special, /disabled=\{!nativeAvailable \|\| !bootstrap \|\| busy \|\| locked \|\| errors\.length > 0\}/);
});

test("R2 strengthens the registered-kata add control without changing its handler", async () => {
  const [page, css] = await Promise.all([read("../app/page.tsx"), read("../app/add-panel.css")]);
  assert.match(page, /className="secondary-add" onClick=\{addSelected\}>카타 추가 선택\(무기술 포함\)/);
  assert.match(css, /\.secondary-add\{border:1px solid/);
});
