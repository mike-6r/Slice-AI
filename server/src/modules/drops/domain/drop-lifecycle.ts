import { ConflictException } from '@nestjs/common';

export type DropLifecycleState =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'READY_TO_PUBLISH'
  | 'LIVE'
  | 'SOLD_OUT'
  | 'CLOSED'
  | 'CANCELLED'
  | 'BLOCKED';

const transitions: Record<DropLifecycleState, DropLifecycleState[]> = {
  DRAFT: ['READY_FOR_REVIEW', 'CANCELLED', 'BLOCKED'],
  READY_FOR_REVIEW: ['DRAFT', 'READY_TO_PUBLISH', 'CANCELLED', 'BLOCKED'],
  READY_TO_PUBLISH: ['LIVE', 'DRAFT', 'CANCELLED', 'BLOCKED'],
  LIVE: ['SOLD_OUT', 'CLOSED', 'BLOCKED'],
  SOLD_OUT: ['CLOSED', 'BLOCKED'],
  CLOSED: [],
  CANCELLED: [],
  BLOCKED: ['DRAFT', 'CANCELLED'],
};

export function assertDropTransition(
  from: DropLifecycleState,
  to: DropLifecycleState,
): void {
  if (!transitions[from].includes(to))
    throw new ConflictException({
      code: 'DROP_TRANSITION_INVALID',
      message: `A Drop cannot move from ${from} to ${to}.`,
    });
}

export function isDropEditable(state: DropLifecycleState): boolean {
  return state === 'DRAFT';
}
