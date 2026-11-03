import {AsyncLocalStorage} from 'node:async_hooks';
export interface Statement {
  bind(...values:any[]):Statement;
  first<T=any>(column?:string):Promise<T|null>;
  all<T=any>():Promise<{results:T[]}>;
  run():Promise<{meta:{changes:number}}>;
}
export interface Runtime {
  db:{prepare(sql:string):Statement;batch(statements:Statement[]):Promise<any[]>};
  config:Record<string,string>;
  bucket:{put(key:string,value:Uint8Array,options?:any):Promise<void>;get(key:string):Promise<{body:Uint8Array<ArrayBuffer>;arrayBuffer():Promise<ArrayBuffer>}|null>;delete(key:string):Promise<void>};
  bookings:()=>Promise<any>;
  unavailability?:{listBlocks:()=>Promise<any[]>;saveBlock:(input:any,owner:string)=>Promise<any>;removeBlock:(input:any)=>Promise<void>};
  requestHeaders?:Headers;
}
export const context=new AsyncLocalStorage<Runtime>();
export function runtime(){const value=context.getStore();if(!value)throw Error('Dashboard runtime unavailable');return value;}
export async function headers(){return runtime().requestHeaders||new Headers();}
