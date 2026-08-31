import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { db } from '../../db/database';

const key = () => createHash('sha256').update(process.env.CREDENTIAL_ENCRYPTION_KEY ?? 'local-dev-credential-key-not-for-production').digest();
function encrypt(value:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;}
function decrypt(value:string){const [iv,tag,data]=value.split(':');const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');}

export class BusinessCredentialVault {
  storeOrUpdate(workspaceId:string,integrationId:string,value:string):string {
    const existing=db.prepare('SELECT id FROM business_integration_credentials WHERE integration_id=? AND workspace_id=?').get(integrationId,workspaceId) as {id:string}|undefined;
    const now=new Date().toISOString();
    if(existing){db.prepare('UPDATE business_integration_credentials SET encrypted_value=?,updated_at=? WHERE id=?').run(encrypt(value),now,existing.id);return existing.id;}
    const id=`bizcred_${randomUUID()}`;db.prepare('INSERT INTO business_integration_credentials (id,workspace_id,integration_id,encrypted_value,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id,workspaceId,integrationId,encrypt(value),now,now);return id;
  }
  read(ref:string,workspaceId:string):string|null {const row=db.prepare('SELECT encrypted_value FROM business_integration_credentials WHERE id=? AND workspace_id=?').get(ref,workspaceId) as {encrypted_value:string}|undefined;return row?decrypt(row.encrypted_value):null;}
}
export const businessCredentialVault=new BusinessCredentialVault();
