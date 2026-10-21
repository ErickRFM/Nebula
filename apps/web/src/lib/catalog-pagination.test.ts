import {describe,it,expect} from 'vitest';
import {appendUniqueTracks,canLoadMore} from './catalog-pagination';
const song=(id:string,label:string)=>({id,title:label});
describe('federated catalog pagination',()=>{
 it('appends pages in order and keeps the first copy of duplicate tracks',()=>{
  const first=[song('jamendo:1','First'),song('openverse:1','Shared')];
  const next=[song('openverse:1','Duplicate'),song('audius:2','Last')];
  expect(appendUniqueTracks(first,next)).toEqual([...first,next[1]]);
  expect(first).toHaveLength(2);
 });
 it('deduplicates results within a single provider page',()=>{
  expect(appendUniqueTracks([], [song('audius:x','A'),song('audius:x','B')])).toEqual([song('audius:x','A')]);
 });
 it('stops when the source becomes exhausted or the API page limit is reached',()=>{
  expect(canLoadMore(12,1,12)).toBe(true);
  expect(canLoadMore(48,19,12)).toBe(true);
  expect(canLoadMore(6,3,12)).toBe(false);
  expect(canLoadMore(12,20,12)).toBe(false);
  expect(canLoadMore(0,1,12)).toBe(false);
 });
});
