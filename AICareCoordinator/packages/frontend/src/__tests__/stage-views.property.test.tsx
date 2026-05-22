// @vitest-environment jsdom
// Feature: ai-care-coordinator, Property 12: Stage result views render all required fields
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { EntityView } from '../EntityView.js';
import { TriageView } from '../TriageView.js';
import { RoutingView } from '../RoutingView.js';
import type {
  ClinicalEntity,
  EntityCategory,
  TriageResult,
  UrgencyLevel,
  RoutingRecommendation,
  CarePathway,
} from '@ai-care-coordinator/shared';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const entityCategoryArb: fc.Arbitrary<EntityCategory> = fc.constantFrom(
  'SYMPTOM',
  'CONDITION',
  'MEDICATION',
  'ANATOMY',
  'TIME_EXPRESSION',
);

const clinicalEntityArb: fc.Arbitrary<ClinicalEntity> = fc.record({
  text: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  category: entityCategoryArb,
  type: fc.constantFrom('DX_NAME', 'GENERIC_NAME', 'BRAND_NAME', 'PROCEDURE_NAME'),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  beginOffset: fc.nat({ max: 500 }),
  endOffset: fc.nat({ max: 1000 }),
});

const urgencyLevelArb: fc.Arbitrary<UrgencyLevel> = fc.constantFrom(
  'Emergency',
  'Urgent',
  'Semi-Urgent',
  'Non-Urgent',
  'Self-Care',
);

const triageResultArb: fc.Arbitrary<TriageResult> = fc.record({
  urgencyLevel: urgencyLevelArb,
  rationale: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
  matchedRules: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  flaggedForReview: fc.boolean(),
});

const carePathwayArb: fc.Arbitrary<CarePathway> = fc.constantFrom(
  'Emergency Department',
  'Urgent Care Clinic',
  'Primary Care Appointment',
  'Specialist Referral',
  'Self-Care Guidance',
);

const routingRecommendationArb: fc.Arbitrary<RoutingRecommendation> = fc.record({
  pathway: carePathwayArb,
  estimatedWaitTime: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  nextSteps: fc.array(
    fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
    { minLength: 1, maxLength: 5 },
  ),
  alert: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  selfCareInstructions: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  educationalResources: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 80 }), { minLength: 1, maxLength: 3 }),
    { nil: undefined },
  ),
});

// **Validates: Requirements 5.4, 5.5, 5.6**
describe('Property 12: Stage result views render all required fields', () => {
  it('EntityView renders category and confidence for every entity', () => {
    fc.assert(
      fc.property(
        fc.array(clinicalEntityArb, { minLength: 1, maxLength: 8 }),
        (entities) => {
          cleanup();
          const { getAllByTestId } = render(
            <EntityView entities={entities} requiresManualReview={false} />,
          );

          const items = getAllByTestId('entity-item');
          expect(items.length).toBe(entities.length);

          const categories = getAllByTestId('entity-category');
          const confidences = getAllByTestId('entity-confidence');

          expect(categories.length).toBe(entities.length);
          expect(confidences.length).toBe(entities.length);

          for (let i = 0; i < entities.length; i++) {
            expect(categories[i].textContent).toBe(entities[i].category);
            expect(confidences[i].textContent).toContain('confidence');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('TriageView renders urgencyLevel and rationale', () => {
    fc.assert(
      fc.property(triageResultArb, (triageResult) => {
        cleanup();
        const { getByTestId } = render(<TriageView triageResult={triageResult} />);

        const urgencyEl = getByTestId('urgency-level');
        expect(urgencyEl.textContent).toBe(triageResult.urgencyLevel);

        const rationaleEl = getByTestId('rationale');
        expect(rationaleEl.textContent).toContain(triageResult.rationale);
      }),
      { numRuns: 100 },
    );
  });

  it('RoutingView renders pathway, waitTime, and nextSteps', () => {
    fc.assert(
      fc.property(routingRecommendationArb, (rec) => {
        cleanup();
        const { getByTestId } = render(<RoutingView routingRecommendation={rec} />);

        const pathwayEl = getByTestId('care-pathway');
        expect(pathwayEl.textContent).toContain(rec.pathway);

        const waitTimeEl = getByTestId('wait-time');
        expect(waitTimeEl.textContent).toContain(rec.estimatedWaitTime);

        const nextStepsEl = getByTestId('next-steps');
        for (const step of rec.nextSteps) {
          expect(nextStepsEl.textContent).toContain(step);
        }
      }),
      { numRuns: 100 },
    );
  });
});
