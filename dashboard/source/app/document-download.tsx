'use client';
import {useState} from 'react';
import {Download,Loader2} from 'lucide-react';
export default function DocumentDownload({url,filename,label='Download',className='btn small'}:{url:string;filename:string;label?:string;className?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[requested,setRequested]=useState(false);
 async function download(){if(busy)return;setBusy(true);setError('');setRequested(false);try{
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},signal:AbortSignal.timeout(60000)});
  if(!response.ok){let detail='';try{detail=((await response.json()) as {error?:string}).error||''}catch{}throw Error(detail||(response.status===401?'Please sign in again, then retry the download.':`Download failed (${response.status}). Please try again.`));}
  if(!(response.headers.get('content-type')||'').includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document'))throw Error('The server did not return a Word file. Open the download in a new tab to check whether sign-in is required.');
  const blob=await response.blob();if(!blob.size)throw Error('The returned file was empty. Please try again.');
  const objectUrl=URL.createObjectURL(blob);const link=document.createElement('a');link.href=objectUrl;link.download=filename.toLowerCase().endsWith('.docx')?filename:filename+'.docx';link.target='_blank';link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);setRequested(true);
 }catch(e){setError(e instanceof Error?(e.name==='TimeoutError'?'The download timed out. Please try again.':e.message):'Download failed. Please try again.')}finally{setBusy(false)}}
 return <div className="document-download"><button type="button" className={className} disabled={busy} onClick={download} aria-label={label}>{busy?<Loader2 size={16} className="spin"/>:<Download size={16}/>} {busy?'Preparing download…':label}</button>{error&&<p className="danger-text" role="alert">{error}</p>}{(requested||error)&&<div className="download-help" role="status">{requested&&<span>Download requested. Check your browser’s downloads. </span>}<a href={url} target="_blank" rel="noopener noreferrer" download={filename}>Open download in a new tab</a></div>}</div>
}
