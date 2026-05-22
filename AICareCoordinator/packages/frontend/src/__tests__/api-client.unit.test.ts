import { describe, it, expect } from 'vitest';
import { ApiClient } from '../api-client.js';

/**
 * Unit tests for ApiClient URL configuration.
 * Validates: Requirements 8.2, 8.3
 */
describe('ApiClient URL configuration', () => {
  it('uses explicit URL as base URL', () => {
    const client = new ApiClient('https://abc123.execute-api.us-east-1.amazonaws.com');
    expect((client as any).baseUrl).toBe('https://abc123.execute-api.us-east-1.amazonaws.com');
  });

  it('no-argument constructor defaults to /api', () => {
    const client = new ApiClient();
    expect((client as any).baseUrl).toBe('/api');
  });
});
