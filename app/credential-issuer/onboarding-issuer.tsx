"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

import { savePngImage } from "../session-share-file";
import { provisionProductionCredentialKey, issueNativeMemberOnboardingCredential } from "../credential-native";
import { parseTrustedKeyBootstrap } from "../credential-v1";
import {
  createOnboardingProductionLink,
  createOnboardingQrDataUrl,
  generateOnboardingId,
  generateOnboardingRankEntryId,
  normalizeOnboardingMemberId,
  parseMemberOnboardingCredential,
  validateMemberOnboardingCorrection,
  validateMemberOnboardingPayload,
  verifyMemberOnboardingCredential,
  type KataBaseline,
  type MemberOnboardingCredential,
  type MemberOnboardingPayload,
  type OnboardingRank
} from "../onboarding-credential";

function koreaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function OnboardingIssuer({ nativeAvailable }: { nativeAvailable: boolean }) {
  const today = koreaToday();
  const [name, setName] = useState("테스트회원 (실제 회원 아님)");
  const [memberIdInput, setMemberIdInput] = useState("0");
  const [joinedAt, setJoinedAt] = useState(today);
  const [recognizedAt, setRecognizedAt] = useState(today);
  const [baselineAsOf, setBaselineAsOf] = useState(today);
  const [rankType, setRankType] = useState<"kyu" | "dan">("kyu");
  const [rankValue, setRankValue] = useState(8);
  const [rankDate, setRankDate] = useState("");
  const [priorRanksJson, setPriorRanksJson] = useState("[]");
  const [sessionBaseline, setSessionBaseline] = useState("");
  const [kataBaselinesJson, setKataBaselinesJson] = useState("[]");
  const [source, setSource] = useState<MemberOnboardingCredential | null>(null);
  const [output, setOutput] = useState<MemberOnboardingCredential | null>(null);
  const [outputJson, setOutputJson] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("신규 발급 또는 검증된 이전 JSON correction을 준비합니다.");
  const [busy, setBusy] = useState(false);

  const mode = source ? "correction" : "new";
  const payloadResult = useMemo(() => {
    try {
      const memberId = normalizeOnboardingMemberId(memberIdInput);
      const prior = JSON.parse(priorRanksJson) as OnboardingRank[];
      const currentEntryId = generateOnboardingRankEntryId();
      const ranks = [...prior, {
        entryId: currentEntryId, rankType, rankValue, rankDate: rankDate || null
      }];
      const payload: MemberOnboardingPayload = {
        onboardingId: source?.signed.payload.onboardingId ?? generateOnboardingId(),
        revision: source ? source.signed.payload.revision + 1 : 1,
        supersedesCredentialId: source?.signed.credentialId ?? null,
        recognizedAt,
        membership: { name, memberId, joinedAt },
        recognizedRanks: ranks,
        currentRankEntryId: currentEntryId,
        baselineAsOf,
        currentRankSessionBaseline: sessionBaseline === "" ? null : Number(sessionBaseline),
        kataBaselines: JSON.parse(kataBaselinesJson) as KataBaseline[]
      };
      validateMemberOnboardingPayload(payload);
      if (source) validateMemberOnboardingCorrection(source, payload);
      return { payload, error: null };
    } catch (error) {
      return { payload: null, error: error instanceof Error ? error.message : "입력값이 올바르지 않습니다." };
    }
  }, [baselineAsOf, joinedAt, kataBaselinesJson, memberIdInput, name, priorRanksJson, rankDate, rankType, rankValue, recognizedAt, sessionBaseline, source]);

  async function renderResult(credential: MemberOnboardingCredential, json: string) {
    const productionLink = await createOnboardingProductionLink(credential);
    setOutput(credential);
    setOutputJson(json);
    setLink(productionLink);
    setQr(await createOnboardingQrDataUrl(productionLink));
  }

  async function issue() {
    if (!payloadResult.payload) return;
    setBusy(true);
    try {
      const result = await issueNativeMemberOnboardingCredential(payloadResult.payload);
      if (result.status !== "success" || !result.json || !result.bootstrap) throw new Error(result.message ?? "발급 실패");
      const credential = parseMemberOnboardingCredential(result.json);
      const bootstrap = parseTrustedKeyBootstrap(result.bootstrap);
      if (!(await verifyMemberOnboardingCredential(credential, bootstrap))) throw new Error("발급 후 self-verification 실패");
      await renderResult(credential, result.json);
      setMessage(`${mode === "new" ? "신규" : "correction"} member-onboarding Credential을 생성했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "member-onboarding 발급 실패");
    } finally {
      setBusy(false);
    }
  }

  async function loadPrevious(file: File) {
    setBusy(true);
    try {
      const json = await file.text();
      const credential = parseMemberOnboardingCredential(json);
      const key = await provisionProductionCredentialKey();
      if (key.status !== "success" || !key.json) throw new Error(key.message ?? "production key 조회 실패");
      if (!(await verifyMemberOnboardingCredential(credential, parseTrustedKeyBootstrap(key.json)))) {
        throw new Error("이전 Credential 서명 검증 실패");
      }
      setSource(credential);
      const payload = credential.signed.payload;
      setName(payload.membership.name);
      setMemberIdInput(payload.membership.memberId);
      setJoinedAt(payload.membership.joinedAt);
      setRecognizedAt(payload.recognizedAt);
      setBaselineAsOf(payload.baselineAsOf);
      const current = payload.recognizedRanks.at(-1)!;
      setRankType(current.rankType);
      setRankValue(current.rankValue);
      setRankDate(current.rankDate ?? "");
      setPriorRanksJson(JSON.stringify(payload.recognizedRanks.slice(0, -1), null, 2));
      setSessionBaseline(payload.currentRankSessionBaseline === null ? "" : String(payload.currentRankSessionBaseline));
      setKataBaselinesJson(JSON.stringify(payload.kataBaselines, null, 2));
      await renderResult(credential, json);
      setMessage("이전 JSON을 검증했습니다. 기존 출력은 reissue용이며, 수정 발급 시 revision이 증가합니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이전 JSON을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function saveQr() {
    if (!qr) return;
    const result = await savePngImage(qr, "Samsungdang-DojoLog-member-onboarding-QR.png");
    if (result === "unavailable") {
      const anchor = document.createElement("a");
      anchor.href = qr;
      anchor.download = "Samsungdang-DojoLog-member-onboarding-QR.png";
      anchor.click();
    }
  }

  return <section className="panel credential-section">
    <h2>Existing-member onboarding issuer</h2>
    <p>한 명의 identity·verified rank/history·reference baseline만 일회성으로 발급하며 회원명부를 저장하지 않습니다.</p>
    <label className="ghost full">이전 onboarding JSON 검증·불러오기
      <input type="file" accept="application/json,.json" disabled={busy} onChange={event => event.target.files?.[0] && void loadPrevious(event.target.files[0])} />
    </label>
    <div className="credential-form">
      <label><span>성명</span><input value={name} onChange={event => setName(event.target.value)} /></label>
      <label><span>회원번호</span><input value={memberIdInput} onChange={event => setMemberIdInput(event.target.value)} /></label>
      <label><span>입회일</span><input type="date" value={joinedAt} onChange={event => setJoinedAt(event.target.value)} /></label>
      <label><span>인정일</span><input type="date" value={recognizedAt} onChange={event => setRecognizedAt(event.target.value)} /></label>
      <label><span>baseline 기준일</span><input type="date" value={baselineAsOf} onChange={event => setBaselineAsOf(event.target.value)} /></label>
      <label><span>현재 단급</span><select value={rankType} onChange={event => setRankType(event.target.value as "kyu" | "dan")}><option value="kyu">급</option><option value="dan">단</option></select></label>
      <label><span>단급 값</span><input type="number" min="1" value={rankValue} onChange={event => setRankValue(Number(event.target.value))} /></label>
      <label><span>취득일(미상 가능)</span><input type="date" value={rankDate} onChange={event => setRankDate(event.target.value)} /></label>
      <label><span>현급 session baseline(미상 가능)</span><input type="number" min="0" value={sessionBaseline} onChange={event => setSessionBaseline(event.target.value)} /></label>
    </div>
    <label><span>이전 verified rank JSON 배열</span><textarea value={priorRanksJson} onChange={event => setPriorRanksJson(event.target.value)} /></label>
    <label><span>Kata baseline JSON 배열</span><textarea value={kataBaselinesJson} onChange={event => setKataBaselinesJson(event.target.value)} /></label>
    {payloadResult.error && <p className="credential-error">{payloadResult.error}</p>}
    <button className="primary large" type="button" disabled={!nativeAvailable || busy || !payloadResult.payload} onClick={issue}>
      {mode === "new" ? "test-only onboarding 생성" : "correction revision 생성"}
    </button>
    {source && <button className="ghost full" type="button" disabled={!outputJson || busy} onClick={() => void renderResult(source, JSON.stringify(source))}>기존 JSON/link 그대로 reissue</button>}
    <p role="status">{message}</p>
    {output && <dl className="credential-diagnostics"><div><dt>onboardingId</dt><dd>{output.signed.payload.onboardingId}</dd></div><div><dt>revision</dt><dd>{output.signed.payload.revision}</dd></div><div><dt>credentialId</dt><dd>{output.signed.credentialId}</dd></div></dl>}
    {link && <><p className="credential-preview">{link}</p><button className="ghost full" type="button" onClick={() => navigator.clipboard.writeText(link)}>HTTPS link 복사</button></>}
    {qr && <div className="credential-qr-output"><img src={qr} alt="member-onboarding HTTPS link QR" /><button className="ghost full" type="button" onClick={saveQr}>QR PNG 저장</button></div>}
    {outputJson && <pre className="credential-preview">{JSON.stringify(output, null, 2)}</pre>}
  </section>;
}
