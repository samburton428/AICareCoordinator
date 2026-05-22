import { describe, it, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AiCareCoordinatorStack } from '../lib/ai-care-coordinator-stack.js';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ── Test Setup ───────────────────────────────────────────────────────────────

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
  const stack = new AiCareCoordinatorStack(app, 'UnitTestStack');
  return Template.fromStack(stack);
}

// ── Unit Tests ───────────────────────────────────────────────────────────────

describe('CDK Stack Unit Tests', () => {
  describe('Lambda Function', () => {
    it('uses Node.js 20.x runtime', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
      });
    });

    it('has 512 MB memory', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 512,
      });
    });

    it('has 30 second timeout', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 30,
      });
    });

    it('has USE_DYNAMODB and DYNAMODB_TABLE_NAME environment variables', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            USE_DYNAMODB: 'true',
            DYNAMODB_TABLE_NAME: Match.anyValue(),
          }),
        },
      });
    });

    it('has BEDROCK_MODEL_ID environment variable', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            BEDROCK_MODEL_ID: 'us.amazon.nova-lite-v1:0',
          }),
        },
      });
    });

    it('has bedrock:InvokeModel IAM permission', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'bedrock:InvokeModel',
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  describe('DynamoDB Table', () => {
    it('has sessionId partition key', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: [
          { AttributeName: 'sessionId', KeyType: 'HASH' },
        ],
      });
    });

    it('uses PAY_PER_REQUEST billing mode', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('has point-in-time recovery enabled', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });
  });

  describe('S3 Bucket', () => {
    it('has public access blocked', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });
  });

  describe('CloudFront Distribution', () => {
    it('has index.html as default root object', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          DefaultRootObject: 'index.html',
        }),
      });
    });

    it('has SPA error response for 403 and 404', () => {
      const template = createTemplate();
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 403,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
            Match.objectLike({
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
          ]),
        }),
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    it('includes ApiUrl output', () => {
      const template = createTemplate();
      const outputs = template.toJSON().Outputs;
      expect(outputs).toHaveProperty('ApiUrl');
    });

    it('includes FrontendUrl output', () => {
      const template = createTemplate();
      const outputs = template.toJSON().Outputs;
      expect(outputs).toHaveProperty('FrontendUrl');
    });
  });
});
