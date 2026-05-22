import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BUNDLE_PATH = resolve(process.cwd(), 'dist', 'lambda', 'index.js');

beforeAll(() => {
  // Build the Lambda bundle before running tests
  execSync('bash scripts/build-backend.sh', {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}, 60_000);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Checks that every occurrence of `@aws-sdk/` in the bundle content
 * appears only within an import/require statement (external reference),
 * not as inlined SDK source code.
 *
 * Supports both CJS (require) and ESM (import/from) patterns since
 * the bundle format may change over time.
 */
function allSdkReferencesAreExternalImports(content: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.includes('@aws-sdk/')) continue;
    const trimmed = line.trim();
    // Allow: require("@aws-sdk/...")
    const isRequire = /require\(\s*["']@aws-sdk\//.test(trimmed);
    // Allow: import ... from "@aws-sdk/..."
    const isImport = /from\s+["']@aws-sdk\//.test(trimmed);
    // Allow: import("@aws-sdk/...")
    const isDynamicImport = /import\(\s*["']@aws-sdk\//.test(trimmed);

    if (!isRequire && !isImport && !isDynamicImport) {
      return false;
    }
  }
  return true;
}

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Lambda Bundle Property Tests', () => {
  // Feature: aws-deployment, Property 5: Lambda bundle excludes AWS SDK packages
  it('Property 5: Lambda bundle excludes AWS SDK packages', () => {
    // **Validates: Requirements 9.4**
    fc.assert(
      fc.property(fc.constant(true), () => {
        expect(existsSync(BUNDLE_PATH)).toBe(true);

        const content = readFileSync(BUNDLE_PATH, 'utf-8');

        // The bundle must contain @aws-sdk/ references (the code uses DynamoDB client)
        expect(content).toContain('@aws-sdk/');

        // Every @aws-sdk/ reference must be in an import/require line only
        expect(allSdkReferencesAreExternalImports(content)).toBe(true);
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});
