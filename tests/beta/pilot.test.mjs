import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePilotPlan,validatePilotReview,pilotSummary} from '../../lib/beta/pilot.ts';
const review={week:1,expectedRevision:0,supportMinutes:null,assistedSessions:null,independentSessions:null,expectedRuns:null,capturedRuns:null,denominatorEvidence:'',reconstructionMinutes:null,reconstructionSamples:null,evidenceNote:'Synthetic observation, not customer evidence.',decision:'pending'};
test('pilot measurements preserve unknowns, denominator provenance and samples',()=>{
 assert.equal(validatePilotReview(review).supportMinutes,null);
 assert.equal(validatePilotReview({...review,supportMinutes:0}).supportMinutes,0);
 for(const patch of [{expectedRuns:10},{expectedRuns:10,capturedRuns:9},{expectedRuns:10,capturedRuns:11,denominatorEvidence:'runner'},{reconstructionMinutes:10},{reconstructionMinutes:10,reconstructionSamples:0},{supportMinutes:-1},{assistedSessions:0.2},{secret:'x'},{decision:'paid'}])assert.throws(()=>validatePilotReview({...review,...patch}));
 const known=validatePilotReview({...review,expectedRuns:10,capturedRuns:9,denominatorEvidence:'Independent runner count, identical UTC period'});
 const data={plan:null,reviews:[{week:1,revision:1,payload:known,recorded_at:'2026-10-20'}],activity:[]};
 assert.equal(pilotSummary(data).weeks[0].coveragePercent,90);assert.equal(pilotSummary(data).weeks[1].coveragePercent,null);
 data.reviews.push({week:1,revision:2,payload:{...known,expectedRuns:0,capturedRuns:0},recorded_at:'2026-10-20'});assert.equal(pilotSummary(data).weeks[0].coveragePercent,null);
});
test('pilot plan rejects backdating and fabricated calendar dates',()=>{
 const plan={startDate:'2026-10-20',scope:'One workflow',successCriteria:'Negotiated',baselineMinutes:null,baselineSamples:null,baselineMethod:''};
 assert.equal(validatePilotPlan(plan,new Date('2026-10-20')).startDate,'2026-10-20');
 for(const startDate of ['2026-02-30','2026-10-19','invalid'])assert.throws(()=>validatePilotPlan({...plan,startDate},new Date('2026-10-20')));
 assert.throws(()=>validatePilotPlan({...plan,baselineMinutes:10,baselineSamples:1},new Date('2026-10-20')));
});

test('future and unenrolled weeks do not report measured inactivity',()=>{
 const plan={payload:{startDate:'2026-10-20'},synthetic:true,created_at:'2026-10-20T10:00:00Z'};
 const data={plan,reviews:[],activity:[]};
 const summary=pilotSummary(data,new Date('2026-10-20T12:00:00Z'));
 assert.equal(summary.weeks[0].activeOrganizations,0);
 assert.equal(summary.weeks[1].activeOrganizations,null);
 assert.equal(summary.weeks[1].started,false);
 assert.equal(pilotSummary(data,new Date('2026-10-27T00:00:00Z')).weeks[1].activeOrganizations,0);
 assert.equal(pilotSummary({...data,plan:null}).weeks[0].activeOrganizations,null);
});
