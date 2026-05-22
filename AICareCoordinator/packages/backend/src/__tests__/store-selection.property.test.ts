import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createRecordStore } from '../api-handler.js';
import { DynamoDBPatientRecordStore, LocalPatientRecordStore } from '../patient-record-store.js';

// Feature: aws-deployment, Property 3: Store selection is determined by USE_DYNAMODB value

describe('Store Selection Property Tests', () => {
  // Feature: aws-deployment, Property 3: Store selection is determined by USE_DYNAMODB value
  it('Property 3: createRecordStore returns DynamoDBPatientRecordStore iff USE_DYNAMODB === "true"', () => {
    // **Validates: Requirements 7.1, 7.2**
    fc.assert(
      fc.property(fc.string(), (useDynamoDbValue) => {
        const env: Record<string, string | undefined> = {
          USE_DYNAMODB: useDynamoDbValue,
          DYNAMODB_TABLE_NAME: 'test-table',
        };

        const store = createRecordStore(env);

        if (useDynamoDbValue === 'true') {
          expect(store).toBeInstanceOf(DynamoDBPatientRecordStore);
        } else {
          expect(store).toBeInstanceOf(LocalPatientRecordStore);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 3: createRecordStore returns LocalPatientRecordStore when USE_DYNAMODB is undefined', () => {
    // **Validates: Requirements 7.1, 7.2**
    const env: Record<string, string | undefined> = {
      USE_DYNAMODB: undefined,
      DYNAMODB_TABLE_NAME: undefined,
    };

    const store = createRecordStore(env);
    expect(store).toBeInstanceOf(LocalPatientRecordStore);
  });
});
