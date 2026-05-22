// Feature: aws-deployment, Property 4: ApiClient base URL is driven by VITE_API_URL
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ApiClient } from '../api-client.js';

/**
 * **Validates: Requirements 8.2, 8.3**
 *
 * Property 4: ApiClient base URL is driven by VITE_API_URL
 *
 * For any non-empty URL string provided as the base URL, the ApiClient should
 * use that string as the base URL. When no URL is provided, it should default
 * to "/api".
 */
describe('Property 4: ApiClient base URL is driven by VITE_API_URL', () => {
  it('uses the provided URL string as the base URL for any non-empty URL', () => {
    fc.assert(
      fc.property(
        fc.webUrl().filter((url) => url.length > 0),
        (url) => {
          const client = new ApiClient(url);
          expect((client as any).baseUrl).toBe(url);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses arbitrary non-empty strings as the base URL when explicitly provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (url) => {
          const client = new ApiClient(url);
          expect((client as any).baseUrl).toBe(url);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('defaults to /api when no URL is provided (undefined fallback)', () => {
    const client = new ApiClient();
    expect((client as any).baseUrl).toBe('/api');
  });
});
