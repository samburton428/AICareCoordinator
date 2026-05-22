import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import type { Construct } from 'constructs';

export class AiCareCoordinatorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Task 2.1: DynamoDB table
    const table = new dynamodb.Table(this, 'PatientRecordsTable', {
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Task 2.2: Lambda function
    const fn = new lambda.Function(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../dist/lambda'),
      environment: {
        USE_DYNAMODB: 'true',
        DYNAMODB_TABLE_NAME: table.tableName,
      },
    });

    // Task 2.3: IAM least-privilege permissions
    table.grant(fn, 'dynamodb:PutItem', 'dynamodb:GetItem');

    // Bedrock invoke permission — need both inference-profile and foundation-model resources
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0`,
        `arn:aws:bedrock:*:*:inference-profile/us.amazon.nova-lite-v1:0`,
      ],
    }));

    // Bedrock model environment variable
    fn.addEnvironment('BEDROCK_MODEL_ID', 'us.amazon.nova-lite-v1:0');

    // Task 2.5: S3 bucket for frontend assets
    const siteBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront OAI and distribution
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI');
    siteBucket.grantRead(originAccessIdentity);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessIdentity(siteBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Task 2.4: HTTP API Gateway with Lambda integration
    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [
          `https://${distribution.distributionDomainName}`,
          'http://localhost:3000',
          'http://localhost:5173',
        ],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration('LambdaIntegration', fn),
    });

    // Also add a root route for $default catch-all behavior
    httpApi.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration('LambdaRootIntegration', fn),
    });

    // BucketDeployment for frontend assets
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset('../packages/frontend/dist')],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Task 2.6: CloudFormation outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: distribution.distributionDomainName,
    });
  }
}
