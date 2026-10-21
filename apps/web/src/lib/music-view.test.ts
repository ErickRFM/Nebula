import { describe, it, expect } from 'vitest';
import { groupPlayableAlbums, playableOwnedTracks } from './music-view';
import type { Track } from './catalog';

const make=(id:string,album:string,artist:string,audioUrl?:string):Track=>({
  id,title:id,album,artist,genre:'Indie',duration:'1:00',cover:'/cover.svg',audioUrl
});
describe('personal library presentation',()=>{
 it('never presents demo or third party tracks as personally imported albums',()=>{
   const tracks=[make('demo-1','Demo','Example'),make('local-1','Aurora','Ana','blob:1'),make('remote-1','Cloud','Ana','https://example.org/a.mp3')];
   expect(playableOwnedTracks(tracks).map(x=>x.id)).toEqual(['local-1']);
   expect(groupPlayableAlbums(tracks).map(x=>x.title)).toEqual(['Aurora']);
 });
 it('groups and ranks albums with real playable tracks',()=>{
   const groups=groupPlayableAlbums([
     make('local-1','Noches','A','blob:1'),make('local-2','Noches','A','blob:2'),
     make('local-3','Noches','B','blob:3'),make('local-4','Sol','A','blob:4')
   ]);
   expect(groups.map(g=>g.tracks.length)).toEqual([2,1,1]);
   expect(groups[0].tracks.map(t=>t.id)).toEqual(['local-1','local-2']);
   expect(groups).toHaveLength(3);
 });
});
