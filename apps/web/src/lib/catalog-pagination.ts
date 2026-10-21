/** Append paginated provider results without losing earlier pages or duplicating saved track IDs. */
export function appendUniqueTracks<T extends {id:string}>(existing:readonly T[], incoming:readonly T[]):T[]{
 const seen=new Set<string>();
 const unique:T[]=[];
 for(const track of [...existing,...incoming]){
   if(!track.id||seen.has(track.id))continue;
   seen.add(track.id);
   unique.push(track);
 }
 return unique;
}
/** At most 20 pages are supported by the current authenticated discovery endpoint. */
export function canLoadMore(incomingCount:number, page:number, pageSize:number):boolean{
 return page<20&&incomingCount>=pageSize;
}
