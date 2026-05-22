import {
  ComprehendMedicalClient,
  DetectEntitiesV2Command,
} from '@aws-sdk/client-comprehendmedical';
import type {
  ConversationTranscript,
  ExtractionResult,
  ClinicalEntity,
  EntityCategory,
} from '@ai-care-coordinator/shared';

// ── Interface ────────────────────────────────────────────────────────────────

export interface ClinicalExtractor {
  extractEntities(transcript: ConversationTranscript): Promise<ExtractionResult>;
}

// ── Comprehend Medical category mapping ──────────────────────────────────────

const CATEGORY_MAP: Record<string, EntityCategory> = {
  MEDICAL_CONDITION: 'CONDITION',
  MEDICATION: 'MEDICATION',
  ANATOMY: 'ANATOMY',
  TIME_EXPRESSION: 'TIME_EXPRESSION',
  TEST_TREATMENT_PROCEDURE: 'SYMPTOM',
};

function mapCategory(comprehendCategory: string): EntityCategory {
  return CATEGORY_MAP[comprehendCategory] ?? 'SYMPTOM';
}

// ── AWS Comprehend Medical implementation ────────────────────────────────────

export class ComprehendMedicalExtractor implements ClinicalExtractor {
  private client: ComprehendMedicalClient;

  constructor(client?: ComprehendMedicalClient) {
    this.client = client ?? new ComprehendMedicalClient({});
  }

  async extractEntities(transcript: ConversationTranscript): Promise<ExtractionResult> {
    const text = transcript.fullText;

    const command = new DetectEntitiesV2Command({ Text: text });
    const response = await this.client.send(command);

    const entities: ClinicalEntity[] = (response.Entities ?? []).map((e) => {
      // Extract ICD-10 and RxNorm codes from entity attributes when available.
      // DetectEntitiesV2 may include coded references in attributes; for full
      // code resolution the InferICD10CM / InferRxNorm APIs would be used.
      let icd10Code: string | undefined;
      let rxNormCode: string | undefined;

      for (const attr of e.Attributes ?? []) {
        if (attr.Text && attr.Category === 'MEDICAL_CONDITION' && !icd10Code) {
          icd10Code = attr.Text;
        }
        if (attr.Text && attr.Category === 'MEDICATION' && !rxNormCode) {
          rxNormCode = attr.Text;
        }
      }

      return {
        text: e.Text ?? '',
        category: mapCategory(e.Category ?? ''),
        type: e.Type ?? '',
        confidence: e.Score ?? 0,
        beginOffset: e.BeginOffset ?? 0,
        endOffset: e.EndOffset ?? 0,
        ...(icd10Code ? { icd10Code } : {}),
        ...(rxNormCode ? { rxNormCode } : {}),
      };
    });

    return {
      entities,
      requiresManualReview: entities.length === 0,
      rawTranscript: text,
    };
  }
}


// ── Local (mock) implementation for demo/testing ─────────────────────────────

interface KeywordEntry {
  keyword: string;
  category: EntityCategory;
  type: string;
}

const MEDICAL_KEYWORDS: KeywordEntry[] = [
  { keyword: 'headache', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'fever', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'chest pain', category: 'CONDITION', type: 'DX_NAME' },
  { keyword: 'nausea', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'cough', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'shortness of breath', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'dizziness', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'fatigue', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'sore throat', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'back pain', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'abdominal pain', category: 'CONDITION', type: 'DX_NAME' },
  { keyword: 'vomiting', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'rash', category: 'SYMPTOM', type: 'DX_NAME' },
  { keyword: 'ibuprofen', category: 'MEDICATION', type: 'GENERIC_NAME' },
  { keyword: 'aspirin', category: 'MEDICATION', type: 'BRAND_NAME' },
  { keyword: 'acetaminophen', category: 'MEDICATION', type: 'GENERIC_NAME' },
  { keyword: 'tylenol', category: 'MEDICATION', type: 'BRAND_NAME' },
  { keyword: 'arm', category: 'ANATOMY', type: 'SYSTEM_ORGAN_SITE' },
  { keyword: 'leg', category: 'ANATOMY', type: 'SYSTEM_ORGAN_SITE' },
  { keyword: 'chest', category: 'ANATOMY', type: 'SYSTEM_ORGAN_SITE' },
  { keyword: 'throat', category: 'ANATOMY', type: 'SYSTEM_ORGAN_SITE' },
  { keyword: 'two days', category: 'TIME_EXPRESSION', type: 'TIME_TO_DX_NAME' },
  { keyword: 'three days', category: 'TIME_EXPRESSION', type: 'TIME_TO_DX_NAME' },
  { keyword: 'a week', category: 'TIME_EXPRESSION', type: 'TIME_TO_DX_NAME' },
  { keyword: 'yesterday', category: 'TIME_EXPRESSION', type: 'TIME_TO_DX_NAME' },
];

export class LocalClinicalExtractor implements ClinicalExtractor {
  async extractEntities(transcript: ConversationTranscript): Promise<ExtractionResult> {
    const text = transcript.fullText;
    const lowerText = text.toLowerCase();
    const entities: ClinicalEntity[] = [];

    // Scan for known medical keywords (longer phrases first to avoid partial matches)
    const sortedKeywords = [...MEDICAL_KEYWORDS].sort(
      (a, b) => b.keyword.length - a.keyword.length,
    );

    for (const entry of sortedKeywords) {
      let searchFrom = 0;
      while (true) {
        const idx = lowerText.indexOf(entry.keyword, searchFrom);
        if (idx === -1) break;

        // Avoid duplicate overlapping matches
        const alreadyMatched = entities.some(
          (e) => idx >= e.beginOffset && idx < e.endOffset,
        );

        if (!alreadyMatched) {
          // Generate a pseudo-random confidence between 0.80 and 0.99
          const confidence = 0.80 + ((idx * 7 + entry.keyword.length * 13) % 20) / 100;

          entities.push({
            text: text.slice(idx, idx + entry.keyword.length),
            category: entry.category,
            type: entry.type,
            confidence: Math.round(confidence * 100) / 100,
            beginOffset: idx,
            endOffset: idx + entry.keyword.length,
          });
        }

        searchFrom = idx + entry.keyword.length;
      }
    }

    // Sort entities by their position in the text
    entities.sort((a, b) => a.beginOffset - b.beginOffset);

    return {
      entities,
      requiresManualReview: entities.length === 0,
      rawTranscript: text,
    };
  }
}
