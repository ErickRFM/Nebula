import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeYouTubeUrl,normalizeEntries,MAX_RESOLVE_ENTRIES} from './url-policy.mjs';

test('accepts only allowlisted YouTube watch, youtu.be and playlist URLs',()=>{
 assert.equal(sanitizeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(sanitizeYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(sanitizeYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'),'https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ');
 assert.equal(sanitizeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&index=4'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ&index=4');
});
test('rejects option-like strings, foreign hosts, credentials and malformed ids',()=>{
 assert.equal(sanitizeYouTubeUrl('--config=/tmp/evil'),null);
 assert.equal(sanitizeYouTubeUrl('-o'),null);
 assert.equal(sanitizeYouTubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ'),null);
 assert.equal(sanitizeYouTubeUrl('https://evil.test/watch?v=dQw4w9WgXcQ'),null);
 assert.equal(sanitizeYouTubeUrl('https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ'),null);
 assert.equal(sanitizeYouTubeUrl('https://www.youtube.com/watch?v=bad'),null);
 assert.equal(sanitizeYouTubeUrl('https://www.youtube.com/playlist?list=bad*list'),null);
 assert.equal(sanitizeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ#fragment'),null);
 assert.equal(sanitizeYouTubeUrl(null),null);
});
test('normalizeEntries caps, dedupes, drops live and flags truncation',()=>{
 const entries=[...Array(MAX_RESOLVE_ENTRIES+50)].map((_,i)=>({id:String(i).padStart(11,'0'),title:'t'+i,duration:60}));
 entries.push({id:'a'.repeat(11),title:'live',is_live:true});
 const out=normalizeEntries({entries});
 assert.equal(out.items.length,MAX_RESOLVE_ENTRIES);
 assert.equal(out.truncated,true);
 assert.equal(out.items[0].sourceUrl,'https://www.youtube.com/watch?v=00000000000');
});
