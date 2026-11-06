export const readinessStates=['collecting_data','insufficient_labels','evaluating','available','degraded','paused'] as const;
export const capabilities=['failure_risk','duration','quality','maintenance'] as const;
export type Capability=typeof capabilities[number];
const requirements:Record<Capability,string>={
 failure_risk:'Define comparable procedures and pre-run decision times; curate confirmed success and failure labels and evaluate calibration on later unseen jobs.',
 duration:'Curate completed comparable jobs with measured seconds and evaluate duration error and interval coverage on later unseen jobs.',
 quality:'Define the task-specific quality metric, unit and acceptance criteria, then curate measured labels for comparable jobs.',
 maintenance:'Define the component, maintenance outcome and prediction horizon; record exposure, follow-up, censoring and reviewed events.',
};
// Public policy status only: no internal dataset counts, cohort identities or labels are exposed.
export type PublishedReadiness={capability:Capability;state:string;available:false;cohort:string|null;eligible_runs:null;reason:string;evaluation:string;candidate_id?:string;revision?:number};
export function predictionReadiness(published:PublishedReadiness[]=[]){
 if(!Array.isArray(published)||published.length>100||published.some(c=>!capabilities.includes(c.capability)||!['collecting_data','insufficient_labels','evaluating','paused','degraded'].includes(c.state)||c.available!==false||typeof c.reason!=='string'))throw Error('Invalid published readiness.');
 const entries:PublishedReadiness[]=capabilities.flatMap(capability=>{
  const rows=published.filter(c=>c.capability===capability);
  return rows.length?rows:[{capability,state:'collecting_data',available:false,cohort:null,eligible_runs:null,reason:requirements[capability],evaluation:'not_connected'}];
 });
 return {schema_version:1,scope:published.length?'Reviewed candidate status only. No validated model is active.':'No evaluated cohort is connected to this application.',capabilities:entries,limitations:'Run counts alone do not establish readiness. Synthetic data is excluded; simulation evidence remains separate. No prediction controls a robot.'};
}
