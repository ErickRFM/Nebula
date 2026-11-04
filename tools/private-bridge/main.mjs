import {randomBytes} from 'node:crypto';
import {createBridgeServer,normalizeOrigins} from './bridge-core.mjs';
import {createYtdlpRunner} from './yt-dlp-runner.mjs';

const token=process.env.NEBULA_BRIDGE_TOKEN||randomBytes(32).toString('hex');
const port=Number(process.env.NEBULA_BRIDGE_PORT||4177);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid NEBULA_BRIDGE_PORT');
const runner=createYtdlpRunner({
 enabled:process.env.NEBULA_ENABLE_YTDLP==='true',
 ytdlp:process.env.NEBULA_YTDLP_PATH||'yt-dlp',
 ffmpeg:process.env.NEBULA_FFMPEG_PATH||'ffmpeg',
});
const app=createBridgeServer({
 secret:token,port,origins:normalizeOrigins(process.env.NEBULA_BRIDGE_ORIGINS),runner,
 logger:(event)=>console.error('[bridge]',event),
});
const address=await app.listen();
console.log('NÉBULA bridge listening only on http://127.0.0.1:'+address.port);
console.log('Paste this private pairing token into NÉBULA (never commit/share it): '+token);
console.log(runner.enabled?'YT-DLP enabled. No YouTube account cookies or DRM bypass configured.':'YT-DLP disabled: set NEBULA_ENABLE_YTDLP=true only if you are authorized to access/stream the source.');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
