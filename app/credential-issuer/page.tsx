"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- packaged static APK route */
/* eslint-disable @next/next/no-img-element -- QR is a generated data URL */

import { useMemo, useState, useSyncExternalStore } from "react";
import { Award, Download, FileDown, KeyRound, QrCode, RefreshCw, ShieldCheck } from "lucide-react";

import { saveBackupFile } from "../backup-file";
import {
  createCredentialTransportToken,
  generateSpecialTrainingEventId,
  membershipInputErrors,
  parseMembershipCredential,
  parsePromotionCredential,
  parseSpecialTrainingCredential,
  parseTrustedKeyBootstrap,
  promotionInputErrors,
  specialTrainingInputErrors,
  verifyMembershipCredential,
  verifyPromotionCredential,
  verifySpecialTrainingCredential,
  type MembershipCredential,
  type MembershipInput,
  type PromotionCredential,
  type PromotionPayload,
  type SpecialTrainingCategory,
  type SpecialTrainingCredential,
  type SpecialTrainingPayload,
  type TrustedKeyBootstrap
} from "../credential-v1";
import {
  hasNativeCredentialBridge,
  issueNativeMembershipCredential,
  issueNativePromotionCredential,
  issueNativeSpecialTrainingCredential,
  provisionProductionCredentialKey
} from "../credential-native";
import { savePngImage } from "../session-share-file";
import {
  createSpecialTrainingProductionLink,
  createSpecialTrainingQrDataUrl,
  createSpecialTrainingSavedQrDataUrl,
  downloadSpecialTrainingQrPng
} from "../special-training-output";
import { OnboardingIssuer } from "./onboarding-issuer";

const TEST_FIXTURE: MembershipInput = {
  name: "테스트회원 (실제 회원 아님)",
  memberId: "ASD-000",
  joinedAt: "2026-09-21"
};

