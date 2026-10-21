import {describe,it,expect} from 'vitest';
import {parseExternalEmbed} from './external-embeds';
describe('official external embeds',()=>{
 it('accepts direct HTTPS YouTube video links',()=>{
   expect(parseExternalEmbed('https://youtu.be/dQw4w9WgXcQ')?.provider).toBe('youtube');
   expect(parseExternalEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.src).toContain('/embed/dQw4w9WgXcQ');
 });
 it('accepts only SoundCloud track-like HTTPS sources',()=>{
   const result=parseExternalEmbed('https://soundcloud.com/example/recording');
   expect(result?.provider).toBe('soundcloud');
   expect(result?.src).toContain('w.soundcloud.com/player/');
   expect(parseExternalEmbed('https://soundcloud.com/search?q=x')).toBeNull();
 });
 it('rejects untrusted hosts, non-HTTPS and ambiguous paths',()=>{
   for(const url of ['http://youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://youtu.be/invalid','javascript:alert(1)','https://soundcloud.com.evil.test/a/b']){
     expect(parseExternalEmbed(url)).toBeNull();
   }
 });
});
