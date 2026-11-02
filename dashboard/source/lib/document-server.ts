import {runtime} from '../../runtime/context';
export const bucket=()=>{if(!runtime().bucket)throw Error('Document storage is not available.');return runtime().bucket};
export const jsonError=(e:unknown,status=400)=>Response.json({error:e instanceof Error?e.message:'The document operation failed.'},{status});
export function sameOrigin(r:Request){const o=r.headers.get('origin');if(o&&o!==new URL(r.url).origin)throw Error('Invalid request origin.');}
export function safeName(s:string){return s.normalize('NFKD').replace(/[^a-zA-Z0-9 _.-]/g,'').replace(/\s+/g,'_').replace(/\.+/g,'.').slice(0,120)||'Document'}