const BOOTSTRAP_FILENAME = "Samsungdang-DojoLog-trusted-key-bootstrap-v1.json";
const CREDENTIAL_FILENAME = "Samsungdang-DojoLog-membership-test-credential-v1.json";
const SPECIAL_TRAINING_FILENAME = "Samsungdang-DojoLog-special-training-test-credential-v1.json";
const SPECIAL_TRAINING_QR_FILENAME = "Samsungdang-DojoLog-special-training-test-credential-v1-QR.png";
const TEST_SPECIAL_TITLE = "Phase 4J 테스트 특별수련";
const TEST_SPECIAL_INSTRUCTOR = "테스트 지도자";
type PromotionKind = "advance-one" | "target" | "recognized-at-entry";

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
  const [promotionKind, setPromotionKind] = useState<PromotionKind>("advance-one");
  const [examDate, setExamDate] = useState("2026-09-26");
  const [rankType, setRankType] = useState<"kyu" | "dan">("kyu");
  const [rankValue, setRankValue] = useState(5);
  const [recognizedMemberId, setRecognizedMemberId] = useState("ASD-000");
  const [rankDate, setRankDate] = useState("");
  const [recognizedAt, setRecognizedAt] = useState("2026-09-26");
  const [promotionCredential, setPromotionCredential] = useState<PromotionCredential | null>(null);
  const [promotionJson, setPromotionJson] = useState("");
  const [promotionToken, setPromotionToken] = useState("");
  const [promotionDiagnostics, setPromotionDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [promotionVerified, setPromotionVerified] = useState<boolean | null>(null);
  const [specialEventId, setSpecialEventId] = useState("");
  const [specialTitle, setSpecialTitle] = useState(TEST_SPECIAL_TITLE);
  const [specialCategory, setSpecialCategory] = useState<SpecialTrainingCategory>("special-training");
  const [specialStartDate, setSpecialStartDate] = useState("2026-10-24");
  const [specialEndDate, setSpecialEndDate] = useState("");
  const [specialInstructor, setSpecialInstructor] = useState(TEST_SPECIAL_INSTRUCTOR);
  const [specialCredential, setSpecialCredential] = useState<SpecialTrainingCredential | null>(null);
  const [specialJson, setSpecialJson] = useState("");
  const [specialToken, setSpecialToken] = useState("");
  const [specialQrDataUrl, setSpecialQrDataUrl] = useState("");
  const [specialDiagnostics, setSpecialDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [specialVerified, setSpecialVerified] = useState<boolean | null>(null);

  const errors = useMemo(() => membershipInputErrors(input), [input]);
  const exactFixture = input.name === TEST_FIXTURE.name
    && input.memberId === TEST_FIXTURE.memberId
    && input.joinedAt === TEST_FIXTURE.joinedAt;
  const promotionPayload = useMemo<PromotionPayload>(() => {
    if (promotionKind === "advance-one") {
      return { eventType: "promoted", examDate, mode: "advance-one" };
    }
    if (promotionKind === "target") {
      return {
        eventType: "promoted",
        examDate,
        mode: "target",
        targetRank: { rankType, rankValue }
      };
    }
    return {
      eventType: "recognized-at-entry",
      memberId: recognizedMemberId,
      mode: "target",
      rankDate: rankDate || null,
      recognizedAt,
      targetRank: { rankType, rankValue }
    };
  }, [examDate, promotionKind, rankDate, rankType, rankValue, recognizedAt, recognizedMemberId]);
  const promotionErrors = useMemo(() => promotionInputErrors(promotionPayload), [promotionPayload]);
  const promotionFilename = promotionKind === "advance-one"
    ? "Samsungdang-DojoLog-promotion-advance-one-test-credential-v1.json"
    : promotionKind === "target"
      ? "Samsungdang-DojoLog-promotion-target-test-credential-v1.json"
      : "Samsungdang-DojoLog-promotion-recognized-at-entry-test-credential-v1.json";
  const specialPayload = useMemo<SpecialTrainingPayload>(() => ({
    eventId: specialEventId,
    title: specialTitle,
    category: specialCategory,
    startDate: specialStartDate,
    endDate: specialEndDate || null,
    instructor: specialInstructor
  }), [specialCategory, specialEndDate, specialEventId, specialInstructor, specialStartDate, specialTitle]);
  const specialErrors = useMemo(() => specialTrainingInputErrors(specialPayload), [specialPayload]);
  const exactSpecialTestFixture = specialTitle === TEST_SPECIAL_TITLE
    && specialInstructor === TEST_SPECIAL_INSTRUCTOR;

  function clearSpecialOutput() {
    setSpecialCredential(null);
    setSpecialJson("");
    setSpecialToken("");
    setSpecialQrDataUrl("");
    setSpecialDiagnostics(null);
    setSpecialVerified(null);
  }

  function newSpecialEventId() {
    clearSpecialOutput();
    setSpecialEventId(generateSpecialTrainingEventId());
  }

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

  async function issuePromotionFixture() {
    if (promotionErrors.length) return;
    setBusy(true);
    setPromotionVerified(null);
    setMessage("test-only Promotion Credential을 생성하고 있습니다.");
    try {
      const result = await issueNativePromotionCredential(promotionPayload);
      if (result.status !== "success" || !result.json || !result.bootstrap) {
        throw new Error(result.message ?? "promotion credential issuance failed");
      }
      const parsedCredential = parsePromotionCredential(result.json);
      const parsedBootstrap = parseTrustedKeyBootstrap(result.bootstrap);
      const expectedToken = createCredentialTransportToken(parsedCredential);
      if (result.transportToken !== expectedToken) throw new Error("native transport token mismatch");
      const verified = await verifyPromotionCredential(parsedCredential, parsedBootstrap);
      if (!verified) throw new Error("Promotion Credential 공개키 self-verification에 실패했습니다.");
      setPromotionCredential(parsedCredential);
      setPromotionJson(result.json);
      setBootstrap(parsedBootstrap);
      setBootstrapJson(result.bootstrap);
      setPromotionToken(expectedToken);
      setPromotionDiagnostics(result.diagnostics ? JSON.parse(result.diagnostics) : null);
      setPromotionVerified(true);
      setMessage("test-only Promotion Credential 생성과 공개키 self-verification을 완료했습니다.");
    } catch (error) {
      setPromotionCredential(null);
      setPromotionJson("");
      setPromotionToken("");
      setPromotionDiagnostics(null);
      setPromotionVerified(false);
      setMessage(error instanceof Error ? error.message : "Promotion Credential 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function issueSpecialTrainingFixture() {
    if (specialErrors.length || !exactSpecialTestFixture) return;
    setBusy(true);
    setSpecialVerified(null);
    setMessage("test-only 특별수련 Credential을 생성하고 있습니다.");
    try {
      const eventIdBeforeIssuance = specialPayload.eventId;
      const previousCredentialId = specialCredential?.signed.credentialId;
      const result = await issueNativeSpecialTrainingCredential(specialPayload);
      if (result.status !== "success" || !result.json || !result.bootstrap) {
        throw new Error(result.message ?? "special-training credential issuance failed");
      }
      const parsedCredential = parseSpecialTrainingCredential(result.json);
      const parsedBootstrap = parseTrustedKeyBootstrap(result.bootstrap);
      const expectedToken = createCredentialTransportToken(parsedCredential);
      if (result.transportToken !== expectedToken) throw new Error("native transport token mismatch");
      if (parsedCredential.signed.payload.eventId !== eventIdBeforeIssuance) {
        throw new Error("special-training eventId changed during issuance");
      }
      if (previousCredentialId && parsedCredential.signed.credentialId === previousCredentialId) {
        throw new Error("credentialId was unexpectedly reused");
      }
      const verified = await verifySpecialTrainingCredential(parsedCredential, parsedBootstrap);
      if (!verified) throw new Error("특별수련 Credential 공개키 self-verification에 실패했습니다.");
      const productionLink = createSpecialTrainingProductionLink(parsedCredential);
      const parsedLink = new URL(productionLink);
      if (parsedLink.searchParams.get("credential") !== expectedToken) {
        throw new Error("production link credential token mismatch");
      }
      const qrDataUrl = await createSpecialTrainingQrDataUrl(productionLink);
      setSpecialCredential(parsedCredential);
      setSpecialJson(result.json);
      setSpecialToken(expectedToken);
      setSpecialQrDataUrl(qrDataUrl);
      setSpecialDiagnostics(result.diagnostics ? JSON.parse(result.diagnostics) : null);
      setBootstrap(parsedBootstrap);
      setBootstrapJson(result.bootstrap);
      setSpecialVerified(true);
      setMessage("test-only 특별수련 Credential 생성·검증과 QR 출력을 완료했습니다.");
    } catch (error) {
      clearSpecialOutput();
      setSpecialVerified(false);
      setMessage(error instanceof Error ? error.message : "특별수련 Credential 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSpecialTrainingQr() {
    if (!specialQrDataUrl || !specialCredential) return;
    try {
      const productionLink = createSpecialTrainingProductionLink(specialCredential);
      const savedQrDataUrl = await createSpecialTrainingSavedQrDataUrl(specialQrDataUrl, productionLink);
      const status = await savePngImage(savedQrDataUrl, SPECIAL_TRAINING_QR_FILENAME);
      if (status === "saved") {
        setMessage(`${SPECIAL_TRAINING_QR_FILENAME} 파일을 저장했습니다.`);
      } else if (status === "unavailable") {
        downloadSpecialTrainingQrPng(savedQrDataUrl, SPECIAL_TRAINING_QR_FILENAME);
        setMessage(`${SPECIAL_TRAINING_QR_FILENAME} 저장을 시작했습니다.`);
      }
    } catch {
      setMessage("특별수련 QR PNG를 저장하지 못했습니다.");
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
        <span className="eyebrow">Phase 4J-A · development only</span>
        <h1>Credential v1 발급 기반</h1>
        <p>기존 Membership·Promotion 회귀검증과 test-only 특별수련 Credential 발급을 위한 개발 화면입니다.</p>
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
          실제 회원 Membership Credential 발급 — 운영 승인 전 비활성
        </button>
      </section>

      <section className="panel credential-section">
        <div className="credential-section-title"><Award /><div><span>3</span><h2>Promotion issuer test fixture</h2></div></div>
        <p>실제 회원별 발급 이력을 저장하지 않는 일회성 test-only 입력입니다.</p>
        <div className="credential-form">
          <label><span>종류</span><select value={promotionKind} onChange={event => setPromotionKind(event.target.value as PromotionKind)}>
            <option value="advance-one">일반 심사 +1</option>
            <option value="target">특별승급 target</option>
            <option value="recognized-at-entry">입회·이적 시 인정</option>
          </select></label>
          {promotionKind !== "recognized-at-entry" && <label><span>심사일</span><input type="date" value={examDate} onChange={event => setExamDate(event.target.value)} /></label>}
          {promotionKind === "recognized-at-entry" && <>
            <label><span>회원번호</span><input value={recognizedMemberId} onChange={event => setRecognizedMemberId(event.target.value)} /></label>
            <label><span>원 단급 취득일 (모르면 비움)</span><input type="date" value={rankDate} onChange={event => setRankDate(event.target.value)} /></label>
            <label><span>삼성당 인정일</span><input type="date" value={recognizedAt} onChange={event => setRecognizedAt(event.target.value)} /></label>
          </>}
          {promotionKind !== "advance-one" && <>
            <label><span>목표 단급 종류</span><select value={rankType} onChange={event => setRankType(event.target.value as "kyu" | "dan")}>
              <option value="kyu">급</option>
              <option value="dan">단</option>
            </select></label>
            <label><span>목표 단급 값</span><input type="number" min="1" max={rankType === "kyu" ? 9 : undefined} value={rankValue} onChange={event => setRankValue(Number(event.target.value))} /></label>
          </>}
        </div>
        {promotionErrors.map(error => <p className="credential-error" key={error}>{error}</p>)}
        <button className="primary large" type="button" disabled={!nativeAvailable || busy || promotionErrors.length > 0} onClick={issuePromotionFixture}>
          test-only Promotion Credential 생성
        </button>
      </section>

      <section className="panel credential-section">
        <div className="credential-section-title"><QrCode /><div><span>4</span><h2>Special-training issuer test fixture</h2></div></div>
        <p>eventId는 이 화면을 유지한 재발급에서 그대로 사용되며 credentialId만 새로 생성됩니다.</p>
        <div className="credential-form credential-form-special">
          <label><span>eventId</span><input value={specialEventId} readOnly /></label>
          <label><span>행사명</span><input value={specialTitle} onChange={event => { clearSpecialOutput(); setSpecialTitle(event.target.value); }} /></label>
          <label><span>category</span><select value={specialCategory} onChange={event => { clearSpecialOutput(); setSpecialCategory(event.target.value as SpecialTrainingCategory); }}>
            <option value="seminar">seminar</option>
            <option value="workshop">workshop</option>
            <option value="special-training">special-training</option>
            <option value="camp">camp</option>
            <option value="other">other</option>
          </select></label>
          <label><span>시작일</span><input type="date" value={specialStartDate} onChange={event => { clearSpecialOutput(); setSpecialStartDate(event.target.value); }} /></label>
          <label><span>종료일 (단일일이면 비움)</span><input type="date" value={specialEndDate} onChange={event => { clearSpecialOutput(); setSpecialEndDate(event.target.value); }} /></label>
          <label><span>지도자</span><input value={specialInstructor} onChange={event => { clearSpecialOutput(); setSpecialInstructor(event.target.value); }} /></label>
        </div>
        <button className="ghost full" type="button" disabled={busy} onClick={newSpecialEventId}>
          <RefreshCw />새 test eventId 생성
        </button>
        {specialErrors.map(error => <p className="credential-error" key={error}>{error}</p>)}
        {!exactSpecialTestFixture && <p className="credential-error">Phase 4J-A에서는 고정 test-only 행사명과 지도자만 서명할 수 있습니다.</p>}
        <button className="primary large" type="button" disabled={!nativeAvailable || busy || specialErrors.length > 0 || !exactSpecialTestFixture} onClick={issueSpecialTrainingFixture}>
          test-only Special-training Credential 생성
        </button>
        <button className="credential-production-disabled" type="button" disabled>
          실제 운영용 특별수련 Credential 발급 — actual E2E 완료 전 비활성
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

      <section className="panel credential-section" aria-live="polite">
        <h2>Promotion 검증 결과</h2>
        {promotionCredential && <dl className="credential-diagnostics">
          <div><dt>종류</dt><dd>{promotionCredential.signed.payload.eventType} / {promotionCredential.signed.payload.mode}</dd></div>
          <div><dt>credentialId</dt><dd>{promotionCredential.signed.credentialId}</dd></div>
          <div><dt>keyId</dt><dd>{promotionCredential.signed.keyId}</dd></div>
          <div><dt>issuedAt</dt><dd>{promotionCredential.signed.issuedAt}</dd></div>
          <div><dt>signature</dt><dd>64-byte r||s · unpadded base64url</dd></div>
          <div><dt>self verify</dt><dd>{promotionVerified ? "PASS" : "미검증"}</dd></div>
          <div><dt>transport token</dt><dd>{promotionToken.length} characters</dd></div>
          <div><dt>HTTPS route</dt><dd>Phase 4I-B production route 미확정</dd></div>
        </dl>}
        {promotionDiagnostics && <pre className="credential-preview">{JSON.stringify(promotionDiagnostics, null, 2)}</pre>}
        {promotionJson && <pre className="credential-preview">{JSON.stringify(promotionCredential, null, 2)}</pre>}
        {promotionVerified === false && <p className="credential-error">Promotion Credential 검증에 실패했습니다.</p>}
        <button className="ghost full" type="button" disabled={!promotionJson || busy} onClick={() => exportJson(promotionFilename, promotionJson)}>
          <FileDown />현재 Promotion Credential v1 저장
        </button>
      </section>

      <section className="panel credential-section" aria-live="polite">
        <h2>Special-training 검증·전달 결과</h2>
        {specialCredential && <dl className="credential-diagnostics">
          <div><dt>eventId</dt><dd>{specialCredential.signed.payload.eventId}</dd></div>
          <div><dt>credentialId</dt><dd>{specialCredential.signed.credentialId}</dd></div>
          <div><dt>keyId</dt><dd>{specialCredential.signed.keyId}</dd></div>
          <div><dt>issuedAt</dt><dd>{specialCredential.signed.issuedAt}</dd></div>
          <div><dt>signature</dt><dd>64-byte r||s · unpadded base64url</dd></div>
          <div><dt>self verify</dt><dd>{specialVerified ? "PASS" : "미검증"}</dd></div>
          <div><dt>transport token</dt><dd>{specialToken.length} characters</dd></div>
        </dl>}
        {specialDiagnostics && <pre className="credential-preview">{JSON.stringify(specialDiagnostics, null, 2)}</pre>}
        {specialJson && <pre className="credential-preview">{JSON.stringify(specialCredential, null, 2)}</pre>}
        {specialQrDataUrl && <div className="credential-qr-output">
          <img src={specialQrDataUrl} alt="Special-training production HTTPS link QR" />
          <p>QR에는 production HTTPS transport URL이 들어 있습니다. URL 자체는 화면에 표시하거나 복사·직접 공유하지 않습니다.</p>
          <button className="ghost full" type="button" onClick={saveSpecialTrainingQr}><Download />QR PNG 저장</button>
        </div>}
        {specialVerified === false && <p className="credential-error">Special-training Credential 검증에 실패했습니다.</p>}
        <button className="ghost full" type="button" disabled={!specialJson || busy} onClick={() => exportJson(SPECIAL_TRAINING_FILENAME, specialJson)}>
          <FileDown />현재 Special-training Credential v1 저장
        </button>
      </section>

      <OnboardingIssuer nativeAvailable={nativeAvailable} />
    </main>
  );
}
