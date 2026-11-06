import {checkDeploymentConfig} from '../lib/beta/deployment-config.mjs';
try{
 const args=process.argv.slice(2);if(args.length>1)throw Error('Choose one deployment profile.');
 const result=checkDeploymentConfig(process.env,args[0]??'app');
 console.log(JSON.stringify(result,null,2));if(!result.configuration_valid)process.exitCode=1;
}catch{console.error('Unable to check configuration. Usage: node scripts/check-beta-deployment.mjs [app|report-worker|connector-worker]');process.exitCode=2;}
