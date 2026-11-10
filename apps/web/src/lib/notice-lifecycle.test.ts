import {describe,expect,it} from 'vitest';
import {clearTransientPlaybackNotice} from './notice-lifecycle';

describe('import feedback during media playback',()=>{
 it('does not erase successful IndexedDB persistence confirmation on play/playing',()=>{
  const notice='3 canciones guardadas en este navegador con sus metadatos disponibles.';
  expect(clearTransientPlaybackNotice(notice)).toBe(notice);
 });
 it('preserves the singular import confirmation',()=>{
  const notice='1 canción guardada en este navegador con sus metadatos disponibles.';
  expect(clearTransientPlaybackNotice(notice)).toBe(notice);
 });
 it('preserves partial local imports to avoid a silent data-loss illusion',()=>{
  const notice='1 de 2 guardadas; las demás solo estarán disponibles hasta cerrar esta sesión.';
  expect(clearTransientPlaybackNotice(notice)).toBe(notice);
 });
 it('preserves the ongoing local save announcement until persistence settles',()=>{
  const notice='Guardando tus canciones en este dispositivo…';
  expect(clearTransientPlaybackNotice(notice)).toBe(notice);
 });
 it('clears playback-specific errors once audio is successfully playing',()=>{
  for(const notice of ['La transmisión se detuvo temporalmente.','El navegador no pudo cargar el audio.','El proveedor está cargando el audio.']){
   expect(clearTransientPlaybackNotice(notice)).toBe('');
  }
 });
});
