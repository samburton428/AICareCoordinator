// Backend entry point
export { LocalConversationEngine, BedrockConversationEngine } from './conversation-engine.js';
export type { ConversationEngine } from './conversation-engine.js';

export { ComprehendMedicalExtractor, LocalClinicalExtractor } from './clinical-extractor.js';
export type { ClinicalExtractor } from './clinical-extractor.js';

export { RuleBasedTriageAssessor } from './triage-assessor.js';
export type { TriageAssessor } from './triage-assessor.js';

export { DefaultRoutingEngine } from './routing-engine.js';
export type { RoutingEngine } from './routing-engine.js';

export { LocalPatientRecordStore, DynamoDBPatientRecordStore } from './patient-record-store.js';
export type { PatientRecordStore } from './patient-record-store.js';

export { handler } from './api-handler.js';
export type { APIGatewayEvent, APIGatewayResponse } from './api-handler.js';
