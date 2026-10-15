import {describe,it,expect} from 'vitest';
import {parsePlaylists} from './usePlaylists';
describe('persisted playlist contract',()=>{
  it('parses an empty or broken payload',()=>{
    expect(parsePlaylists(null)).toEqual([]);
    expect(parsePlaylists('bad')).toEqual([]);
  });
  it('rejects corrupt entries',()=>{
    const entries=[{id:'a',title:'Viaje',trackIds:['x'],createdAt:1},{id:'bad',title:34,trackIds:[],createdAt:1}];
    expect(parsePlaylists(JSON.stringify(entries))).toEqual([entries[0]]);
  });
});
