import {describe,expect,it} from 'vitest';
import {normalizeMusicQuery,searchCloudTracks} from './cloud-search';

const data=[
 {title:'Canción del Mar',artist:'Música Cósmica'},
 {title:'Otra pista',artist:'Canción del Mar'},
 {title:'Mar de estrellas',artist:'Artista'},
 {title:'Canción del Mar',artist:'Otro artista'},
];
describe('private library search',()=>{
 it('matches accents and whitespace safely',()=>{
  expect(normalizeMusicQuery('  MÚSICA   cósmica ')).toBe('musica cosmica');
  expect(searchCloudTracks(data,'cancion mar')).toHaveLength(3);
 });
 it('ranks title match ahead of artist match and preserves stable ties',()=>{
  const rows=searchCloudTracks(data,'cancion del mar');
  expect(rows.map(x=>x.artist)).toEqual(['Música Cósmica','Otro artista','Canción del Mar']);
 });
 it('does not return the library for idle or short search queries',()=>{
  expect(searchCloudTracks(data,' ')).toEqual([]);
  expect(searchCloudTracks(data,'m')).toEqual([]);
 });
});
