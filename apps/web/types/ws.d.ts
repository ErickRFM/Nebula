declare module 'ws' {
 import type { Server, IncomingMessage } from 'node:http';
 export interface WebSocket {
  readonly readyState:number;readonly bufferedAmount:number;
  send(data:string):void;close(code?:number,reason?:string):void;
  on(event:'message'|'close'|'error',callback:()=>void):this;
 }
 export class WebSocketServer {
  constructor(options:{server:Server;maxPayload:number;perMessageDeflate:boolean;handleProtocols:(protocols:Set<string>)=>string|false});
  on(event:'connection',callback:(socket:WebSocket,request:IncomingMessage)=>void):this;
 }
}
