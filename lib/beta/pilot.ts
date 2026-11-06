// Pilot measurements are separate from robot configuration and customer evidence.
export type PilotPlan = { startDate: string; scope: string; successCriteria: string; baselineMinutes: number | null; baselineSamples: number | null; baselineMethod: string };
export type PilotReview = { week: number; expectedRevision: number; supportMinutes: number | null; assistedSessions: number | null; independentSessions: number | null; expectedRuns: number | null; capturedRuns: number | null; denominatorEvidence: string; reconstructionMinutes: number | null; reconstructionSamples: number | null; evidenceNote: string; decision: string };
export type PilotData = { plan: null | { payload: PilotPlan; synthetic: boolean; created_at: string }; reviews: { week: number; revision: number; payload: PilotReview; recorded_at: string }[]; activity: { week: number; kind: string; count: number; first_at: string; last_at: string }[] };
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error('Unexpected pilot fields.');
  return value as Record<string, unknown>;
}
function text(v: unknown, required = false) { if (typeof v !== 'string' || v.length > 2000 || (required && !v.trim())) throw new Error('Provide a note of at most 2,000 characters.'); return v.trim(); }
function number(v: unknown, max = 1000000): number | null { if (v === null) return null; if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > max) throw new Error('Use a whole nonnegative number, or leave unknown.'); return v; }
function samplePair(minutes: number | null, samples: number | null) { if ((minutes === null) !== (samples === null) || (minutes !== null && !samples)) throw new Error('Measured minutes require a positive sample count; leave both unknown otherwise.'); }
export function validatePilotPlan(input: unknown, now = new Date()): PilotPlan {
  const d = object(input, ['startDate','scope','successCriteria','baselineMinutes','baselineSamples','baselineMethod']);
  const startDate = text(d.startDate, true), date = new Date(startDate + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== startDate || startDate < now.toISOString().slice(0,10)) throw new Error('Choose today or a future UTC start date.');
  const baselineMinutes = number(d.baselineMinutes), baselineSamples = number(d.baselineSamples); samplePair(baselineMinutes, baselineSamples);
  return { startDate, scope: text(d.scope, true), successCriteria: text(d.successCriteria, true), baselineMinutes, baselineSamples, baselineMethod: text(d.baselineMethod, baselineMinutes !== null) };
}
export function validatePilotReview(input: unknown): PilotReview {
  const d = object(input, ['week','expectedRevision','supportMinutes','assistedSessions','independentSessions','expectedRuns','capturedRuns','denominatorEvidence','reconstructionMinutes','reconstructionSamples','evidenceNote','decision']);
  const week = number(d.week,4), expectedRevision = number(d.expectedRevision,99);
  if (!week || expectedRevision === null) throw new Error('Invalid week or review revision.');
  const expectedRuns = number(d.expectedRuns), capturedRuns = number(d.capturedRuns), denominatorEvidence = text(d.denominatorEvidence);
  if ((expectedRuns === null) !== (capturedRuns === null) || (expectedRuns !== null && (capturedRuns! > expectedRuns || !denominatorEvidence))) throw new Error('Coverage needs matched runner counts and an independent denominator source.');
  const reconstructionMinutes = number(d.reconstructionMinutes), reconstructionSamples = number(d.reconstructionSamples); samplePair(reconstructionMinutes,reconstructionSamples);
  const decision = text(d.decision,true); if (!['pending','continue-paid','revise','stop'].includes(decision)) throw new Error('Invalid pilot decision.');
  return { week, expectedRevision, supportMinutes:number(d.supportMinutes), assistedSessions:number(d.assistedSessions), independentSessions:number(d.independentSessions), expectedRuns,capturedRuns,denominatorEvidence,reconstructionMinutes,reconstructionSamples,evidenceNote:text(d.evidenceNote,true),decision };
}
export function pilotSummary(data: PilotData, now = new Date()) {
  return { format:'unify-pilot', version:1, generatedAt:now.toISOString(), ...data,
    weeks: Array.from({length:4},(_,i) => {
      const week=i+1, review=data.reviews.filter(r=>r.week===week).sort((a,b)=>b.revision-a.revision)[0] ?? null;
      const events=data.activity.filter(a=>a.week===week);
      const started = !!data.plan && now.getTime() >= Date.parse(data.plan.payload.startDate + 'T00:00:00Z') + i * 7 * 86400000;
      return {week,started,review,coveragePercent:review?.payload.expectedRuns ? 100 * review.payload.capturedRuns! / review.payload.expectedRuns : null,
        activeOrganizations:!started ? null : events.some(e=>['workspace_saved','comparison'].includes(e.kind)) ? 1 : 0,activity:events};
    }),
    limitations:['Only this organization; no cross-tenant totals. Activity begins at enrollment within the 28-day UTC window.', 'Activity is not independent adoption. Assistance and weekly measurements are owner-reported; blank means unknown.', 'Snapshot/comparison times are first observed since enrollment, not lifetime first use. Comparison counts deduplicate each saved pair per user per UTC day.', 'Ingestion counts are accepted saves and failed attempts after valid credential lookup; retries can repeat failures. Invalid credentials, oversized/invalid JSON and database outages may be unobserved.', 'Coverage requires an independently recorded eligible-run denominator and matching captured-run count. Zero eligible runs gives no percentage.', 'Synthetic results are not customer evidence. A continue-paid decision does not bill or activate a subscription.'] };
}
