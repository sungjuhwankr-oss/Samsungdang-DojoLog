import kataCatalog from "../../reference/kata-catalog.v2.json";
import {
  generateOnboardingRankEntryId,
  type KataBaseline,
  type MemberOnboardingPayload,
  type OnboardingRank
} from "../onboarding-credential";

export const ONBOARDING_KATA_OPTIONS = kataCatalog.kata.map(item => ({
  id: item.id,
  name: item.nameKo
}));

export function createPreviousRankRow(entryId = generateOnboardingRankEntryId()): OnboardingRank {
  return { entryId, rankType: "kyu", rankValue: 9, rankDate: null };
}

export function updatePreviousRankRow(
  rows: readonly OnboardingRank[],
  index: number,
  change: Partial<Omit<OnboardingRank, "entryId">>
): OnboardingRank[] {
  return rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...change, entryId: row.entryId } : row);
}

export function nextKataBaseline(rows: readonly KataBaseline[]): KataBaseline | null {
  const selected = new Set(rows.map(row => row.kataId));
  const option = ONBOARDING_KATA_OPTIONS.find(item => !selected.has(item.id));
  return option ? { kataId: option.id, count: null } : null;
}

export function updateKataBaseline(
  rows: readonly KataBaseline[],
  index: number,
  change: Partial<KataBaseline>
): KataBaseline[] {
  return rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...change } : row);
}

type BuildOnboardingPayloadInput = {
  onboardingId: string;
  revision: number;
  supersedesCredentialId: string | null;
  recognizedAt: string;
  name: string;
  memberId: string;
  joinedAt: string;
  previousRanks: readonly OnboardingRank[];
  currentRankEntryId: string;
  currentRankType: "kyu" | "dan";
  currentRankValue: number;
  currentRankDate: string | null;
  baselineAsOf: string;
  currentRankSessionBaseline: number | null;
  kataBaselines: readonly KataBaseline[];
};

export function buildOnboardingPayload(input: BuildOnboardingPayloadInput): MemberOnboardingPayload {
  const currentRank: OnboardingRank = {
    entryId: input.currentRankEntryId,
    rankType: input.currentRankType,
    rankValue: input.currentRankValue,
    rankDate: input.currentRankDate
  };
  return {
    onboardingId: input.onboardingId,
    revision: input.revision,
    supersedesCredentialId: input.supersedesCredentialId,
    recognizedAt: input.recognizedAt,
    membership: { name: input.name, memberId: input.memberId, joinedAt: input.joinedAt },
    recognizedRanks: [...input.previousRanks, currentRank],
    currentRankEntryId: input.currentRankEntryId,
    baselineAsOf: input.baselineAsOf,
    currentRankSessionBaseline: input.currentRankSessionBaseline,
    kataBaselines: [...input.kataBaselines]
  };
}
