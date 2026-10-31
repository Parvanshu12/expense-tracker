import type { MainGoalId } from './main-goals';

/** Who the user is; shapes questions, feedback and coaching. */
export const USER_TYPES = [
  { id: 'salaried', label: 'I work in an office or have a job', hint: 'Fixed monthly salary', goals: ['track_expenses', 'emergency_fund', 'grow_wealth'] },
  { id: 'business', label: 'I run a business or shop', hint: 'Income changes month to month', goals: ['track_expenses', 'emergency_fund', 'cut_unnecessary'] },
  { id: 'freelancer', label: 'I freelance or do gig work', hint: 'Paid by clients or per job', goals: ['track_expenses', 'emergency_fund'] },
  { id: 'student', label: "I'm a student", hint: 'Pocket money or allowance', goals: ['track_expenses', 'save_for_purchase'] },
  { id: 'homemaker', label: 'I manage the household', hint: 'Groceries, bills, school fees', goals: ['track_expenses', 'cut_unnecessary'] },
  { id: 'retired', label: "I'm retired", hint: 'Pension or savings', goals: ['track_expenses', 'cut_unnecessary'] },
] as const satisfies readonly { id: string; label: string; hint: string; goals: readonly MainGoalId[] }[];

export type UserTypeId = (typeof USER_TYPES)[number]['id'];
export const USER_TYPE_IDS = USER_TYPES.map((t) => t.id) as [UserTypeId, ...UserTypeId[]];

export function userTypeLabel(id: string | null | undefined): string | null {
  return USER_TYPES.find((t) => t.id === id)?.label ?? null;
}
