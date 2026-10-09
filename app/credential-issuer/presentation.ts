export type PresentedIssuerMessage = {
  message: string;
  diagnostic: string | null;
};

const INPUT_ERROR_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:invalid eventId|eventId must be)/i, "행사 ID가 올바르지 않습니다. 새 행사 ID를 생성해 주세요."],
  [/invalid title|title must|title contains|title.*blank|title.*exceed/i, "행사명을 입력해 주세요."],
  [/invalid instructor|instructor must|instructor contains|instructor.*blank|instructor.*exceed/i, "지도자명을 입력해 주세요."],
  [/special-training category|category must/i, "행사 종류를 확인해 주세요."],
  [/invalid startDate|startDate must/i, "시작일을 올바른 날짜로 입력해 주세요."],
  [/invalid endDate|endDate must be null|endDate must not/i, "종료일을 시작일과 같거나 이후의 날짜로 입력해 주세요."],
  [/invalid revision|correction requires supersedesCredentialId/i, "정정 차수와 이전 전자 증명서 정보를 다시 확인해 주세요."],
  [/invalid supersedesCredentialId/i, "이전 전자 증명서 ID가 올바르지 않습니다."],
  [/sessions must contain at least one session/i, "수련 회차를 한 개 이상 추가해 주세요."],
  [/invalid session fields|invalid or duplicate sessionId/i, "수련 회차 정보가 올바르지 않습니다. 회차를 다시 추가해 주세요."],
  [/session date is outside event range/i, "수련 회차 날짜를 행사 기간 안으로 입력해 주세요."],
  [/invalid session label/i, "수련 회차 표시명을 입력해 주세요."],
  [/memberId is required/i, "회원번호를 입력해 주세요."],
  [/memberId must contain digits|invalid canonical memberId|memberId must match/i, "회원번호를 숫자 또는 ASD-숫자 형식으로 입력해 주세요."],
  [/identity-conflict/i, "정정 발급에서는 기존 회원번호를 변경할 수 없습니다."],
  [/invalid member name/i, "회원 성명을 입력해 주세요."],
  [/invalid joinedAt/i, "입회일을 올바른 날짜로 입력해 주세요."],
  [/invalid onboarding date/i, "인정일과 기준일을 올바른 날짜로 입력해 주세요."],
  [/baselineAsOf must not be before recognizedAt/i, "기준 수련기록 기준일은 인정일과 같거나 이후여야 합니다."],
  [/invalid recognized rank fields|invalid recognized rank|invalid rankType|rankValue/i, "이전 인정 단급의 종류와 값을 확인해 주세요."],
  [/invalid or duplicate entryId/i, "이전 인정 단급 항목을 삭제한 뒤 다시 추가해 주세요."],
  [/invalid rankDate/i, "단급 취득일을 올바른 날짜로 입력하거나 미상으로 두세요."],
  [/recognized ranks must be strictly ascending/i, "이전 인정 단급부터 현재 단급까지 낮은 단급에서 높은 단급 순서로 입력해 주세요."],
  [/currentRankEntryId must identify the highest rank/i, "현재 단급이 인정 단급 이력의 마지막이 되도록 입력해 주세요."],
  [/invalid currentRankSessionBaseline/i, "현급 기준 수련횟수는 0 이상의 정수로 입력하거나 미상으로 두세요."],
  [/invalid kata baseline fields|invalid or duplicate canonical kataId/i, "카타는 목록에서 중복 없이 선택해 주세요."],
  [/kata baseline count is required/i, "횟수 미상을 해제한 카타의 기준 수련횟수를 입력해 주세요."],
  [/invalid kata baseline count/i, "카타 기준 수련횟수는 0 이상의 정수로 입력하거나 미상으로 두세요."],
  [/examDate must/i, "심사일을 올바른 날짜로 입력해 주세요."],
  [/rankDate must not be after recognizedAt/i, "원 단급 취득일은 삼성당 인정일보다 늦을 수 없습니다."],
  [/rankDate must|recognizedAt must/i, "단급 취득일과 인정일을 올바른 날짜로 입력해 주세요."],
  [/invalid promotion eventType|invalid .*promotion payload fields|invalid advance-one payload fields/i, "승급·승단 종류와 입력값을 확인해 주세요."],
  [/kyu rankValue/i, "급 값은 1부터 9까지의 정수로 입력해 주세요."],
  [/dan rankValue/i, "단 값은 1 이상의 정수로 입력해 주세요."],
  [/invalid targetRank fields/i, "목표 단급의 종류와 값을 확인해 주세요."]
];

export function koreanInputError(rawMessage: string): PresentedIssuerMessage {
  const translated = INPUT_ERROR_MESSAGES.find(([pattern]) => pattern.test(rawMessage))?.[1];
  if (translated) return { message: translated, diagnostic: null };
  if (/[가-힣]/.test(rawMessage)) return { message: rawMessage, diagnostic: null };
  return {
    message: "입력값을 확인해 주세요.",
    diagnostic: rawMessage || null
  };
}

export function koreanInputErrors(rawMessages: readonly string[]): PresentedIssuerMessage[] {
  const seen = new Set<string>();
  return rawMessages.flatMap(rawMessage => {
    const presented = koreanInputError(rawMessage);
    const key = `${presented.message}\u0000${presented.diagnostic ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [presented];
  });
}

export function issuerFailure(error: unknown, fallback: string): PresentedIssuerMessage {
  const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const translated = INPUT_ERROR_MESSAGES.find(([pattern]) => pattern.test(rawMessage))?.[1];
  if (translated) return { message: translated, diagnostic: null };
  return {
    message: fallback,
    diagnostic: rawMessage && rawMessage !== fallback ? rawMessage : null
  };
}
