// Feature: ai-care-coordinator, Property 11: Dashboard stage progression follows correct order
// Feature: ai-care-coordinator, Property 13: Reset returns dashboard to initial state
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Model the dashboard stage progression as pure logic.
 * Stages: 1=Symptom Collection, 2=Clinical Extraction, 3=Urgency Assessment, 4=Care Routing
 */

interface DashboardState {
  currentStage: number;
  transcript: unknown | null;
  extractedEntities: unknown[] | null;
  triageResult: unknown | null;
  routingRecommendation: unknown | null;
}

const INITIAL_STATE: DashboardState = {
  currentStage: 1,
  transcript: null,
  extractedEntities: null,
  triageResult: null,
  routingRecommendation: null,
};

const MAX_STAGE = 4;

type Action = { type: 'advance' } | { type: 'reset' };

function applyAction(state: DashboardState, action: Action): DashboardState {
  if (action.type === 'advance') {
    return {
      ...state,
      currentStage: Math.min(state.currentStage + 1, MAX_STAGE),
    };
  }
  // reset
  return { ...INITIAL_STATE };
}

function applyActions(actions: Action[]): DashboardState {
  return actions.reduce((s, a) => applyAction(s, a), { ...INITIAL_STATE });
}

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.constant<Action>({ type: 'advance' }),
  fc.constant<Action>({ type: 'reset' }),
);

// **Validates: Requirements 5.3**
describe('Property 11: Dashboard stage progression follows correct order', () => {
  it('stages progress in order 1→2→3→4 with no skips or reordering', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 30 }), (actions) => {
        let state: DashboardState = { ...INITIAL_STATE };

        for (const action of actions) {
          const prev = state.currentStage;
          state = applyAction(state, action);

          if (action.type === 'advance') {
            // Stage advances by exactly 1 or stays at max
            if (prev < MAX_STAGE) {
              expect(state.currentStage).toBe(prev + 1);
            } else {
              expect(state.currentStage).toBe(MAX_STAGE);
            }
          } else {
            // Reset always goes to stage 1
            expect(state.currentStage).toBe(1);
          }

          // Stage is always in valid range [1, 4]
          expect(state.currentStage).toBeGreaterThanOrEqual(1);
          expect(state.currentStage).toBeLessThanOrEqual(MAX_STAGE);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('consecutive advances follow strict 1→2→3→4 order', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (advanceCount) => {
        const actions: Action[] = Array.from({ length: advanceCount }, () => ({ type: 'advance' as const }));
        const visited: number[] = [1];

        let state: DashboardState = { ...INITIAL_STATE };
        for (const action of actions) {
          state = applyAction(state, action);
          visited.push(state.currentStage);
        }

        // Verify monotonically non-decreasing
        for (let i = 1; i < visited.length; i++) {
          expect(visited[i]).toBeGreaterThanOrEqual(visited[i - 1]);
          // Never skip a stage (increase by at most 1)
          expect(visited[i] - visited[i - 1]).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// **Validates: Requirements 5.7**
describe('Property 13: Reset returns dashboard to initial state', () => {
  it('reset always returns to stage 1 with all data cleared', () => {
    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 0, maxLength: 30 }),
        (actions) => {
          // Apply random actions to reach an arbitrary state
          let state = applyActions(actions);

          // Now reset
          state = applyAction(state, { type: 'reset' });

          // Verify initial state
          expect(state.currentStage).toBe(INITIAL_STATE.currentStage);
          expect(state.transcript).toBe(INITIAL_STATE.transcript);
          expect(state.extractedEntities).toBe(INITIAL_STATE.extractedEntities);
          expect(state.triageResult).toBe(INITIAL_STATE.triageResult);
          expect(state.routingRecommendation).toBe(INITIAL_STATE.routingRecommendation);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('multiple resets are idempotent', () => {
    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 1, max: 5 }),
        (actions, resetCount) => {
          let state = applyActions(actions);

          // Apply multiple resets
          for (let i = 0; i < resetCount; i++) {
            state = applyAction(state, { type: 'reset' });
          }

          expect(state.currentStage).toBe(1);
          expect(state.transcript).toBeNull();
          expect(state.extractedEntities).toBeNull();
          expect(state.triageResult).toBeNull();
          expect(state.routingRecommendation).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
