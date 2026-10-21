/** SHA-256 of one explicitly selected private file; never transmits file contents. */
export async function hashAudioFile(file: Pick<File,'size'|'arrayBuffer'>,signal?:AbortSignal):Promise<string> {
  if(signal?.aborted)throw new DOMException('Importación cancelada','AbortError');
  if(file.size<1 || file.size>100*1024*1024)throw new Error('El archivo supera el límite de 100 MB.');
  if(!globalThis.crypto?.subtle)throw new Error('La huella SHA-256 requiere HTTPS o un navegador compatible.');
  const input=await file.arrayBuffer();
  if(signal?.aborted)throw new DOMException('Importación cancelada','AbortError');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',input));
  if(signal?.aborted)throw new DOMException('Importación cancelada','AbortError');
  return [...digest].map(n=>n.toString(16).padStart(2,'0')).join('');
}
