import { useCallback, useEffect, useRef, useState } from 'react';
import { type PresetDocument } from './model';
import { fetchPresets, publishPresets, recoverPublication } from './sync';
import { activePresets, cachedPresets, rememberPresets, retainSalePresets } from './storage';
export function usePresets(canApply: boolean, unfinished: boolean) {
  const [document,setDocument]=useState(activePresets);
  const [latest,setLatest]=useState(cachedPresets);
  const [status,setStatus]=useState('Checking preset updates…');
  const current=useRef(latest);
  const inFlight=useRef(false);
  const poll=useCallback(async()=>{
    if(inFlight.current || globalThis.document.visibilityState==='hidden') return;
    inFlight.current=true;
    try {
      const next=await fetchPresets(current.current.revision);
      // An earlier GET may finish after this device has published a new revision.
      if(next && next.revision >= current.current.revision) { current.current=next; setLatest(next); setStatus(rememberPresets(next)?'Presets up to date':'Presets loaded; local cache could not be saved.'); }
      else setStatus('Presets up to date');
    } catch { setStatus('Preset updates offline · using saved prices'); }
    finally { inFlight.current=false; }
  },[]);
  useEffect(()=>{
    const refresh=()=>{ void poll(); };
    refresh(); const timer=window.setInterval(refresh,30000);
    window.addEventListener('focus',refresh); window.addEventListener('online',refresh); globalThis.document.addEventListener('visibilitychange',refresh);
    return()=>{ clearInterval(timer); window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);globalThis.document.removeEventListener('visibilitychange',refresh); };
  },[poll]);
  // React discards this render and retries with the new reference settings.
  // The boundary uses current sale state, so a new keypress wins over a fetch.
  if(canApply && document!==latest) setDocument(latest);
  useEffect(()=>{ retainSalePresets(document,unfinished); },[document,unfinished]);
  const publish=useCallback(async(draft:PresetDocument,revision:number,requestId:string)=>{
    const next=await publishPresets(draft,revision,requestId);
    if (next.revision >= current.current.revision) {
      current.current=next; setLatest(next); setStatus(rememberPresets(next)?'Presets published':'Presets published; local cache could not be saved.');
    }
    return current.current;
  },[]);
  const checkPublication=useCallback(async(requestId:string)=>{
    const next=await recoverPublication(requestId);
    if (!next) return null;
    if (next.revision >= current.current.revision) {
      current.current=next; setLatest(next); setStatus(rememberPresets(next)?'Presets published':'Presets published; local cache could not be saved.');
    }
    return current.current;
  },[]);
  return {document,latest,publish,checkPublication,status,pending:latest.revision!==document.revision,poll};
}
