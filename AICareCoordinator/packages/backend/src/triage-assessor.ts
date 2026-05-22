import type {
  PatientRecord,
  TriageResult,
  TriageRule,
  ClinicalEntity,
} from '@ai-care-coordinator/shared';

// ── Interface ────────────────────────────────────────────────────────────────

export interface TriageAssessor {
  assessUrgency(record: PatientRecord): TriageResult;
}

// ── Helper utilities ─────────────────────────────────────────────────────────

/** Check whether any entity's text contains the given keyword (case-insensitive). */
function hasKeyword(entities: ClinicalEntity[], keyword: string): boolean {
  const lower = keyword.toLowerCase();
  return entities.some((e) => e.text.toLowerCase().includes(lower));
}

/** Return true if every entity is a MEDICATION (patient only mentions meds). */
function onlyMedications(entities: ClinicalEntity[]): boolean {
  return entities.length > 0 && entities.every((e) => e.category === 'MEDICATION');
}

/** Return true if every entity is a TIME_EXPRESSION (no symptoms at all). */
function onlyTimeExpressions(entities: ClinicalEntity[]): boolean {
  return entities.length > 0 && entities.every((e) => e.category === 'TIME_EXPRESSION');
}

// ── Triage rules (evaluated in priority order) ───────────────────────────────

const TRIAGE_RULES: TriageRule[] = [
  // ── Emergency ──────────────────────────────────────────────────────────────
  {
    id: 'EMERGENCY_CHEST_PAIN_SOB',
    urgencyLevel: 'Emergency',
    description: 'Chest pain combined with shortness of breath',
    condition: (entities) =>
      hasKeyword(entities, 'chest pain') && hasKeyword(entities, 'shortness of breath'),
  },
  {
    id: 'EMERGENCY_STROKE_NUMBNESS',
    urgencyLevel: 'Emergency',
    description: 'Stroke indicators: numbness with confusion',
    condition: (entities) =>
      hasKeyword(entities, 'numbness') && hasKeyword(entities, 'confusion'),
  },
  {
    id: 'EMERGENCY_STROKE_HEADACHE_VISION',
    urgencyLevel: 'Emergency',
    description: 'Stroke indicators: sudden severe headache with vision problems',
    condition: (entities) =>
      hasKeyword(entities, 'severe headache') && hasKeyword(entities, 'vision'),
  },
  {
    id: 'EMERGENCY_SEVERE_BLEEDING',
    urgencyLevel: 'Emergency',
    description: 'Severe bleeding reported',
    condition: (entities) => hasKeyword(entities, 'severe bleeding'),
  },

  // ── Urgent ─────────────────────────────────────────────────────────────────
  {
    id: 'URGENT_HIGH_FEVER',
    urgencyLevel: 'Urgent',
    description: 'High fever reported',
    condition: (entities) => hasKeyword(entities, 'fever'),
  },
  {
    id: 'URGENT_ABDOMINAL_VOMITING',
    urgencyLevel: 'Urgent',
    description: 'Abdominal pain combined with vomiting',
    condition: (entities) =>
      hasKeyword(entities, 'abdominal pain') && hasKeyword(entities, 'vomiting'),
  },
  {
    id: 'URGENT_CHEST_PAIN',
    urgencyLevel: 'Urgent',
    description: 'Chest pain without additional emergency indicators',
    condition: (entities) => hasKeyword(entities, 'chest pain'),
  },

  // ── Semi-Urgent ────────────────────────────────────────────────────────────
  {
    id: 'SEMI_URGENT_BACK_PAIN',
    urgencyLevel: 'Semi-Urgent',
    description: 'Back pain reported',
    condition: (entities) => hasKeyword(entities, 'back pain'),
  },
  {
    id: 'SEMI_URGENT_PERSISTENT_HEADACHE',
    urgencyLevel: 'Semi-Urgent',
    description: 'Persistent headache reported',
    condition: (entities) => hasKeyword(entities, 'headache'),
  },
  {
    id: 'SEMI_URGENT_DIZZINESS_FATIGUE',
    urgencyLevel: 'Semi-Urgent',
    description: 'Dizziness combined with fatigue',
    condition: (entities) =>
      hasKeyword(entities, 'dizziness') && hasKeyword(entities, 'fatigue'),
  },

  // ── Non-Urgent ─────────────────────────────────────────────────────────────
  {
    id: 'NON_URGENT_SORE_THROAT',
    urgencyLevel: 'Non-Urgent',
    description: 'Sore throat reported',
    condition: (entities) => hasKeyword(entities, 'sore throat'),
  },
  {
    id: 'NON_URGENT_RASH',
    urgencyLevel: 'Non-Urgent',
    description: 'Rash reported',
    condition: (entities) => hasKeyword(entities, 'rash'),
  },
  {
    id: 'NON_URGENT_MILD_COUGH',
    urgencyLevel: 'Non-Urgent',
    description: 'Mild cough reported',
    condition: (entities) => hasKeyword(entities, 'cough'),
  },

  // ── Self-Care ──────────────────────────────────────────────────────────────
  {
    id: 'SELF_CARE_ONLY_MEDICATION',
    urgencyLevel: 'Self-Care',
    description: 'Patient only mentions medications (already self-treating)',
    condition: (entities) => onlyMedications(entities),
  },
  {
    id: 'SELF_CARE_ONLY_TIME',
    urgencyLevel: 'Self-Care',
    description: 'Patient only mentions time expressions (no symptoms)',
    condition: (entities) => onlyTimeExpressions(entities),
  },
];

// ── Build rationale ──────────────────────────────────────────────────────────

function buildRationale(
  matchedRule: TriageRule,
  entities: ClinicalEntity[],
): string {
  const symptomEntities = entities.filter(
    (e) => e.category === 'SYMPTOM' || e.category === 'CONDITION',
  );
  const factors =
    symptomEntities.length > 0
      ? symptomEntities.map((e) => e.text).join(', ')
      : entities.map((e) => e.text).join(', ');

  return `Assessed as ${matchedRule.urgencyLevel} based on rule "${matchedRule.description}". Contributing clinical factors: ${factors}.`;
}

// ── Rule-based implementation ────────────────────────────────────────────────

export class RuleBasedTriageAssessor implements TriageAssessor {
  private rules: TriageRule[];

  constructor(rules?: TriageRule[]) {
    this.rules = rules ?? TRIAGE_RULES;
  }

  assessUrgency(record: PatientRecord): TriageResult {
    const entities = record.extractedEntities ?? [];

    // No entities → default to Semi-Urgent with review flag
    if (entities.length === 0) {
      return {
        urgencyLevel: 'Semi-Urgent',
        rationale:
          'Insufficient clinical data to determine urgency. Defaulting to Semi-Urgent and flagging for clinician review.',
        matchedRules: [],
        flaggedForReview: true,
      };
    }

    // Evaluate rules in priority order; return first match
    for (const rule of this.rules) {
      if (rule.condition(entities)) {
        return {
          urgencyLevel: rule.urgencyLevel,
          rationale: buildRationale(rule, entities),
          matchedRules: [rule.id],
          flaggedForReview: false,
        };
      }
    }

    // No rules matched → default to Semi-Urgent with review flag
    const entityTexts = entities.map((e) => e.text).join(', ');
    return {
      urgencyLevel: 'Semi-Urgent',
      rationale: `No triage rules matched the clinical data (${entityTexts}). Defaulting to Semi-Urgent and flagging for clinician review.`,
      matchedRules: [],
      flaggedForReview: true,
    };
  }
}
