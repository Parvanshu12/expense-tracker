/** What people say they want from the app. Chosen at onboarding (several allowed) and shared with the coach. */
export const MAIN_GOALS = [
  { id: 'track_expenses', label: 'Understand where my money goes' },
  { id: 'cut_unnecessary', label: 'Cut spending I don’t need' },
  { id: 'emergency_fund', label: 'Build a 6-month emergency fund' },
  { id: 'save_for_purchase', label: 'Save for something big (a phone, trip or wedding)' },
  { id: 'pay_off_debt', label: 'Pay off a loan or credit card' },
  { id: 'grow_wealth', label: 'Grow my long-term savings' },
] as const;

export type MainGoalId = (typeof MAIN_GOALS)[number]['id'];

export const MAIN_GOAL_IDS = MAIN_GOALS.map((g) => g.id) as [MainGoalId, ...MainGoalId[]];

export function mainGoalLabels(ids: readonly string[] | null | undefined): string[] {
  return (ids ?? []).flatMap((id) => MAIN_GOALS.find((g) => g.id === id)?.label ?? []);
}
