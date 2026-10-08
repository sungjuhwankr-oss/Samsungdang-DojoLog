import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const render=(Component,props={})=>renderToStaticMarkup(React.createElement(Component,props));
const source=path=>readFile(new URL(path,import.meta.url),'utf8');
const log={id:'memo-original',date:'2026-10-07',session:1011,note:'회원별 보완\n다음 수업 확인',participants:[7],status:'완료',recordType:'detailed',katas:[{id:'hidden',name:'금지 카타',links:[{url:'https://example.com/video'}]}],createdAt:'2026-10-07T00:00:00Z'};

function hostButtons(element){
  if(!element||typeof element!=='object')return [];
  return [...(element.type==='button'?[element]:[]),...React.Children.toArray(element.props.children).flatMap(hostButtons)];
}

test('memo card renders date/session/note and its only action navigates to the exact original',async()=>{
  const {JournalMemoCard}=await vite.ssrLoadModule('/app/journal-view.tsx');
  const before=structuredClone(log),calls=[];
  const props={log,onOriginal:id=>calls.push(id)},html=render(JournalMemoCard,props);
  for(const text of ['2026-10-07','1011차','회원별 보완','다음 수업 확인','원본 수업일지 보기'])assert.ok(html.includes(text));
  assert.doesNotMatch(html,/금지 카타|example\.com|영상|참가|분석|공유|수정|삭제|<ol|<select/);
  const buttons=hostButtons(JournalMemoCard(props));assert.equal(buttons.length,1);buttons[0].props.onClick();
  assert.deepEqual(calls,['memo-original']);assert.deepEqual(log,before);
  assert.ok(render(JournalMemoCard,{...props,log:{...log,session:undefined}}).includes('회차 미반영'));
});

test('reset button uses one confirmation, cancellation has no writes, confirmation calls reset once',async()=>{
  const {DraftResetButton}=await vite.ssrLoadModule('/app/draft-reset-button.tsx');
  const original=globalThis.window;
  let confirmations=0,accept=false,resets=0;
  const stored={logs:[log],lastSession:1011},before=structuredClone(stored);
  globalThis.window={confirm:message=>{confirmations++;assert.ok(message.includes('오늘'));assert.ok(message.includes('수업 메모'));return accept}};
  try{
    const button=DraftResetButton({onReset:()=>resets++});
    assert.ok(render(DraftResetButton,{onReset:()=>{}}).includes('초기화'));
    button.props.onClick();assert.equal(confirmations,1);assert.equal(resets,0);
    accept=true;button.props.onClick();assert.equal(confirmations,2);assert.equal(resets,1);
    assert.deepEqual(stored,before);
  }finally{if(original===undefined)delete globalThis.window;else globalThis.window=original}
});

test('issuer domain titles omit Credential while object/actions retain electronic-certificate meaning',async()=>{
  const {default:Issuer}=await vite.ssrLoadModule('/app/credential-issuer/page.tsx');
  const html=render(Issuer);
  for(const title of ['회원 발급 테스트','승급·승단 발급 테스트','특별수련 발급 테스트','기존 회원 초기등록 발급','승급·승단 검증 결과','특별수련 검증·전달 결과']){
    assert.ok(html.includes(`<h2>${title}</h2>`));
  }
  for(const text of ['전자 증명서 발급 기반 (Credential v1)','테스트용 회원 전자 증명서 생성','테스트용 승급·승단 전자 증명서 생성','테스트용 특별수련 전자 증명서 생성','테스트용 기존 회원 초기등록 전자 증명서 생성','특별수련 전자 증명서 (Special-training Credential v2)','전자 증명서 JSON 저장'])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/Membership issuer|Promotion issuer|Special-training issuer|Existing-member onboarding issuer|전자 증명서을/);
  assert.match(html,/행사 ID가 올바르지 않습니다\. 새 행사 ID를 생성해 주세요\./);
  assert.doesNotMatch(html,/eventId must be|invalid title|invalid instructor|이전 인정 단급 JSON 배열|카타별 기준 수련횟수 JSON 배열/);
});

