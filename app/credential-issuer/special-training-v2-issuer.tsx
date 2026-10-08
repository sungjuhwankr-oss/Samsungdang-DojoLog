"use client";
/* eslint-disable @next/next/no-img-element -- generated QR data URL */

import { useEffect, useMemo, useState } from "react";
import { Download, FileDown, QrCode, RefreshCw } from "lucide-react";

import { saveBackupFile } from "../backup-file";
import {
  generateSpecialTrainingEventId,
  generateSpecialTrainingSessionId,
  parseSpecialTrainingCredential,
  parseSpecialTrainingV2Credential,
  specialTrainingV2InputErrors,
  verifySpecialTrainingCredential,
  verifySpecialTrainingV2Credential,
  type SpecialTrainingSession,
  type SpecialTrainingV2Credential,
  type SpecialTrainingV2Payload,
  type TrustedKeyBootstrap
} from "../credential-v1";
import { issueNativeSpecialTrainingV2Credential } from "../credential-native";
import { loadInstructorEventMemo, saveInstructorEventMemo } from "../instructor-event-memo";
import { savePngImage } from "../session-share-file";
import {
  createSpecialTrainingQrDataUrl,
  createSpecialTrainingSavedQrDataUrl,
  createSpecialTrainingV2ProductionLink,
  downloadSpecialTrainingQrPng
} from "../special-training-output";
import { issuerFailure, koreanInputErrors } from "./presentation";

type Props = { nativeAvailable: boolean; bootstrap: TrustedKeyBootstrap | null; keyReadiness?: "checking" | "ready" | "error" | "unsupported" };

function firstSession(): SpecialTrainingSession {
  return { sessionId: generateSpecialTrainingSessionId(), date: "2026-10-24", label: "오전 수련" };
}

