import QRCode from "qrcode";
import {
  createCredentialDeepLink, createCredentialTransportToken, membershipInputErrors,
  parseMembershipCredential, parseTrustedKeyBootstrap, verifyMembershipCredential,
  type MembershipInput, type TrustedKeyBootstrap
} from "../credential-v1";
import { issueNativeMembershipCredential, type NativeCredentialResult } from "../credential-native";

// R4 operating HOLD: there is no UI toggle or persisted setting that unlocks live issuance.
export const NEW_MEMBER_TEST_PROFILE: Readonly<MembershipInput> = Object.freeze({
  name: "R4 신규회원 테스트 (실제 회원 아님)", memberId: "ASD-000", joinedAt: "2026-10-09"
});
// Verified Member source: app/membership/page.tsx + parseCredentialTokenFromSearch.
export const MEMBERSHIP_PRODUCTION_ROUTE = "/Samsungdang-DojoLog-Member/membership/";
export const MEMBERSHIP_PRODUCTION_ORIGIN = "https://sungjuhwankr-oss.github.io";

export function isNewMemberTestProfile(input: MembershipInput): boolean {
  return input.name === NEW_MEMBER_TEST_PROFILE.name && input.memberId === NEW_MEMBER_TEST_PROFILE.memberId
    && input.joinedAt === NEW_MEMBER_TEST_PROFILE.joinedAt;
}

export async function issueControlledMembership(
  input: MembershipInput,
  expectedBootstrap: TrustedKeyBootstrap,
  nativeIssue: typeof issueNativeMembershipCredential = issueNativeMembershipCredential
) {
  if (!isNewMemberTestProfile(input) || membershipInputErrors(input).length) {
    throw new Error("운영 발급 HOLD: 가상 고정 테스트 회원만 발급할 수 있습니다.");
  }
  const result: NativeCredentialResult = await nativeIssue(input.name, input.memberId, input.joinedAt);
  if (result.status !== "success" || !result.json || !result.bootstrap) throw new Error(result.message ?? "회원 전자 증명서 발급 실패");
  const credential = parseMembershipCredential(result.json);
  const bootstrap = parseTrustedKeyBootstrap(result.bootstrap);
  if (bootstrap.keyId !== expectedBootstrap.keyId || bootstrap.publicKeySpkiBase64Url !== expectedBootstrap.publicKeySpkiBase64Url
    || credential.signed.keyId !== expectedBootstrap.keyId) throw new Error("운영용 서명 키가 변경되었습니다.");
  const payload = credential.signed.payload;
  if (!isNewMemberTestProfile(payload) || !await verifyMembershipCredential(credential, expectedBootstrap)) {
    throw new Error("회원 전자 증명서 입력·서명 검증 실패");
  }
  const token = createCredentialTransportToken(credential);
  if (result.transportToken !== token) throw new Error("native transport token mismatch");
  const link = createCredentialDeepLink(credential, {
    baseUrl: MEMBERSHIP_PRODUCTION_ORIGIN, route: MEMBERSHIP_PRODUCTION_ROUTE, parameterName: "credential"
  });
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 4, width: 900 });
  return { credential, json: result.json, link, qr };
}
