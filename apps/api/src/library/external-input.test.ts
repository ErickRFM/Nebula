import {describe,it,expect} from 'vitest';
import {externalInput} from './external-input';
const good={provider:'jamendo',externalId:'12345',title:'Luz',artist:'Test',sourceUrl:'https://www.jamendo.com/track/12345'};
describe('saved external reference validation',()=>{
  it('accepts a canonical Jamendo reference',()=>expect(externalInput.safeParse(good).success).toBe(true));
  it('rejects mismatched Jamendo hosts',()=>expect(externalInput.safeParse({...good,sourceUrl:'https://example.com/track/12345'}).success).toBe(false));
  it('rejects script URLs and credentials',()=>{
    expect(externalInput.safeParse({...good,sourceUrl:'javascript:alert(1)'}).success).toBe(false);
    expect(externalInput.safeParse({...good,sourceUrl:'https://user:pass@www.jamendo.com/a'}).success).toBe(false);
  });
  it('forbids client supplied storage rights or audio URLs',()=>{
    expect(externalInput.safeParse({...good,canStorePrivateCopy:true}).success).toBe(false);
    expect(externalInput.safeParse({...good,streamUrl:'https://other.host/song'}).success).toBe(false);
  });
});
