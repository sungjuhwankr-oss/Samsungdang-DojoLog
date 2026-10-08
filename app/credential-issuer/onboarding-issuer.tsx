"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileDown, FileUp } from "lucide-react";

import { saveBackupFile } from "../backup-file";
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
  type OnboardingRank
} from "../onboarding-credential";
import {
  buildOnboardingPayload,
  createPreviousRankRow,
  nextKataBaseline,
  ONBOARDING_KATA_OPTIONS,
  updateKataBaseline,
  updatePreviousRankRow
} from "./onboarding-form";
import { issuerFailure, koreanInputError } from "./presentation";

function koreaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function OnboardingIssuer({ nativeAvailable, issuerReady = true }: { nativeAvailable: boolean; issuerReady?: boolean }) {
  const today = koreaToday();
  const [name, setName] = useState("테스트회원 (실제 회원 아님)");
  const [memberIdInput, setMemberIdInput] = useState("0");
  const [joinedAt, setJoinedAt] = useState(today);
  const [recognizedAt, setRecognizedAt] = useState(today);
  const [baselineAsOf, setBaselineAsOf] = useState(today);
  const [rankType, setRankType] = useState<"kyu" | "dan">("kyu");
  const [rankValue, setRankValue] = useState(8);
  const [rankDate, setRankDate] = useState("");
  const [onboardingId, setOnboardingId] = useState(() => generateOnboardingId());
  const [currentRankEntryId, setCurrentRankEntryId] = useState(() => generateOnboardingRankEntryId());
  const [previousRanks, setPreviousRanks] = useState<OnboardingRank[]>([]);
  const [sessionBaseline, setSessionBaseline] = useState("");
  const [kataBaselines, setKataBaselines] = useState<KataBaseline[]>([]);
  const [source, setSource] = useState<MemberOnboardingCredential | null>(null);
  const [output, setOutput] = useState<MemberOnboardingCredential | null>(null);
  const [outputJson, setOutputJson] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("신규 발급 또는 검증된 이전 JSON의 정정 발급을 준비합니다.");
  const [technicalDiagnostic, setTechnicalDiagnostic] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState("선택된 파일 없음");
  const [resultOpen, setResultOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mode = source ? "correction" : "new";
  const payloadResult = useMemo(() => {
    try {
      const payload = buildOnboardingPayload({
        onboardingId,
        revision: source ? source.signed.payload.revision + 1 : 1,
        supersedesCredentialId: source?.signed.credentialId ?? null,
        recognizedAt,
        name,
        memberId: normalizeOnboardingMemberId(memberIdInput),
        joinedAt,
        previousRanks,
        currentRankEntryId,
        currentRankType: rankType,
        currentRankValue: rankValue,
        currentRankDate: rankDate || null,
        baselineAsOf,
        currentRankSessionBaseline: sessionBaseline === "" ? null : Number(sessionBaseline),
        kataBaselines
      });
      validateMemberOnboardingPayload(payload);
      if (source) validateMemberOnboardingCorrection(source, payload);
      return { payload, issue: null };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      return { payload: null, issue: koreanInputError(rawMessage) };
    }
  }, [baselineAsOf, currentRankEntryId, joinedAt, kataBaselines, memberIdInput, name, onboardingId, previousRanks, rankDate, rankType, rankValue, recognizedAt, sessionBaseline, source]);

  async function renderResult(credential: MemberOnboardingCredential, json: string) {
    const productionLink = await createOnboardingProductionLink(credential);
    setOutput(credential);
    setOutputJson(json);
    setLink(productionLink);
    setQr(await createOnboardingQrDataUrl(productionLink));
    setResultOpen(true);
  }

  async function issue() {
    if (!payloadResult.payload) return;
    setBusy(true);
    setTechnicalDiagnostic(null);
    try {
      const result = await issueNativeMemberOnboardingCredential(payloadResult.payload);
      if (result.status !== "success" || !result.json || !result.bootstrap) throw new Error(result.message ?? "발급 실패");
      const credential = parseMemberOnboardingCredential(result.json);
      const bootstrap = parseTrustedKeyBootstrap(result.bootstrap);
      if (!(await verifyMemberOnboardingCredential(credential, bootstrap))) throw new Error("발급 후 전자 증명서 자체 검증 실패");
      await renderResult(credential, result.json);
      setMessage(`${mode === "new" ? "신규" : "정정"} 기존 회원 초기등록 전자 증명서를 생성했습니다.`);
    } catch (error) {
      const presented = issuerFailure(error, "기존 회원 초기등록 전자 증명서 발급에 실패했습니다.");
      setMessage(presented.message);
      setTechnicalDiagnostic(presented.diagnostic);
    } finally {
      setBusy(false);
    }
  }

  async function loadPrevious(file: File) {
    setSelectedFilename(file.name);
    setBusy(true);
    setTechnicalDiagnostic(null);
    try {
      const json = await file.text();
      const credential = parseMemberOnboardingCredential(json);
      const key = await provisionProductionCredentialKey();
      if (key.status !== "success" || !key.json) throw new Error(key.message ?? "운영용 키 조회 실패");
      if (!(await verifyMemberOnboardingCredential(credential, parseTrustedKeyBootstrap(key.json)))) {
        throw new Error("이전 전자 증명서 서명 검증 실패");
      }
      setSource(credential);
      const payload = credential.signed.payload;
      setOnboardingId(payload.onboardingId);
      setName(payload.membership.name);
      setMemberIdInput(payload.membership.memberId);
      setJoinedAt(payload.membership.joinedAt);
      setRecognizedAt(payload.recognizedAt);
      setBaselineAsOf(payload.baselineAsOf);
      const current = payload.recognizedRanks.at(-1)!;
      setCurrentRankEntryId(current.entryId);
      setRankType(current.rankType);
      setRankValue(current.rankValue);
      setRankDate(current.rankDate ?? "");
      setPreviousRanks(payload.recognizedRanks.slice(0, -1));
      setSessionBaseline(payload.currentRankSessionBaseline === null ? "" : String(payload.currentRankSessionBaseline));
      setKataBaselines(payload.kataBaselines);
      await renderResult(credential, json);
      setMessage("이전 JSON을 검증했습니다. 기존 출력은 재전달용이며, 정정 발급 시 정정 차수가 증가합니다.");
    } catch (error) {
      const presented = issuerFailure(error, "이전 전자 증명서를 불러오지 못했습니다.");
      setMessage(presented.message);
      setTechnicalDiagnostic(presented.diagnostic);
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

  async function saveJson() {
    if (!outputJson) return;
    const filename = "Samsungdang-DojoLog-member-onboarding-credential-v1.json";
    const result = await saveBackupFile(filename, `${JSON.stringify(JSON.parse(outputJson), null, 2)}\n`);
    if (result === "saved") setMessage(`${filename} 파일을 저장했습니다.`);
  }

  function addPreviousRank() {
    setPreviousRanks(rows => [...rows, createPreviousRankRow()]);
  }

  function addKataBaseline() {
    setKataBaselines(rows => {
      const next = nextKataBaseline(rows);
      return next ? [...rows, next] : rows;
    });
  }

  return <section className="panel credential-section">
    <h2>기존 회원 초기등록 발급</h2>
    <p>한 명의 회원 정보·인정 단급 및 이력·기준 수련기록만 일회성으로 발급하며 회원명부를 저장하지 않습니다.</p>
    <div className="credential-file-import">
      <div><strong>기존 회원 초기등록 전자 증명서 JSON 검증·불러오기</strong><p>저장한 JSON 파일을 선택하면 서명을 검증하고 정정 발급 입력을 준비합니다.</p></div>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="application/json,.json" disabled={busy} onChange={event => event.target.files?.[0] && void loadPrevious(event.target.files[0])} />
      <button className="ghost" type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}><FileUp />JSON 파일 선택</button>
      <span className="credential-selected-file">{selectedFilename}</span>
    </div>
    <div className="credential-form">
      <label><span>성명</span><input value={name} onChange={event => setName(event.target.value)} /></label>
      <label><span>회원번호</span><input value={memberIdInput} onChange={event => setMemberIdInput(event.target.value)} /></label>
      <label><span>입회일</span><input type="date" value={joinedAt} onChange={event => setJoinedAt(event.target.value)} /></label>
      <label><span>인정일</span><input type="date" value={recognizedAt} onChange={event => setRecognizedAt(event.target.value)} /></label>
      <label><span>기준 수련기록 기준일</span><input type="date" value={baselineAsOf} onChange={event => setBaselineAsOf(event.target.value)} /></label>
      <label><span>현재 단급</span><select value={rankType} onChange={event => setRankType(event.target.value as "kyu" | "dan")}><option value="kyu">급</option><option value="dan">단</option></select></label>
      <label><span>단급 값</span><input type="number" min="1" max={rankType === "kyu" ? 9 : undefined} value={rankValue} onChange={event => setRankValue(Number(event.target.value))} /></label>
      <label><span>취득일(미상 가능)</span><input type="date" value={rankDate} onChange={event => setRankDate(event.target.value)} /></label>
      <label><span>현급 기준 수련횟수(미상 가능)</span><input type="number" min="0" value={sessionBaseline} onChange={event => setSessionBaseline(event.target.value)} /></label>
    </div>

    <div className="credential-repeat-list">
      <div><h3>이전 인정 단급</h3><p>낮은 단급부터 높은 단급 순서로 추가합니다. 항목 ID는 내부에서 자동 생성됩니다.</p></div>
      {previousRanks.map((rank, index) => <div className="credential-repeat-row" key={rank.entryId}>
        <div className="credential-form">
          <label><span>급 / 단</span><select value={rank.rankType} onChange={event => setPreviousRanks(rows => updatePreviousRankRow(rows, index, { rankType: event.target.value as "kyu" | "dan" }))}><option value="kyu">급</option><option value="dan">단</option></select></label>
          <label><span>단급 값</span><input type="number" min="1" max={rank.rankType === "kyu" ? 9 : undefined} value={rank.rankValue} onChange={event => setPreviousRanks(rows => updatePreviousRankRow(rows, index, { rankValue: Number(event.target.value) }))} /></label>
          <label><span>취득일(미상 가능)</span><input type="date" value={rank.rankDate ?? ""} onChange={event => setPreviousRanks(rows => updatePreviousRankRow(rows, index, { rankDate: event.target.value || null }))} /></label>
        </div>
        <button className="ghost" type="button" onClick={() => setPreviousRanks(rows => rows.filter((_, rowIndex) => rowIndex !== index))}>이전 단급 삭제</button>
      </div>)}
      <button className="ghost full" type="button" onClick={addPreviousRank}>이전 인정 단급 추가</button>
    </div>

    <div className="credential-repeat-list">
      <div><h3>카타별 기준 수련횟수</h3><p>현재 기준 카타 목록에서 선택합니다. 같은 카타는 중복해서 선택할 수 없습니다.</p></div>
      {kataBaselines.map((baseline, index) => <div className="credential-repeat-row" key={`${baseline.kataId}-${index}`}>
        <div className="credential-form credential-form-baseline">
          <label><span>카타</span><select value={baseline.kataId} onChange={event => setKataBaselines(rows => updateKataBaseline(rows, index, { kataId: event.target.value }))}>
            {ONBOARDING_KATA_OPTIONS.map(option => <option key={option.id} value={option.id} disabled={kataBaselines.some((row, rowIndex) => rowIndex !== index && row.kataId === option.id)}>{option.name}</option>)}
          </select></label>
          <label><span>기준 수련횟수</span><input type="number" min="0" disabled={baseline.count === null} value={baseline.count ?? ""} onChange={event => setKataBaselines(rows => updateKataBaseline(rows, index, { count: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
          <label className="credential-inline-toggle"><input type="checkbox" checked={baseline.count === null} onChange={event => setKataBaselines(rows => updateKataBaseline(rows, index, { count: event.target.checked ? null : 0 }))} /><span>횟수 미상</span></label>
        </div>
        <button className="ghost" type="button" onClick={() => setKataBaselines(rows => rows.filter((_, rowIndex) => rowIndex !== index))}>카타 기준 삭제</button>
      </div>)}
      <button className="ghost full" type="button" disabled={kataBaselines.length >= ONBOARDING_KATA_OPTIONS.length} onClick={addKataBaseline}>카타 기준 수련횟수 추가</button>
    </div>

    {payloadResult.issue && <>
      <p className="credential-error">{payloadResult.issue.message}</p>
      {payloadResult.issue.diagnostic && <details className="credential-technical"><summary>기술 진단</summary><code>{payloadResult.issue.diagnostic}</code></details>}
    </>}
    <button className="primary large" type="button" disabled={!nativeAvailable || !issuerReady || busy || !payloadResult.payload} onClick={issue}>
      {mode === "new" ? "기존 회원 초기등록 전자 증명서 발급" : "정정 전자 증명서 발급"}
    </button>
    {!issuerReady && <p className="credential-help">운영용 서명 키 준비가 완료되면 발급할 수 있습니다.</p>}
    {source && <button className="ghost full" type="button" disabled={!outputJson || busy} onClick={() => void renderResult(source, JSON.stringify(source))}>기존 JSON·링크 그대로 재전달</button>}
    <p role="status">{message}</p>
    {technicalDiagnostic && <details className="credential-technical"><summary>기술 진단</summary><code>{technicalDiagnostic}</code></details>}
    {output && <section className="credential-result" aria-label="기존 회원 초기등록 발급 결과"><button className="credential-result-toggle" type="button" aria-expanded={resultOpen} onClick={() => setResultOpen(open => !open)}>{resultOpen ? <ChevronUp /> : <ChevronDown />}{resultOpen ? "발급 결과 접기" : "발급 결과 펼치기"}</button>{resultOpen && <div className="credential-result-body"><details className="credential-technical"><summary>자동 생성 기술 정보</summary><dl className="credential-diagnostics">
      <div><dt>초기등록 ID (onboardingId)</dt><dd>{output.signed.payload.onboardingId}</dd></div>
      <div><dt>정정 차수 (revision)</dt><dd>{output.signed.payload.revision}</dd></div>
      <div><dt>전자 증명서 ID (credentialId)</dt><dd>{output.signed.credentialId}</dd></div>
    </dl><p>위 식별자는 자동 생성되므로 직접 입력할 필요가 없습니다.</p></details>
    {link && <><p className="credential-preview">{link}</p><button className="ghost full" type="button" onClick={() => navigator.clipboard.writeText(link)}>HTTPS 링크 복사</button></>}
    {qr && <div className="credential-qr-output"><img src={qr} alt="기존 회원 초기등록 HTTPS 링크 QR" /><button className="ghost full" type="button" onClick={saveQr}>QR PNG 저장</button></div>}
    {outputJson && <><button className="ghost full" type="button" onClick={saveJson}><FileDown />현재 기존 회원 초기등록 전자 증명서 JSON 저장</button><details className="credential-technical"><summary>서명된 JSON 기술 상세</summary><pre className="credential-preview">{JSON.stringify(output, null, 2)}</pre></details></>}
    </div>}</section>}
  </section>;
}