test('translated option labels preserve exact internal enum values and JSON field identifiers',async()=>{
  const {default:Issuer}=await vite.ssrLoadModule('/app/credential-issuer/page.tsx');
  const html=render(Issuer);
  for(const [value,label] of [['seminar','세미나'],['workshop','워크숍'],['special-training','특별수련'],['camp','합숙'],['other','기타']]){
    assert.match(html,new RegExp(`<option value="${value}"(?: selected="")?>${label}</option>`));
  }
  for(const value of ['advance-one','target','recognized-at-entry','kyu','dan'])assert.ok(html.includes(`value="${value}"`));
  const onboarding=await source('../app/credential-issuer/onboarding-issuer.tsx');
  const issuer=await source('../app/credential-issuer/page.tsx');
  const special=await source('../app/credential-issuer/special-training-v2-issuer.tsx');
  const issuerSources=`${issuer}\n${onboarding}\n${special}`;
  for(const label of ['행사 ID (eventId)','전자 증명서 ID (credentialId)','수련 회차 ID (sessionId)','초기등록 ID (onboardingId)','서명 키 ID (keyId)','정정 차수 (revision)','이전 전자 증명서 ID','서명 방식'])assert.ok(issuerSources.includes(label),label);
  assert.match(onboarding,/setSource\(credential\)/);
  assert.match(onboarding,/validateMemberOnboardingCorrection\(source, payload\)/);
  assert.match(onboarding,/issueNativeMemberOnboardingCredential\(payloadResult.payload\)/);
  assert.match(special,/saveBackupFile\("Samsungdang-DojoLog-special-training-v2.json", credentialJson\)/);
  assert.match(special,/전자 증명서 JSON 저장/);
  assert.doesNotMatch(onboarding,/priorRanksJson|kataBaselinesJson|이전 인정 단급 JSON 배열|카타별 기준 수련횟수 JSON 배열/);
  assert.match(onboarding,/이전 인정 단급 추가/);
  assert.match(onboarding,/카타 기준 수련횟수 추가/);
  assert.match(onboarding,/setPreviousRanks\(payload.recognizedRanks.slice\(0, -1\)\)/);
  assert.match(onboarding,/setCurrentRankEntryId\(current.entryId\)/);
});

test('scroll controls show correct positions and click handlers perform scroll-only operations',async()=>{
  const {ScrollNavigationButtons}=await vite.ssrLoadModule('/app/scroll-controls.tsx');
  const {scrollDocument}=await vite.ssrLoadModule('/app/scroll-navigation.ts');
  const calls=[],state={input:'유지',draft:{note:'기존 메모'},route:'/credential-issuer',stored:[log]},before=structuredClone(state);
  const host={scrollTo:options=>calls.push(options)},onScroll=target=>scrollDocument(host,target,4000);
  assert.equal(render(ScrollNavigationButtons,{visible:{top:false,bottom:false},onScroll}),'');
  const topHtml=render(ScrollNavigationButtons,{visible:{top:false,bottom:true},onScroll});
  assert.ok(topHtml.includes('맨 아래 ↓'));assert.ok(!topHtml.includes('맨 위 ↑'));
  const bottomHtml=render(ScrollNavigationButtons,{visible:{top:true,bottom:false},onScroll});
  assert.ok(bottomHtml.includes('맨 위 ↑'));assert.ok(!bottomHtml.includes('맨 아래 ↓'));
  const buttons=hostButtons(ScrollNavigationButtons({visible:{top:true,bottom:true},onScroll}));
  assert.equal(buttons.length,2);for(const button of buttons)button.props.onClick();
  assert.deepEqual(calls,[{top:0,behavior:'smooth'},{top:4000,behavior:'smooth'}]);assert.deepEqual(state,before);
});

test('common layout covers both routes, observes changing content and keeps safe-area/help controls separated',async()=>{
  const layout=await source('../app/layout.tsx'),page=await source('../app/page.tsx'),css=await source('../app/extra.css');
  assert.match(layout,/\{children\}<ScrollControls \/>/);
  assert.match(page,/label="목차 ↑"/);
  assert.match(css,/\.scroll-controls\s*\{[^}]*bottom:\s*calc\(132px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/\.help-toc-fab\s*\{[^}]*bottom:\s*calc\(84px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/@media \(min-width: 700px\)\s*\{\s*\.scroll-controls \{ bottom: calc\(152px \+ env\(safe-area-inset-bottom\)\)/);
});
