import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { DefaultRoutingEngine } from '../routing-engine.js';
import type {
  PatientRecord,
  UrgencyLevel,
  CarePathway,
} from '@ai-care-coordinator/shared';

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_URGENCY_LEVELS: UrgencyLevel[] = [
  'Emergency',
  'Urgent',
  'Semi-Urgent',
  'Non-Urgent',
  'Self-Care',
];

const VALID_PATHWAYS: CarePathway[] = [
  'Emergency Department',
  'Urgent Care Clinic',
  'Primary Care Appointment',
  'Specialist Referral',
  'Self-Care Guidance',
];

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Generates a minimal PatientRecord suitable for routing.
 */
const minimalPatientRecordArb: fc.Arbitrary<PatientRecord> = fc
  .uuid()
  .map((sessionId) => ({
    sessionId,
    createdAt: new Date().toISOString(),
    status: 'in_progress' as const,
  }));

/**
 * Generates a random valid UrgencyLevel.
 */
const urgencyLevelArb: fc.Arbitrary<UrgencyLevel> =
  fc.constantFrom(...VALID_URGENCY_LEVELS);

/**
 * Generates either "Non-Urgent" or "Self-Care" urgency levels.
 */
const selfCareUrgencyArb: fc.Arbitrary<UrgencyLevel> =
  fc.constantFrom<UrgencyLevel>('Non-Urgent', 'Self-Care');

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Routing Engine Property Tests', () => {
  const engine = new DefaultRoutingEngine();

  // Feature: ai-care-coordinator, Property 8: Routing recommendation completeness
  it('Property 8: any valid UrgencyLevel produces a recommendation with valid pathway, non-empty wait time, and non-empty nextSteps', async () => {
    // **Validates: Requirements 4.1, 4.2**
    await fc.assert(
      fc.asyncProperty(
        minimalPatientRecordArb,
        urgencyLevelArb,
        async (record, urgency) => {
          const result = await engine.routePatient(record, urgency);

          // Pathway must be from the predefined set
          expect(VALID_PATHWAYS).toContain(result.pathway);

          // estimatedWaitTime must be a non-empty string
          expect(typeof result.estimatedWaitTime).toBe('string');
          expect(result.estimatedWaitTime.length).toBeGreaterThan(0);

          // nextSteps must be a non-empty array
          expect(Array.isArray(result.nextSteps)).toBe(true);
          expect(result.nextSteps.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: ai-care-coordinator, Property 9: Emergency routing produces alert
  it('Property 9: Emergency urgency always routes to Emergency Department with a non-empty alert', async () => {
    // **Validates: Requirements 4.3**
    await fc.assert(
      fc.asyncProperty(
        minimalPatientRecordArb,
        async (record) => {
          const result = await engine.routePatient(record, 'Emergency');

          // Pathway must be Emergency Department
          expect(result.pathway).toBe('Emergency Department');

          // Alert must be present and non-empty
          expect(typeof result.alert).toBe('string');
          expect(result.alert!.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: ai-care-coordinator, Property 10: Non-Urgent and Self-Care routing includes self-care information
  it('Property 10: Non-Urgent or Self-Care urgency includes selfCareInstructions or educationalResources', async () => {
    // **Validates: Requirements 4.4**
    await fc.assert(
      fc.asyncProperty(
        minimalPatientRecordArb,
        selfCareUrgencyArb,
        async (record, urgency) => {
          const result = await engine.routePatient(record, urgency);

          const hasSelfCare =
            typeof result.selfCareInstructions === 'string' &&
            result.selfCareInstructions.length > 0;

          const hasResources =
            Array.isArray(result.educationalResources) &&
            result.educationalResources.length > 0;

          // At least one of selfCareInstructions or educationalResources must be present
          expect(hasSelfCare || hasResources).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
