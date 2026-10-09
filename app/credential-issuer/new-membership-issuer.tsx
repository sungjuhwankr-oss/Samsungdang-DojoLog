"use client";
/* eslint-disable @next/next/no-img-element -- generated QR */
import { useRef, useState } from "react";
import { saveBackupFile } from "../backup-file";
import { savePngImage } from "../session-share-file";
import { membershipInputErrors, type MembershipInput, type TrustedKeyBootstrap } from "../credential-v1";
import { issuerFailure, koreanInputErrors } from "./presentation";
import { NEW_MEMBER_TEST_PROFILE, isNewMemberTestProfile, issueControlledMembership } from "./new-membership";
import { IssuerStatus, type OutcomeReporter } from "./workspace";

export function NewMembershipIssuer({ nativeAvailable, bootstrap, onOutcome }: {
  nativeAvailable: boolean; bootstrap: TrustedKeyBootstrap | null; onOutcome: OutcomeReporter;
}) {
  const [input, setInput] = useState<MembershipInput>({ ...NEW_MEMBER_TEST_PROFILE });
  const [output, setOutput] = useState<Awaited<ReturnType<typeof issueControlledMembership>> | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const errors = koreanInputErrors(membershipInputErrors(input));
  const allowed = isNewMemberTestProfile(input);
  async function issue() {
    if (!nativeAvailable || !bootstrap || !allowed || errors.length || inFlight.current || output) return;
    if (!window.confirm("가상 고정 테스트 회원의 전자 증명서를 발급합니다. 실제 회원에게 전달하지 마십시오. 계속하시겠습니까?")) return;
    inFlight.current = true; setBusy(true); setFailed(false);
    try {
      const result = await issueControlledMembership(input, bootstrap);
      setOutput(result);
      const message = "가상 회원 발급·서명 검증 완료. 실제 회원 운영 발급 및 배포는 HOLD입니다.";
      setMessage(message);
      onOutcome({ workspace: "new-member", label: "신규 회원 발급", success: true, message,
        credentialId: result.credential.signed.credentialId, keyId: result.credential.signed.keyId });
    } catch (error) {
      const message = issuerFailure(error, "신규 회원 테스트 발급에 실패했습니다.").message;
      setFailed(true); setMessage(message);
      onOutcome({ workspace: "new-member", label: "신규 회원 발급", success: false, message });
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="panel credential-section">
    <h2>회원 앱 등록용 전자 증명서 발급</h2>
    <p className="credential-warning">실제 회원 운영 발급·배포 HOLD. 현재는 가상 고정 테스트 회원으로만 검증할 수 있습니다.</p>
    <div className="credential-form">
      <label><span>성명</span><input disabled={busy || !!output} value={input.name} onChange={event => setInput({ ...input, name: event.target.value })} /></label>
      <label><span>회원번호</span><input disabled={busy || !!output} value={input.memberId} onChange={event => setInput({ ...input, memberId: event.target.value })} /></label>
      <label><span>입회일</span><input disabled={busy || !!output} type="date" value={input.joinedAt} onChange={event => setInput({ ...input, joinedAt: event.target.value })} /></label>
    </div>
    {errors.map(error => <p key={error.message} className="credential-error">{error.message}</p>)}
    {!allowed && <p className="credential-error">운영 승인 전에는 가상 고정 테스트 회원만 발급할 수 있습니다.</p>}
    <button type="button" className="primary large" disabled={!nativeAvailable || !bootstrap || !allowed || !!errors.length || busy || !!output} onClick={issue}>가상 신규 회원 전자 증명서 발급</button>
    <IssuerStatus message={message} failed={failed} />
    <button type="button" className="ghost full" disabled={busy} onClick={() => {
      if (output && !window.confirm("현재 테스트 결과를 닫고 다음 가상 테스트를 준비하시겠습니까?")) return;
      setInput({ ...NEW_MEMBER_TEST_PROFILE }); setOutput(null); setMessage(""); setFailed(false);
    }}>가상 고정 테스트 입력으로 준비</button>
    {output && <div className="credential-qr-output">
      <p>가상 테스트 전용 결과입니다. 실제 회원에게 배포하지 마십시오.</p>
      <img src={output.qr} alt="가상 신규 회원 Membership v1 테스트 QR" />
      <details className="credential-technical"><summary>검증된 URL·서명 정보</summary><p className="credential-preview">{output.link}</p><p>{output.credential.signed.credentialId} · {output.credential.signed.keyId}</p></details>
      <button type="button" className="ghost full" onClick={async () => {
        try { await saveBackupFile("Samsungdang-DojoLog-R4-new-member-TEST-ONLY.json", output.json); }
        catch (error) { setFailed(true); setMessage(issuerFailure(error, "테스트 JSON 저장 실패").message); }
      }}>가상 테스트 전자 증명서 JSON 저장</button>
      <button type="button" className="ghost full" onClick={async () => {
        try {
          const result = await savePngImage(output.qr, "Samsungdang-DojoLog-R4-new-member-TEST-ONLY-QR.png");
          if (result === "unavailable") {
            const anchor = document.createElement("a"); anchor.href = output.qr; anchor.download = "Samsungdang-DojoLog-R4-new-member-TEST-ONLY-QR.png"; anchor.click();
          }
        } catch (error) { setFailed(true); setMessage(issuerFailure(error, "테스트 QR 저장 실패").message); }
      }}>가상 테스트 QR PNG 저장</button>
    </div>}
  </section>;
}
