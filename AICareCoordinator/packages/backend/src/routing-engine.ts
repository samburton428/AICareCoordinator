/* eslint-disable no-console */
declare const console: { error(...args: unknown[]): void };

import type {
  PatientRecord,
  UrgencyLevel,
  RoutingRecommendation,
  CarePathway,
} from '@ai-care-coordinator/shared';

// ── Interface ────────────────────────────────────────────────────────────────

export interface RoutingEngine {
  routePatient(
    record: PatientRecord,
    urgencyLevel: UrgencyLevel,
  ): Promise<RoutingRecommendation>;
}

// ── Urgency → Pathway mapping ────────────────────────────────────────────────

interface PathwayConfig {
  pathway: CarePathway;
  estimatedWaitTime: string;
  nextSteps: string[];
  alert?: string;
  selfCareInstructions?: string;
  educationalResources?: string[];
}

const PATHWAY_MAP: Record<UrgencyLevel, PathwayConfig> = {
  Emergency: {
    pathway: 'Emergency Department',
    estimatedWaitTime: 'Immediate',
    nextSteps: [
      'Proceed to the nearest emergency department immediately.',
      'Call 911 if you are unable to transport yourself safely.',
      'Bring a list of current medications if available.',
    ],
    alert: 'EMERGENCY ALERT: Patient requires immediate emergency care.',
  },
  Urgent: {
    pathway: 'Urgent Care Clinic',
    estimatedWaitTime: '1-2 hours',
    nextSteps: [
      'Visit the nearest urgent care clinic as soon as possible.',
      'Bring your insurance information and photo ID.',
      'Prepare a brief description of your symptoms for the intake nurse.',
    ],
  },
  'Semi-Urgent': {
    pathway: 'Primary Care Appointment',
    estimatedWaitTime: '24-48 hours',
    nextSteps: [
      'Schedule an appointment with your primary care provider within 1-2 days.',
      'Monitor your symptoms and seek urgent care if they worsen.',
      'Note any changes in your condition to share with your provider.',
    ],
  },
  'Non-Urgent': {
    pathway: 'Specialist Referral',
    estimatedWaitTime: '1-2 weeks',
    nextSteps: [
      'A referral to a specialist will be arranged for you.',
      'Continue any current self-care measures in the meantime.',
      'Contact your primary care provider if symptoms change.',
    ],
    selfCareInstructions:
      'Rest, stay hydrated, and take over-the-counter medications as appropriate for symptom relief. Follow up with your specialist at the scheduled appointment.',
    educationalResources: [
      'Understanding your condition: general health information guide',
      'When to seek urgent care: warning signs to watch for',
      'Preparing for your specialist appointment: what to bring and expect',
    ],
  },
  'Self-Care': {
    pathway: 'Self-Care Guidance',
    estimatedWaitTime: 'No wait — self-manage at home',
    nextSteps: [
      'Follow the self-care instructions provided below.',
      'Monitor your symptoms over the next few days.',
      'Seek medical attention if symptoms persist beyond 7 days or worsen.',
    ],
    selfCareInstructions:
      'Get plenty of rest, maintain adequate hydration, and use over-the-counter remedies as needed. Avoid strenuous activity until symptoms resolve.',
    educationalResources: [
      'Home remedies and self-care best practices',
      'Recognizing when self-care is not enough: red-flag symptoms',
      'Healthy lifestyle tips for faster recovery',
    ],
  },
};

// ── Structured error logging ─────────────────────────────────────────────────

function logError(context: string, error: unknown, record?: PatientRecord): void {
  const entry = {
    timestamp: new Date().toISOString(),
    component: 'RoutingEngine',
    errorType: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
    context,
    sessionId: record?.sessionId,
  };
  console.error(JSON.stringify(entry));
}

// ── Default implementation ───────────────────────────────────────────────────

export class DefaultRoutingEngine implements RoutingEngine {
  async routePatient(
    record: PatientRecord,
    urgencyLevel: UrgencyLevel,
  ): Promise<RoutingRecommendation> {
    try {
      const config = PATHWAY_MAP[urgencyLevel];

      if (!config) {
        throw new Error(`Invalid UrgencyLevel: ${String(urgencyLevel)}`);
      }

      const recommendation: RoutingRecommendation = {
        pathway: config.pathway,
        estimatedWaitTime: config.estimatedWaitTime,
        nextSteps: [...config.nextSteps],
      };

      if (config.alert) {
        recommendation.alert = config.alert;
      }

      if (config.selfCareInstructions) {
        recommendation.selfCareInstructions = config.selfCareInstructions;
      }

      if (config.educationalResources) {
        recommendation.educationalResources = [...config.educationalResources];
      }

      return recommendation;
    } catch (error: unknown) {
      logError('routePatient', error, record);

      // Flag record for manual routing
      if (record) {
        record.status = 'error';
      }

      throw error;
    }
  }
}
