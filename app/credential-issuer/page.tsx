"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- packaged static APK route */

import { useMemo, useState, useSyncExternalStore } from "react";
import { FileDown, KeyRound, ShieldCheck } from "lucide-react";

import { saveBackupFile } from "../backup-file";
import {
  createCredentialTransportToken,
  membershipInputErrors,
  parseMembershipCredential,
  parseTrustedKeyBootstrap,
  verifyMembershipCredential,
  type MembershipCredential,
  type MembershipInput,
  type TrustedKeyBootstrap
} from "../credential-v1";
import {
  hasNativeCredentialBridge,
  issueNativeMembershipCredential,
  provisionProductionCredentialKey
} from "../credential-native";

const TEST_FIXTURE: MembershipInput = {
  name: "테스트회원 (실제 회원 아님)",
  memberId: "ASD-000",
  joinedAt: "2026-09-21"
};

const BOOTSTRAP_FILENAME = "Samsungdang-DojoLog-trusted-key-bootstrap-v1.json";
const CREDENTIAL_FILENAME = "Samsungdang-DojoLog-membership-test-credential-v1.json";

export default function CredentialIssuerPage() {
  const nativeAvailable = useSyncExternalStore(
    () => () => undefined,
    hasNativeCredentialBridge,
    () => false
  );
  const [input, setInput] = useState<MembershipInput>(TEST_FIXTURE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("아직 production signing key를 조회하지 않았습니다.");
  const [bootstrap, setBootstrap] = useState<TrustedKeyBootstrap | null>(null);
  const [bootstrapJson, setBootstrapJson] = useState("");
  const [credential, setCredential] = useState<MembershipCredential | null>(null);
  const [credentialJson, setCredentialJson] = useState("");
  const [transportToken, setTransportToken] = useState("");
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [selfVerified, setSelfVerified] = useState<boolean | null>(null);

  const errors = useMemo(() => membershipInputErrors(input), [input]);
  const exactFixture = input.name === TEST_FIXTURE.name
    && input.memberId === TEST_FIXTURE.memberId
    && input.joinedAt === TEST_FIXTURE.joinedAt;

  async function provision() {
    setBusy(true);
    setMessage("Android Keystore production key를 확인하고 있습니다.");
    try {
      const result = await provisionProductionCredentialKey();
      if (result.status !== "success" || !result.json) throw new Error(result.message ?? "key provisioning failed");
      const parsed = parseTrustedKeyBootstrap(result.json);
      setBootstrap(parsed);
      setBootstrapJson(result.json);
      setMessage(`production key ${parsed.generatedOrReused}: ${parsed.keyId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "production key provisioning에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function issueFixture() {
    if (errors.length || !exactFixture) return;
    setBusy(true);
    setSelfVerified(null);
    setMessage("고정 test-only Membership Credential을 생성하고 있습니다.");
    try {
      const result = await issueNativeMembershipCredential(input.name, input.memberId, input.joinedAt);
      if (result.status !== "success" || !result.json || !result.bootstrap) throw new Error(result.message ?? "credential issuance failed");
      const parsedCredential = parseMembershipCredential(result.json);
      const parsedBootstrap = parseTrustedKeyBootstrap(result.bootstrap);
      const expectedToken = createCredentialTransportToken(parsedCredential);
      if (result.transportToken !== expectedToken) throw new Error("native transport token mismatch");
      const verified = await verifyMembershipCredential(parsedCredential, parsedBootstrap);
      if (!verified) throw new Error("공개키 self-verification에 실패했습니다.");
      setCredential(parsedCredential);
      setCredentialJson(result.json);
      setBootstrap(parsedBootstrap);
      setBootstrapJson(result.bootstrap);
      setTransportToken(expectedToken);
      setDiagnostics(result.diagnostics ? JSON.parse(result.diagnostics) : null);
      setSelfVerified(true);
      setMessage("test-only Credential v1 생성과 공개키 self-verification을 완료했습니다.");
    } catch (error) {
      setCredential(null);
      setCredentialJson("");
      setTransportToken("");
      setDiagnostics(null);
      setSelfVerified(false);
      setMessage(error instanceof Error ? error.message : "test credential 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function exportJson(filename: string, json: string) {
    if (!json) return;
    const result = await saveBackupFile(filename, `${JSON.stringify(JSON.parse(json), null, 2)}\n`);
    if (result === "saved") setMessage(`${filename} 파일을 저장했습니다.`);
  }

  return (
    <main className="credential-shell">
      <header className="credential-header">
        <span className="eyebrow">Phase 4H-A · development only</span>
        <h1>Membership Credential v1 발급 기반</h1>
        <p>실제 회원 발급은 수련자용 trusted-key 배포와 검증이 끝날 때까지 비활성 상태입니다.</p>
        <a href="/">지도자용 앱으로 돌아가기</a>
      </header>

      <section className="panel credential-warning">
        <strong>안전 경계</strong>
        <p>이 화면은 회원명부를 저장하지 않으며, 입력값·발급 이력·private key를 앱 데이터나 backup에 기록하지 않습니다.</p>
        <p>현재 활성 서명 경로는 아래 고정 test fixture에만 열려 있습니다.</p>
      </section>

      <section className="panel credential-section">
        <div className="credential-section-title"><KeyRound /><div><span>1</span><h2>Production key provisioning</h2></div></div>
        <button className="primary large" type="button" disabled={!nativeAvailable || busy} onClick={provision}>
          production signing key 준비·조회
        </button>
        {!nativeAvailable && <p className="credential-error">Android 설치형 앱에서만 사용할 수 있습니다.</p>}
        {bootstrap && <dl className="credential-diagnostics">
          <div><dt>keyId</dt><dd>{bootstrap.keyId}</dd></div>
          <div><dt>상태</dt><dd>{bootstrap.generatedOrReused}</dd></div>
          <div><dt>공개키</dt><dd>{bootstrap.publicKeyByteLength} bytes · {bootstrap.publicKeyFormat}</dd></div>
          <div><dt>private key</dt><dd>getEncoded() == null</dd></div>
        </dl>}
        <button className="ghost full" type="button" disabled={!bootstrapJson || busy} onClick={() => exportJson(BOOTSTRAP_FILENAME, bootstrapJson)}>
          <FileDown />trusted-key bootstrap JSON 저장
        </button>
      </section>

      <section className="panel credential-section">
        <div className="credential-section-title"><ShieldCheck /><div><span>2</span><h2>Membership issuer test fixture</h2></div></div>
        <div className="credential-form">
          <label><span>이름</span><input value={input.name} onChange={event => setInput({ ...input, name: event.target.value })} /></label>
          <label><span>회원번호</span><input value={input.memberId} onChange={event => setInput({ ...input, memberId: event.target.value })} /></label>
          <label><span>입회일</span><input type="date" value={input.joinedAt} onChange={event => setInput({ ...input, joinedAt: event.target.value })} /></label>
        </div>
        {errors.map(error => <p className="credential-error" key={error}>{error}</p>)}
        {!exactFixture && <p className="credential-error">Phase 4H-A에서는 고정 test fixture만 서명할 수 있습니다.</p>}
        <button className="primary large" type="button" disabled={!nativeAvailable || busy || errors.length > 0 || !exactFixture} onClick={issueFixture}>
          test-only Membership Credential 생성
        </button>
        <button className="credential-production-disabled" type="button" disabled>
          실제 회원 Credential 발급 — Phase 4H-B 이후 활성화
        </button>
      </section>

      <section className="panel credential-section" aria-live="polite">
        <h2>검증 결과</h2>
        <p className={selfVerified === false ? "credential-error" : "credential-status"}>{message}</p>
        {credential && <dl className="credential-diagnostics">
          <div><dt>credentialId</dt><dd>{credential.signed.credentialId}</dd></div>
          <div><dt>keyId</dt><dd>{credential.signed.keyId}</dd></div>
          <div><dt>issuedAt</dt><dd>{credential.signed.issuedAt}</dd></div>
          <div><dt>signature</dt><dd>64-byte r||s · unpadded base64url</dd></div>
          <div><dt>self verify</dt><dd>{selfVerified ? "PASS" : "미검증"}</dd></div>
          <div><dt>transport token</dt><dd>{transportToken.length} characters</dd></div>
          <div><dt>HTTPS route</dt><dd>Phase 4H-B에서 주입·확정</dd></div>
        </dl>}
        {diagnostics && <pre className="credential-preview">{JSON.stringify(diagnostics, null, 2)}</pre>}
        {credentialJson && <pre className="credential-preview">{JSON.stringify(credential, null, 2)}</pre>}
        <button className="ghost full" type="button" disabled={!credentialJson || busy} onClick={() => exportJson(CREDENTIAL_FILENAME, credentialJson)}>
          <FileDown />sample Membership Credential v1 저장
        </button>
      </section>
    </main>
  );
}
