import {createCipheriv,createDecipheriv,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
export type Sealed={version:1;keyId:string;iv:string;tag:string;data:string};
function keys(){
 const raw=process.env.CONNECTOR_KEYS;const active=process.env.CONNECTOR_ACTIVE_KEY;
 if(!raw||!active)throw Error('Connector encryption is not configured.');
 let values:Record<string,string>;try{values=JSON.parse(raw);}catch{throw Error('Invalid connector key configuration.');}
 if(!values||Array.isArray(values)||typeof values!=='object')throw Error('Invalid connector key configuration.');
 if(!Object.hasOwn(values,active))throw Error('Active connector key is missing.');
 const map=new Map<string,Buffer>();for(const [id,value]of Object.entries(values)){
  if(!/^[a-zA-Z0-9_-]{1,32}$/.test(id)||typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error('Invalid connector key configuration.');
  map.set(id,Buffer.from(value,'hex'));
 }return {active,map};
}
export function seal(value:unknown,context:string):Sealed{
 const {active,map}=keys(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',map.get(active)!,iv);
 cipher.setAAD(Buffer.from('unify-connector-v1:'+context));
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return {version:1,keyId:active,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function unseal<T>(value:Sealed,context:string):T{
 const key=keys().map.get(value.keyId);if(!key||value.version!==1)throw Error('Connector key unavailable.');
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));
 decipher.setAAD(Buffer.from('unify-connector-v1:'+context));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8'));
}
export function verifyOnshapeWebhook(raw:string,headers:Headers,signingKeys:string[],now=Date.now()){
 const timestamp=headers.get('x-onshape-webhook-timestamp');
 if(!timestamp||!Number.isFinite(Date.parse(timestamp))||Math.abs(Date.parse(timestamp)-now)>300000)return false;
 return signingKeys.filter(Boolean).some(key=>{
  const expected=createHmac('sha256',key).update(timestamp+'.'+raw).digest();
  return ['primary','secondary'].some(slot=>{const actual=Buffer.from(headers.get('x-onshape-webhook-signature-'+slot)??'','base64');return actual.length===expected.length&&timingSafeEqual(actual,expected);});
 });
}
