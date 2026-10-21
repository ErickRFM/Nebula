'use client';
import {useState} from 'react';
import {acousticDelaySummary,detectAcousticPeaks} from '@nebula/room-sync';

/** QA only: requires two isolated signals recorded on the SAME stereo clock. */
type Evidence={trials:number;medianMs:number;p95Ms:number;maxMs:number;sampleRateHz:number;filename:string;delaysMs:number[]};
export function RoomAcousticQaPanel(){
  const [evidence,setEvidence]=useState<Evidence|null>(null);
  const [error,setError]=useState('');
  const [deviceA,setDeviceA]=useState('');
  const [deviceB,setDeviceB]=useState('');
  const [output,setOutput]=useState('altavoces de teléfono');
  const [busy,setBusy]=useState(false);
  async function analyze(file:File|undefined){
    if(!file)return;
    setEvidence(null);setError('');
    if(file.size>20*1024*1024){setError('El archivo de medición debe pesar menos de 20 MB.');return;}
    setBusy(true);
    let ctx:AudioContext|null=null;
    try{
      ctx=new AudioContext();
      const decoded=await ctx.decodeAudioData(await file.arrayBuffer());
      if(decoded.numberOfChannels!==2||decoded.duration>30){
        throw new Error('Necesitas una grabación estéreo de hasta 30 s: cada canal debe aislar un dispositivo.');
      }
      const left=detectAcousticPeaks(Array.from(decoded.getChannelData(0)),decoded.sampleRate,{minimumGapMs:180,thresholdRatio:.55});
      const right=detectAcousticPeaks(Array.from(decoded.getChannelData(1)),decoded.sampleRate,{minimumGapMs:180,thresholdRatio:.55});
      const count=Math.min(left.length,right.length,30);
      if(count<3)throw new Error('No hay suficientes clics separados. Graba al menos 3 impulsos por canal.');
      const delays=Array.from({length:count},(_,i)=>right[i].ms-left[i].ms);
      if(delays.some(n=>Math.abs(n)>1500))
        throw new Error('No pudimos emparejar los clics. Aísla una fuente por canal y verifica que cada impulso tenga su pareja.');
      const summary=acousticDelaySummary(delays);
      if(!summary)throw new Error('Grabación insuficiente para analizar desfases.');
      setEvidence({trials:count,medianMs:summary.medianAbsMs,p95Ms:summary.p95AbsMs,
        maxMs:summary.maxAbsMs,sampleRateHz:decoded.sampleRate,filename:file.name,delaysMs:delays});
    }catch(cause){setError(cause instanceof Error?cause.message:'No pudimos analizar la grabación.');}
    finally{if(ctx)void ctx.close();setBusy(false);}
  }
  function exportEvidence(){
    if(!evidence)return;
    const report={
      kind:'nebula-party-sound-physical-acoustic-qa',version:1,
      recordedAt:new Date().toISOString(),deviceA,deviceB,output,
      method:'Stereo reference recording using one hardware clock; A=left, B=right. Separate sources per channel.',
      ...evidence,
      limitations:'No claim of phase-perfect synchronization; operator must confirm independent channel isolation.',
    };
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='nebula-party-sound-qa.json';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="content-section room-acoustic-qa" aria-label="Validación acústica de Party Sound">
    <div className="section-heading"><h2>Prueba acústica de dos dispositivos</h2></div>
    <div className="room-card glass">
      <p>Una grabación estéreo debe registrar el dispositivo A aislado en el canal izquierdo y B en el derecho usando <strong>un mismo reloj</strong>. Dos grabaciones separadas no permiten medir el desfase. Esta herramienta procesa el archivo localmente, sin subir audio.</p>
      <div className="room-qa-fields">
        <label>Dispositivo A<input value={deviceA} maxLength={120} placeholder="Teléfono A, navegador y versión" onChange={e=>setDeviceA(e.target.value)}/></label>
        <label>Dispositivo B<input value={deviceB} maxLength={120} placeholder="Teléfono B, navegador y versión" onChange={e=>setDeviceB(e.target.value)}/></label>
        <label>Salida<input value={output} maxLength={120} placeholder="Bluetooth / bocina interna" onChange={e=>setOutput(e.target.value)}/></label>
      </div>
      <label htmlFor="room-acoustic-upload">Grabación de referencia (WAV estéreo, máximo 20 MB)</label>
      <input id="room-acoustic-upload" type="file" accept="audio/wav,.wav,audio/*" disabled={busy} onChange={e=>{void analyze(e.target.files?.[0]);e.target.value='';}}/>
      {busy&&<p role="status">Analizando audio local…</p>}
      {error&&<p role="alert" className="account-error">{error}</p>}
      {evidence&&<div role="status" className="room-qa-result">
        <strong>{evidence.trials} impulsos emparejados</strong>
        <span>Mediana |desfase|: {evidence.medianMs.toFixed(1)} ms</span>
        <span>P95 |desfase|: {evidence.p95Ms.toFixed(1)} ms</span>
        <span>Máximo |desfase|: {evidence.maxMs.toFixed(1)} ms</span>
        <button type="button" className="button secondary small" onClick={exportEvidence}>Exportar evidencia JSON</button>
      </div>}
      <p className="disclosure">Los resultados son indicativos. Verifica que cada canal solo capta su altavoz, repite 10 ensayos y documenta red, códec Bluetooth, posiciones y volumen. No confundas desfase lógico del navegador con medición acústica.</p>
    </div>
  </section>;
}
