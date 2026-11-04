import {describe,it,expect} from 'vitest';
import {normalizePublicAudiusTracks} from './public-audius';

const song={
 id:'Abc_123',title:'A track',user:{name:'An artist'},permalink:'/artist/a-track',is_streamable:true,
 artwork:{'150x150':'https://cdn.audius.co/art.jpg'},duration:153,is_stream_gated:false,
};
describe('public Audius catalog safety',()=>{
 it('only accepts provider-eligible tracks and builds official stream URLs',()=>{
  expect(normalizePublicAudiusTracks({data:[song]})).toEqual([{
   id:'Abc_123',title:'A track',artist:'An artist',sourceUrl:'https://audius.co/artist/a-track',
   artworkUrl:'https://cdn.audius.co/art.jpg',durationSeconds:153,
   streamUrl:'https://api.audius.co/v1/tracks/Abc_123/stream',
  }]);
 });
 it('rejects gated streams, untrusted source URLs, unsafe IDs and duplicates',()=>{
  const data=[{...song,is_stream_gated:true},{...song,id:'../evil'},
   {...song,id:'Evil',permalink:'https://audius.co.evil.test/artist/x'},
   song,song,{...song,id:'Blocked',is_streamable:false},
   {...song,id:'NotAllowed',access:{stream:false}},
   {...song,id:'Later',is_scheduled_release:true}];
  expect(normalizePublicAudiusTracks({data})).toHaveLength(1);
 });
 it('bounds the input and does not trust artwork protocols',()=>{
  expect(normalizePublicAudiusTracks(null)).toEqual([]);
  expect(normalizePublicAudiusTracks({data:[{...song,artwork:{'150x150':'javascript:alert(1)'}}]})[0].artworkUrl).toBeNull();
  expect(normalizePublicAudiusTracks({data:[{...song,permalink:'http://audius.co/artist/x'}]})).toHaveLength(0);
 });
});
