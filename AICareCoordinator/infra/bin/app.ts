#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AiCareCoordinatorStack } from '../lib/ai-care-coordinator-stack.ts';

const app = new cdk.App();
new AiCareCoordinatorStack(app, 'AiCareCoordinatorStack');
