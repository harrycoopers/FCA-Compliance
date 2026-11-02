import {scrypt,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
const params={N:16384,r:8,p:5,maxmem:64*1024*1024};
const derive=(password,salt)=>new Promise((resolve,reject)=>scrypt(password,salt,32,params,(e,key)=>e?reject(e):resolve(key)));
export function validPassword(password){return typeof password==='string'&&password.length>=15&&password.length<=128;}
export async function hashPassword(password){if(!validPassword(password))throw Error('Use a password between 15 and 128 characters.');const salt=randomBytes(16).toString('hex');const hash=await derive(password,salt);return `scrypt-16384-8-5$${salt}$${hash.toString('hex')}`;}
export async function verifyPassword(password,stored){const parts=String(stored||'').split('$');const valid=parts.length===3&&parts[0]==='scrypt-16384-8-5'&&/^[a-f0-9]{32}$/.test(parts[1])&&/^[a-f0-9]{64}$/.test(parts[2]);const salt=valid?parts[1]:'00000000000000000000000000000000';const actual=await derive(typeof password==='string'&&password.length<=128?password:'',salt);const expected=Buffer.from(valid?parts[2]:'0'.repeat(64),'hex');return timingSafeEqual(actual,expected)&&valid;}
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const sessionToken=()=>randomBytes(32).toString('hex');
