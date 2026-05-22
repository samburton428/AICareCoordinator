import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { serializePatientRecord, deserializePatientRecord } from '../serialization.js';
import type { PatientRecord } from '../types.js';

// ── Generators ───────────────────────────────────────────────────────────────

const validStatuses = ['in_progress', 'completed', 'error'] as const;

const statusArb = fc.constantFrom(...validStatuses);

/**
 * Generates a minimal valid PatientRecord with required fields only.
 * sessionId and createdAt are non-empty strings; status is from the valid set.
 */
const patientRecordArb: fc.Arbitrary<PatientRecord> = fc.record({
  sessionId: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  createdAt: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  status: statusArb,
});

// ── Property 15 ──────────────────────────────────────────────────────────────

describe('Serialization Property Tests', () => {
  // Feature: ai-care-coordinator, Property 15: Patient_Record JSON serialization round-trip
  it('Property 15: serializing then deserializing a valid PatientRecord produces an equivalent object', () => {
    // **Validates: Requirements 7.1, 7.2, 7.3**
    fc.assert(
      fc.property(patientRecordArb, (record) => {
        const json = serializePatientRecord(record);
        const result = deserializePatientRecord(json);

        // Result should NOT have an error property
        expect(result).not.toHaveProperty('error');
        // Result should deep-equal the original record
        expect(result).toEqual(record);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ai-care-coordinator, Property 16: Malformed JSON produces descriptive error
  describe('Property 16: malformed JSON produces descriptive error', () => {
    // **Validates: Requirements 7.4**

    it('invalid JSON syntax returns an object with an error string', () => {
      // Generate arbitrary strings that are NOT valid JSON
      const invalidJsonArb = fc.string().filter((s) => {
        try {
          JSON.parse(s);
          return false; // skip strings that happen to be valid JSON
        } catch {
          return true;
        }
      });

      fc.assert(
        fc.property(invalidJsonArb, (input) => {
          const result = deserializePatientRecord(input);
          expect(result).toHaveProperty('error');
          expect(typeof (result as { error: string }).error).toBe('string');
          expect((result as { error: string }).error.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    it('valid JSON missing required fields returns an object with an error string', () => {
      // Generate valid JSON objects that are missing at least one required PatientRecord field
      const missingFieldsArb = fc.oneof(
        // Empty object
        fc.constant('{}'),
        // Object with only sessionId
        fc.string({ minLength: 1 }).map((s) => JSON.stringify({ sessionId: s })),
        // Object with only createdAt
        fc.string({ minLength: 1 }).map((s) => JSON.stringify({ createdAt: s })),
        // Object with only status
        fc.constantFrom(...validStatuses).map((s) => JSON.stringify({ status: s })),
        // Object missing status
        fc.record({
          sessionId: fc.string({ minLength: 1 }),
          createdAt: fc.string({ minLength: 1 }),
        }).map((obj) => JSON.stringify(obj)),
        // Object missing sessionId
        fc.record({
          createdAt: fc.string({ minLength: 1 }),
          status: fc.constantFrom(...validStatuses),
        }).map((obj) => JSON.stringify(obj)),
        // Object missing createdAt
        fc.record({
          sessionId: fc.string({ minLength: 1 }),
          status: fc.constantFrom(...validStatuses),
        }).map((obj) => JSON.stringify(obj)),
        // JSON arrays and primitives
        fc.array(fc.anything()).map((arr) => JSON.stringify(arr)),
        fc.double().map((n) => JSON.stringify(n)),
        fc.constant('null'),
        fc.constant('true'),
        fc.constant('"just a string"'),
      );

      fc.assert(
        fc.property(missingFieldsArb, (input) => {
          const result = deserializePatientRecord(input);
          expect(result).toHaveProperty('error');
          expect(typeof (result as { error: string }).error).toBe('string');
          expect((result as { error: string }).error.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });
  });
});
