import { describe, it, expect } from 'vitest';
import { createRecordStore } from '../api-handler.js';
import { DynamoDBPatientRecordStore, LocalPatientRecordStore } from '../patient-record-store.js';

describe('Store Selection Unit Tests', () => {
  it('returns DynamoDBPatientRecordStore when USE_DYNAMODB=true with table name', () => {
    // Requirements: 7.1
    const store = createRecordStore({
      USE_DYNAMODB: 'true',
      DYNAMODB_TABLE_NAME: 'my-table',
    });
    expect(store).toBeInstanceOf(DynamoDBPatientRecordStore);
  });

  it('returns LocalPatientRecordStore when USE_DYNAMODB is undefined', () => {
    // Requirements: 7.2
    const store = createRecordStore({});
    expect(store).toBeInstanceOf(LocalPatientRecordStore);
  });

  it('returns LocalPatientRecordStore when USE_DYNAMODB=false', () => {
    // Requirements: 7.2
    const store = createRecordStore({
      USE_DYNAMODB: 'false',
    });
    expect(store).toBeInstanceOf(LocalPatientRecordStore);
  });
});
