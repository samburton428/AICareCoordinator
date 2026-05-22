import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AiCareCoordinatorStack } from '../lib/ai-care-coordinator-stack.js';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ── Test Setup ───────────────────────────────────────────────────────────────

// CDK resolves asset paths relative to process.cwd(). The stack uses
// '../dist/lambda' and '../packages/frontend/dist' (relative to infra/).
// When vitest runs from the project root, these resolve one level up.
// We create stub directories so CDK synth succeeds in the test environment.

const LAMBDA_STUB = resolve(process.cwd(), '..', 'dist', 'lambda');
const FRONTEND_STUB = resolve(process.cwd(), '..', 'packages', 'frontend', 'dist');

beforeAll(() => {
  for (const dir of [LAMBDA_STUB, FRONTEND_STUB]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, '.stub'), '');
    }
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTemplate(): Template {
  const app = new cdk.App();
  const stack = new AiCareCoordinatorStack(app, 'PropertyTestStack');
  return Template.fromStack(stack);
}

/**
 * Extract IAM permissions for the Lambda execution role.
 *
 * CDK grants permissions in two ways:
 * 1. Inline IAM::Policy resources attached to the role (e.g. DynamoDB grants)
 * 2. Managed policy ARNs on the IAM::Role (e.g. AWSLambdaBasicExecutionRole for logs)
 *
 * We collect explicit inline actions and also resolve well-known managed policies
 * to their constituent actions.
 */
function extractLambdaRolePermissions(template: Template): {
  inlineActions: string[];
  managedPolicies: string[];
} {
  const json = template.toJSON();
  const resources = json.Resources;
  const inlineActions: string[] = [];
  const managedPolicies: string[] = [];

  // Find the API handler Lambda function's Role logical ID
  let lambdaRoleRef: string | undefined;
  for (const [, resource] of Object.entries(resources) as [string, any][]) {
    if (resource.Type === 'AWS::Lambda::Function' && resource.Properties?.Runtime === 'nodejs20.x') {
      const roleRef = resource.Properties?.Role?.['Fn::GetAtt']?.[0];
      if (roleRef) {
        lambdaRoleRef = roleRef;
        break;
      }
    }
  }

  if (!lambdaRoleRef) return { inlineActions, managedPolicies };

  // Extract managed policy ARNs from the role
  const role = resources[lambdaRoleRef];
  if (role?.Type === 'AWS::IAM::Role') {
    const arns = role.Properties?.ManagedPolicyArns || [];
    for (const arn of arns) {
      // CDK uses Fn::Join to construct the ARN
      if (arn?.['Fn::Join']) {
        const parts = arn['Fn::Join'][1] as string[];
        const arnStr = parts.filter((p: any) => typeof p === 'string').join('');
        managedPolicies.push(arnStr);
      } else if (typeof arn === 'string') {
        managedPolicies.push(arn);
      }
    }
  }

  // Extract inline policy actions attached to the role
  for (const [, resource] of Object.entries(resources) as [string, any][]) {
    if (resource.Type === 'AWS::IAM::Policy') {
      const roles = resource.Properties?.Roles;
      if (Array.isArray(roles)) {
        const attachedToLambdaRole = roles.some(
          (r: any) => r.Ref === lambdaRoleRef,
        );
        if (attachedToLambdaRole) {
          const statements = resource.Properties?.PolicyDocument?.Statement;
          if (Array.isArray(statements)) {
            for (const stmt of statements) {
              const stmtActions = stmt.Action;
              if (Array.isArray(stmtActions)) {
                inlineActions.push(...stmtActions);
              } else if (typeof stmtActions === 'string') {
                inlineActions.push(stmtActions);
              }
            }
          }
        }
      }
    }
  }

  return { inlineActions, managedPolicies };
}

// ── Property Tests ───────────────────────────────────────────────────────────

describe('CDK Stack Property Tests', () => {
  // Feature: aws-deployment, Property 1: CDK synth produces all required resource types
  it('Property 1: CDK synth produces all required resource types', () => {
    // **Validates: Requirements 1.1**
    fc.assert(
      fc.property(fc.constant(true), () => {
        const template = createTemplate();
        const resources = template.toJSON().Resources;

        const typeCounts: Record<string, number> = {};
        for (const resource of Object.values(resources) as any[]) {
          typeCounts[resource.Type] = (typeCounts[resource.Type] || 0) + 1;
        }

        // Must contain at least one of each required resource type
        expect(typeCounts['AWS::Lambda::Function']).toBeGreaterThanOrEqual(1);
        expect(typeCounts['AWS::ApiGatewayV2::Api']).toBeGreaterThanOrEqual(1);
        expect(typeCounts['AWS::DynamoDB::Table']).toBeGreaterThanOrEqual(1);
        expect(typeCounts['AWS::S3::Bucket']).toBeGreaterThanOrEqual(1);
        expect(typeCounts['AWS::CloudFront::Distribution']).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  }, 30_000);

  // Feature: aws-deployment, Property 2: IAM permissions are exactly the expected set
  it('Property 2: IAM permissions are exactly the expected set', () => {
    // **Validates: Requirements 6.2, 6.3, 6.4**
    const expectedInlineActions = new Set([
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'bedrock:InvokeModel',
    ]);

    fc.assert(
      fc.property(fc.constant(true), () => {
        const template = createTemplate();
        const { inlineActions, managedPolicies } = extractLambdaRolePermissions(template);

        // Inline policy should grant exactly DynamoDB PutItem and GetItem
        expect(new Set(inlineActions)).toEqual(expectedInlineActions);

        // Managed policy should include AWSLambdaBasicExecutionRole
        // (which grants logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents)
        const hasBasicExecRole = managedPolicies.some(
          (arn) => arn.includes('AWSLambdaBasicExecutionRole'),
        );
        expect(hasBasicExecRole).toBe(true);

        // No other managed policies should be attached
        expect(managedPolicies).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});
