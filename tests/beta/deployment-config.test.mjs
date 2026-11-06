import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkDeploymentConfig} from '../../lib/beta/deployment-config.mjs';
const base=()=>({BETA_ENABLED:'true',BETA_AUTH_LIFECYCLE:'true',BETA_ORIGIN:'https://beta.company.com',SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-private'});
test('configuration presence is never release verification and output cannot leak supplied secrets',()=>{
 const env=base(),r=checkDeploymentConfig(env);assert.equal(r.configuration_valid,true);assert.equal(r.release_verified,false);assert.ok(r.unverified.length);
 env.NEXT_PUBLIC_COPY=env.SUPABASE_SERVICE_ROLE_KEY;const rejected=checkDeploymentConfig(env);assert.equal(rejected.configuration_valid,false);assert.equal(JSON.stringify(rejected).includes(env.SUPABASE_SERVICE_ROLE_KEY),false);
 assert.equal(checkDeploymentConfig({...base(),SUPABASE_ANON_KEY:'synthetic-private'}).configuration_valid,false);
});
test('deployment origins and feature dependencies fail closed while disabled optional integrations remain optional',()=>{
 for(const BETA_ORIGIN of ['http://127.0.0.1:3002','https://localhost','https://example.invalid','https://10.0.0.1','https://beta.company.com/','https://beta.company.com/path','https://user:secret@beta.company.com'])assert.equal(checkDeploymentConfig({...base(),BETA_ORIGIN}).configuration_valid,false);
 assert.equal(checkDeploymentConfig({...base(),BETA_GOOGLE_ENABLED:'yes'}).configuration_valid,false);
 assert.equal(checkDeploymentConfig({...base(),BETA_REPORTS_ENABLED:'true'}).configuration_valid,false);
 assert.equal(checkDeploymentConfig({...base(),BETA_CONNECTORS_ENABLED:'false'}).configuration_valid,true);
 assert.equal(checkDeploymentConfig({...base(),BETA_CONNECTORS_ENABLED:'true'}).configuration_valid,false);
});
test('worker profile requires feature flag, usable key ring and explicit receiver allowlist',()=>{
 const env={...base(),BETA_REPORTS_ENABLED:'true',BETA_PROJECTS_ENABLED:'true',BETA_LIFECYCLE_ENABLED:'true',BETA_MACHINES_ENABLED:'true',CONNECTOR_KEYS:JSON.stringify({v1:'a'.repeat(64)}),CONNECTOR_ACTIVE_KEY:'v1',REPORT_WEBHOOK_HOSTS:'receiver.company.com'};
 assert.equal(checkDeploymentConfig(env,'report-worker').configuration_valid,true);
 for(const patch of [{CONNECTOR_ACTIVE_KEY:'missing'},{CONNECTOR_KEYS:'[]'},{REPORT_WEBHOOK_HOSTS:''},{REPORT_WEBHOOK_HOSTS:'127.0.0.1'},{REPORT_WEBHOOK_HOSTS:'https://receiver.company.com'}])assert.equal(checkDeploymentConfig({...env,...patch},'report-worker').configuration_valid,false);
 assert.throws(()=>checkDeploymentConfig(env,'unknown'));
});
