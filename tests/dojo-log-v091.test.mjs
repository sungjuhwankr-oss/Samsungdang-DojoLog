import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const recommendation = await readFile(new URL("../app/recommendation.ts", import.meta.url), "utf8");
const videoLinks = await readFile(new URL("../app/video-links.ts", import.meta.url), "utf8");
const version = await readFile(new URL("../app/version.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const data = await readFile(new URL("../app/data.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

test("uses the v0.9.1 visible brand consistently", () => {
  assert.match(page, /삼성당 DojoLog — 지도자/);
  assert.match(page, /교안 작성 · 수업일지 기록 · 누적 분석/);
  assert.match(layout, /삼성당 DojoLog — 지도자/);
  assert.equal(manifest.name, "삼성당 DojoLog — 지도자");
  assert.equal(manifest.short_name, "DojoLog 지도자");
});

test("uses local calendar fields and Saturday-only seven kata default", () => {
  assert.match(page, /date\.getFullYear\(\)/);
  assert.match(page, /date\.getMonth\(\)\+1/);
  assert.match(page, /date\.getDate\(\)/);
  assert.match(page, /getDay\(\)===6\?7:5/);
  assert.doesNotMatch(page, /toISOString\(\)\.slice\(0,10\)/);
});

test("persists an intentionally empty log state after hydration", () => {
  assert.match(page, /if\(hydrated\)localStorage\.setItem\(KEY,JSON\.stringify\(\{logs,lastSession\}\)\)/);
  assert.doesNotMatch(page, /if\(logs\.length\|\|lastSession!==1010\)localStorage\.setItem/);
});

test("preserves custom kata in the edit select", () => {
  assert.match(page, /optgroup label="현재 직접입력 카타"/);
  assert.match(page, /<KataOptions current=\{kata\}\/>/);
});

test("uses shared, state-preserving omote and ura video actions", () => {
  const expected = ["1교","2교","3교","4교","5교","입신던지기","사방던지기","손목뒤집기","천지던지기","회전던지기","호흡던지기","입기 호흡법","십자던지기"];
  for (let index = 1; index < expected.length; index += 1) {
    assert.ok(recommendation.indexOf(`"${expected[index - 1]}"`) < recommendation.indexOf(`"${expected[index]}"`));
  }
  assert.match(videoLinks, /link\.label === "오모테"/);
  assert.match(videoLinks, /link\.label === "우라"/);
  assert.match(page, /function VideoButtons/);
  assert.ok((page.match(/<VideoButtons kata=/g) ?? []).length >= 2);
  assert.match(page, /function openVideo\(url:string\)/);
  assert.match(page, /sessionStorage\.setItem\(VIEW_KEY/);
  assert.match(page, /\{tab,query,examGrade,scrollY:window\.scrollY\}/);
  assert.match(page, /window\.location\.assign\(url\)/);
  assert.match(page, /onClick=\{\(\)=>onOpen\(action\.url\)\}/);
  assert.doesNotMatch(page, /영상 없음/);
});

test("stores session-only completion explicitly and uses session-ordered detailed recency", () => {
  assert.match(page, /type RecordType="detailed"\|"sessionOnly"/);
  assert.match(recommendation, /\(log\.recordType\?\?"detailed"\)==="detailed"/);
  assert.match(recommendation, /sort\(\(a,b\)=>\(b\.session\?\?0\)-\(a\.session\?\?0\)\)\.slice\(0,10\)/);
  assert.match(page, /save\("완료","sessionOnly"\)/);
  assert.match(page, /수업 내용 미기록/);
  assert.match(page, /수업 내용이 기록되지 않아 카타 분석에서 제외됩니다/);
  assert.match(page, /recordType==="detailed"&&!plan\.length/);
});

test("adds the requested first-grade cross throws and keeps the compact hero prompt", () => {
  for (const name of ["한손양손잡기 십자던지기", "뒤양손잡기 십자던지기", "뒤양어깨잡기 십자던지기"]) {
    assert.match(data, new RegExp(`1:\\{[^\\n]+${name}`));
  }
  assert.match(css, /\.hero-panel h2\s*\{[^}]*font-size:\s*1\.29rem;[^}]*max-width:\s*320px;?/);
  assert.match(css, /\.page-title h2\s*\{[^}]*font-size:\s*1\.7rem;?/);
});

test("anchors delete confirmation to the selected trash button", () => {
  assert.match(page, /className="delete-anchor"/);
  assert.match(page, /className="delete-popover"/);
  assert.match(page, /이 일지를 삭제할까요\?/);
  assert.match(page, /setDeleteId\(deleteId===log\.id\?null:log\.id\)/);
  assert.doesNotMatch(page, /className="delete-confirm"/);
});

test("regenerates balanced alternatives without changing the established score formula", () => {
  assert.match(recommendation, /base:30\+\(k\.exam\?20:0\)\+\(k\.grade===highest\?16:0\)\+\(k\.form!=="입기"\?14:0\)-recentNames\.filter\(name=>name===k\.name\)\.length\*18\+\(k\.links\.length\?2:0\)/);
  assert.match(recommendation, /candidates\.filter\(x=>!avoidNames\.has\(x\.k\.name\)\)/);
  assert.match(recommendation, /candidates\.filter\(x=>avoidNames\.has\(x\.k\.name\)\)/);
  assert.match(page, /suggestionHistory\.flat\(\)/);
  assert.match(page, /slice\(-6\)/);
  assert.match(page, /현재 수정한 구성안을 새로 만들까요\?/);
  assert.match(page, /className="regenerate-button"[^>]*><RefreshCw\/>다시 구성/);
  assert.match(recommendation, /const half=Math\.floor\(count\/2\)/);
  assert.match(recommendation, /recentKatas\.filter\(isPin\)\.length/);
  assert.match(recommendation, /pinTarget=half,otherTarget=half/);
});

test("exports the complete state through a save picker with explicit feedback", () => {
  assert.match(page, /showSaveFilePicker/);
  assert.match(page, /Samsungdang-DojoLog-backup-\$\{dateInputValue\(\)\}\.json/);
  assert.match(page, /JSON\.stringify\(\{logs,lastSession\},null,2\)/);
  assert.match(page, /application\/json;charset=utf-8/);
  assert.match(page, /await handle\.createWritable\(\)/);
  assert.match(page, /await writable\.write\(data\)/);
  assert.match(page, /JSON 파일을 내보냈습니다/);
  assert.match(page, /JSON 파일을 저장하지 못했습니다/);
  assert.doesNotMatch(page, /URL\.createObjectURL/);
  assert.match(page, /JSON 전체 복사/);
  assert.match(page, /JSON 백업 데이터를 복사했습니다/);
  assert.match(page, /파일 저장이 취소되었거나 이 WebView에서는 지원되지 않습니다/);
});

test("repairs and manually reorders actual-session numbers without changing the storage key", () => {
  assert.match(page, /KEY="samsungdang-dojolog-instructor-v1"/);
  assert.match(page, /function reconcileSessions/);
  assert.match(page, /sessions=new Map\(completed\.map\(\(\{log\},index\)=>\[log\.id,1011\+index\]\)\)/);
  assert.match(page, /return reconcileSessions\(normalized\)/);
  assert.match(page, /reconcileSessions\(logs\.filter\(l=>l\.id!==id\)\)/);
  assert.match(page, /회차 순서 편집/);
  assert.match(page, /setLastSession\(1010\+sessionOrder\.length\)/);
});

test("uses shared categories and excludes the fixed corner throw only from recommendation", () => {
  const expected = ["십자던지기", "허리던지기", "합기떨어뜨리기"];
  for (let index = 1; index < expected.length; index += 1) {
    assert.ok(recommendation.indexOf(`"${expected[index - 1]}"`) < recommendation.indexOf(`"${expected[index]}"`));
  }
  assert.match(recommendation, /k\.name==="엇서한손잡기 구석던지기"\)return"호흡던지기"/);
  assert.match(recommendation, /k\.name!=="엇서한손잡기 구석던지기"/);
  assert.match(page, /className="category-jumps"/);
  assert.match(page, /className="curriculum-section"/);
});

test("provides pointer-based drag handles while preserving arrow controls", () => {
  assert.match(page, /onPointerDown=\{onDragStart\}/);
  assert.match(page, /data-kata-index=\{index\}/);
  assert.match(page, /setPlanDirty\(true\)/);
  assert.match(page, /aria-label="위로"/);
  assert.match(page, /aria-label="아래로"/);
  assert.match(page, /data-session-order-index=\{index\}/);
});

test("provides grade modes and the v0.9.6 help and change history", () => {
  assert.match(page, /useState<GradeMode>\("balanced"\)/);
  assert.match(page, /최고 급수 기준/);
  assert.match(page, /선택 급수 균형/);
  assert.match(page, /참가 급수별 복습·예습 범위 반영/);
  assert.match(page, /기술 연계와 수업 순서/);
  assert.match(page, /대표 카타 목록 보기/);
  assert.match(page, /DojoLog는 왜 만들었나요\?/);
  assert.match(page, /설계 원칙/);
  for (const step of ["날짜 선택","참가 급수 선택","급수 반영 방식 선택","카타 수 선택","자동 구성","필요하면 구성 수정","수업 후 기록"]) assert.match(page,new RegExp(step));
  assert.match(page, /전체 구성안 다시 만들기/);
  assert.doesNotMatch(page, /전체 안 바꾸기/);
  assert.match(version, /APP_VERSION = "0\.9\.6"/);
  assert.match(version, /APP_CHANNEL = "beta"/);
  assert.ok((page.match(/APP_VERSION_LABEL/g) ?? []).length >= 3);
  for (const release of ["v0.9.0","v0.9.1","v0.9.2","v0.9.3","v0.9.4","v0.9.5","v0.9.6"]) assert.match(page,new RegExp(release.replaceAll(".","\\.")));
  assert.doesNotMatch(page, /JSON 백업 파일 저장 완성/);
});
