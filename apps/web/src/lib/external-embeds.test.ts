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
 it('accepts Spotify and Deezer official embeds without trusting query parameters',()=>{
   expect(parseExternalEmbed('https://open.spotify.com/track/0123456789ABCDEFGHIJKL?si=not-trusted')).toEqual({
     provider:'spotify',src:'https://open.spotify.com/embed/track/0123456789ABCDEFGHIJKL',
     sourceUrl:'https://open.spotify.com/track/0123456789ABCDEFGHIJKL',
   });
   expect(parseExternalEmbed('https://www.deezer.com/mx/track/3135556')?.src).toBe('https://widget.deezer.com/widget/dark/track/3135556');
   expect(parseExternalEmbed('https://open.spotify.com.evil.test/track/0123456789ABCDEFGHIJKL')).toBeNull();
   expect(parseExternalEmbed('https://deezer.com.evil.test/track/123')).toBeNull();
   expect(parseExternalEmbed('https://open.spotify.com/track/INVALID')).toBeNull();
   expect(parseExternalEmbed('https://deezer.com/track/1/extra')).toBeNull();
 });
 it('rejects untrusted hosts, non-HTTPS and ambiguous paths',()=>{
   for(const url of ['http://youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://youtu.be/invalid','javascript:alert(1)','https://soundcloud.com.evil.test/a/b','https://youtu.be/dQw4w9WgXcQ/another-video','https://youtube.com:8443/watch?v=dQw4w9WgXcQ','https://youtube.com/embed/dQw4w9WgXcQ/extra']){
     expect(parseExternalEmbed(url)).toBeNull();
   }
 });
 it('canonicalizes YouTube Music links and removes untrusted parameters',()=>{
   const media=parseExternalEmbed('https://music.youtube.com/watch?v=dQw4w9WgXcQ&redirect=https%3A%2F%2Fevil.example');
   expect(media).toEqual({provider:'youtube',src:'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',sourceUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'});
 });
});