export function SpecialTrainingV2Issuer({ nativeAvailable, bootstrap, keyReadiness = bootstrap ? "ready" : "checking" }: Props) {
  const [payload, setPayload] = useState<SpecialTrainingV2Payload>(() => ({
    eventId: "",
    revision: 1,
    supersedesCredentialId: null,
    title: "",
    category: "special-training",
    startDate: "2026-10-24",
    endDate: null,
    instructor: "",
    sessions: [{ sessionId: "", date: "2026-10-24", label: "오전 수련" }]
  }));
  const [priorSessions, setPriorSessions] = useState<Record<string, SpecialTrainingSession>>({});
  const [credential, setCredential] = useState<SpecialTrainingV2Credential | null>(null);
  const [credentialJson, setCredentialJson] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [memo, setMemo] = useState("");
  const [technicalDiagnostic, setTechnicalDiagnostic] = useState<string | null>(null);
  const errors = useMemo(() => specialTrainingV2InputErrors(payload), [payload]);
  const presentedErrors = useMemo(() => koreanInputErrors(errors), [errors]);
  const locked = credential !== null;

  useEffect(() => {
    const timer = window.setTimeout(() => setPayload(current => current.eventId ? current : {
      ...current,
      eventId: generateSpecialTrainingEventId(),
      sessions: [firstSession()]
    }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const replacePayload = (change: Partial<SpecialTrainingV2Payload>) => setPayload(current => ({ ...current, ...change }));
  const setSession = (index: number, field: "date" | "label", value: string) => setPayload(current => ({
    ...current,
    sessions: current.sessions.map((session, sessionIndex) => {
      if (sessionIndex !== index) return session;
      const prior = priorSessions[session.sessionId];
      const sessionId = prior && prior[field] !== value ? generateSpecialTrainingSessionId() : session.sessionId;
      return { ...session, sessionId, [field]: value };
    })
  }));

  const issue = async () => {
    if (!bootstrap || errors.length > 0) return;
    setBusy(true);
    setMessage("");
    setTechnicalDiagnostic(null);
    try {
      const result = await issueNativeSpecialTrainingV2Credential(payload);
      if (result.status !== "success" || !result.json) throw new Error(result.message ?? "special-training v2 issuance failed");
      const parsed = parseSpecialTrainingV2Credential(result.json);
      if (!await verifySpecialTrainingV2Credential(parsed, bootstrap)) throw new Error("발급 직후 서명 검증에 실패했습니다.");
      const productionLink = await createSpecialTrainingV2ProductionLink(parsed);
      const qrDataUrl = await createSpecialTrainingQrDataUrl(productionLink);
      setCredential(parsed);
      setCredentialJson(result.json);
      setLink(productionLink);
      setQr(qrDataUrl);
      setMessage("운영용 키로 서명하고 링크와 QR의 동일 URL을 검증했습니다.");
    } catch (error) {
      const presented = issuerFailure(error, "전자 증명서 발급에 실패했습니다.");
      setMessage(presented.message);
      setTechnicalDiagnostic(presented.diagnostic);
    } finally {
      setBusy(false);
    }
  };

  const prepareCorrection = () => {
    if (!credential) return;
    setPriorSessions(Object.fromEntries(payload.sessions.map(session => [session.sessionId, session])));
    replacePayload({ revision: payload.revision + 1, supersedesCredentialId: credential.signed.credentialId });
    setCredential(null); setCredentialJson(""); setLink(""); setQr("");
    setMessage("직전 전자 증명서를 선행 증명서로 하는 정정 발급을 준비했습니다. 기존 수련 회차의 의미를 바꾸면 새 수련 회차 ID가 자동 생성됩니다.");
  };

  const prepareImportedCorrection = async () => {
    if (!bootstrap) return;
    setTechnicalDiagnostic(null);
    try {
      const parsed = JSON.parse(importJson) as { signed?: { credentialVersion?: number } };
      if (parsed.signed?.credentialVersion === 1) {
        const old = parseSpecialTrainingCredential(importJson);
        if (!await verifySpecialTrainingCredential(old, bootstrap)) throw new Error("기존 v1 서명이 유효하지 않습니다.");
        setPayload({
          eventId: old.signed.payload.eventId,
          revision: 1,
          supersedesCredentialId: old.signed.credentialId,
          title: old.signed.payload.title,
          category: "special-training",
          startDate: old.signed.payload.startDate,
          endDate: old.signed.payload.endDate,
          instructor: old.signed.payload.instructor,
          sessions: [{ ...firstSession(), date: old.signed.payload.startDate }]
        });
        setPriorSessions({});
      } else {
        const old = parseSpecialTrainingV2Credential(importJson);
        if (!await verifySpecialTrainingV2Credential(old, bootstrap)) throw new Error("기존 v2 서명이 유효하지 않습니다.");
        setPayload({ ...old.signed.payload, revision: old.signed.payload.revision + 1, supersedesCredentialId: old.signed.credentialId });
        setPriorSessions(Object.fromEntries(old.signed.payload.sessions.map(session => [session.sessionId, session])));
      }
      const importedEventId = parsed.signed?.credentialVersion === 1
        ? parseSpecialTrainingCredential(importJson).signed.payload.eventId
        : parseSpecialTrainingV2Credential(importJson).signed.payload.eventId;
      setMemo(loadInstructorEventMemo(importedEventId)?.memo ?? "");
      setCredential(null); setCredentialJson(""); setLink(""); setQr("");
      setMessage("서명과 서명 키 ID를 검증한 뒤 정정 발급 입력폼을 만들었습니다.");
    } catch (error) {
      const presented = issuerFailure(error, "기존 전자 증명서를 불러오지 못했습니다.");
      setMessage(presented.message);
      setTechnicalDiagnostic(presented.diagnostic);
    }
  };

  const newEvent = () => {
    const eventId = generateSpecialTrainingEventId();
    setPayload({ ...payload, eventId, revision: 1, supersedesCredentialId: null, sessions: [firstSession()] });
    setPriorSessions({}); setCredential(null); setCredentialJson(""); setLink(""); setQr("");
    setMemo(loadInstructorEventMemo(eventId)?.memo ?? "");
  };

  const saveQr = async () => {
    if (!qr || !link) return;
    const saved = await createSpecialTrainingSavedQrDataUrl(qr, link);
    const result = await savePngImage(saved, "Samsungdang-DojoLog-special-training-v2-QR.png");
    if (result === "unavailable") downloadSpecialTrainingQrPng(saved, "Samsungdang-DojoLog-special-training-v2-QR.png");
  };

  return <section className="panel credential-section">
    <div className="credential-section-title"><QrCode /><div><span>2</span><h2>특별수련 인증 발급</h2></div></div>
    <p>수련 회차 목록을 운영용 Android Keystore 키로 서명합니다. 회원번호와 회원명은 포함하지 않습니다.</p>
    <div className="credential-form credential-form-special">
      <label><span>행사명</span><input disabled={locked} value={payload.title} onChange={event => replacePayload({ title: event.target.value })} /></label>
      <label><span>행사 종류</span><input value="특별수련" readOnly /></label>
      <label><span>시작일</span><input disabled={locked} type="date" value={payload.startDate} onChange={event => replacePayload({ startDate: event.target.value })} /></label>
      <label><span>종료일</span><input disabled={locked} type="date" value={payload.endDate ?? ""} onChange={event => replacePayload({ endDate: event.target.value || null })} /></label>
      <label><span>지도자</span><input disabled={locked} value={payload.instructor} onChange={event => replacePayload({ instructor: event.target.value })} /></label>
    </div>
    <details className="credential-technical"><summary>자동 생성 기술 정보</summary><dl className="credential-diagnostics">
      <div><dt>행사 ID (eventId)</dt><dd>{payload.eventId}</dd></div>
      <div><dt>정정 차수 (revision)</dt><dd>{payload.revision}</dd></div>
      <div><dt>이전 전자 증명서 ID</dt><dd>{payload.supersedesCredentialId ?? "없음"}</dd></div>
    </dl><p>위 식별자와 정정 정보는 자동으로 관리되므로 직접 입력할 필요가 없습니다.</p></details>
    <h3>표시 순서대로 서명되는 수련 회차</h3>
    {payload.sessions.map((session, index) => <div className="credential-form" key={session.sessionId}>
      <label><span>수련 회차 날짜</span><input disabled={locked} type="date" value={session.date} onChange={event => setSession(index, "date", event.target.value)} /></label>
      <label><span>수련 회차 표시명</span><input disabled={locked} value={session.label} onChange={event => setSession(index, "label", event.target.value)} /></label>
      <details className="credential-technical"><summary>회차 기술 정보</summary><p>수련 회차 ID (sessionId): <code>{session.sessionId}</code></p><p>자동 생성되므로 직접 입력할 필요가 없습니다.</p></details>
      {!locked && payload.sessions.length > 1 && <button className="ghost" type="button" onClick={() => replacePayload({ sessions: payload.sessions.filter((_, itemIndex) => itemIndex !== index) })}>수련 회차 삭제</button>}
    </div>)}
    <button className="ghost full" type="button" disabled={locked} onClick={() => replacePayload({ sessions: [...payload.sessions, { ...firstSession(), date: payload.startDate }] })}>수련 회차 추가</button>
    {presentedErrors.map(error => <div key={`${error.message}-${error.diagnostic ?? ""}`}><p className="credential-error">{error.message}</p>{error.diagnostic && <details className="credential-technical"><summary>기술 진단</summary><code>{error.diagnostic}</code></details>}</div>)}
    {keyReadiness !== "ready" && <p className={keyReadiness === "checking" ? "credential-help" : "credential-error"}>{keyReadiness === "checking" ? "운영용 서명 키를 확인하는 중이므로 아직 발급할 수 없습니다." : keyReadiness === "unsupported" ? "Android 설치형 앱에서만 특별수련 인증을 발급할 수 있습니다." : "운영용 서명 키 확인에 실패하여 발급할 수 없습니다."}</p>}
    <button className="primary large" type="button" disabled={!nativeAvailable || !bootstrap || busy || locked || errors.length > 0} onClick={issue}>특별수련 전자 증명서 발급</button>
    <button className="ghost full" type="button" onClick={newEvent}><RefreshCw />새 행사 ID 생성</button>
    {credential && <button className="ghost full" type="button" onClick={prepareCorrection}>현재 발급본 기준 정정 발급 준비</button>}

    <details>
      <summary>기존 전자 증명서(Credential v1/v2)를 검증해 정정 발급 준비</summary>
      <textarea value={importJson} onChange={event => setImportJson(event.target.value)} aria-label="기존 특별수련 전자 증명서 JSON" />
      <button className="ghost full" type="button" disabled={!bootstrap || !importJson} onClick={prepareImportedCorrection}>서명 검증 후 불러오기</button>
    </details>

    <label><span>지도자 행사 메모 (전자 증명서와 분리)</span><textarea value={memo} onChange={event => setMemo(event.target.value)} /></label>
    <button className="ghost full" type="button" disabled={!/^st1_[A-Za-z0-9_-]{22}$/.test(payload.eventId)} onClick={() => {
      saveInstructorEventMemo(payload.eventId, memo);
      setMessage("지도자 메모를 이 행사 ID에 별도 저장했습니다.");
    }}>메모 저장</button>
    <p className="credential-warning">지도자 행사 메모는 수련자용 앱으로 전송·동기화되지 않으며 현재 지도자용 Backup v1에도 포함되지 않습니다.</p>

    {message && <p className="credential-status" role="status">{message}</p>}
    {technicalDiagnostic && <details className="credential-technical"><summary>기술 진단</summary><code>{technicalDiagnostic}</code></details>}
    {credential && <details className="credential-technical"><summary>발급 결과 기술 정보</summary><dl className="credential-diagnostics">
      <div><dt>전자 증명서 ID (credentialId)</dt><dd>{credential.signed.credentialId}</dd></div>
      <div><dt>정정 차수 (revision)</dt><dd>{credential.signed.payload.revision}</dd></div>
      <div><dt>서명 방식</dt><dd>JCS · P-256 ECDSA · 64-byte r||s</dd></div>
      <div><dt>전달 형식</dt><dd>{new URL(link).searchParams.get("credential")?.startsWith("gz1.") ? "gz1" : "raw base64url"}</dd></div>
    </dl></details>}
    {link && <div className="credential-qr-output">
      <img src={qr} alt="특별수련 운영용 HTTPS 링크 QR" />
      <label><span>QR과 동일한 운영용 HTTPS 링크</span><textarea readOnly value={link} /></label>
      <p>단순 재전달은 새 전자 증명서를 발급하지 않고 아래 기존 링크·QR·JSON을 그대로 재사용합니다.</p>
      <button className="ghost full" type="button" onClick={() => navigator.clipboard.writeText(link)}>기존 링크 복사</button>
      <button className="ghost full" type="button" onClick={saveQr}><Download />QR PNG 저장</button>
      <button className="ghost full" type="button" onClick={() => saveBackupFile("Samsungdang-DojoLog-special-training-v2.json", credentialJson)}><FileDown />전자 증명서 JSON 저장</button>
    </div>}
  </section>;
}
