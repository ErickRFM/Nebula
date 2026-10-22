# NÉBULA Music · Cosmic Glass V2

Plataforma privada de música personal: cliente web Next.js/React/TypeScript, API Fastify/PostgreSQL, almacenamiento de audio autorizado en Cloudflare R2 y cliente Android con Capacitor/Media3. El proyecto está en desarrollo: **código integrado no equivale a una función certificada en hardware o desplegada**.

## Empezar

Requiere Node.js >=20.11 y npm 10.

```bash
npm ci
npm run check
npm run dev
```

Web local: http://localhost:3000. Para pruebas de navegador: `npx playwright install chromium && npm run test:e2e`. Para desarrollar API, configurar PostgreSQL, `DATABASE_URL` y `API_JWT_SECRET` según [apps/api/README.md](apps/api/README.md):

```bash
npm run db:migrate
npm run api:dev
```

La primera cuenta se crea con `npm run owner:bootstrap` (variables `OWNER_EMAIL` y `OWNER_PASSWORD`); el registro público está deshabilitado por defecto y las cuentas adicionales requieren invitaciones. No almacenar secretos en Git.

## Componentes integrados al 21-10-2026 (main@113ceff)

| Componente | Estado del código | Validación aún necesaria |
| --- | --- | --- |
| Biblioteca local con IndexedDB y playlists | Integrado | Persistencia y cuotas en navegadores reales |
| Cuenta privada, refresh y revocación de sesiones | Integrado | Pruebas en despliegue, límites por IP y proxy (#69) |
| Biblioteca privada R2 (importación, subida, descarga y búsqueda SQL paginada) | Integrado | Smoke contra bucket y base de producción; archivos grandes |
| Etiquetas, deduplicación por SHA-256 y carátulas de álbum privadas | Integrado | Cobertura de formatos y archivos de casos extremos |
| Búsqueda federada y proveedores de audio | Integrado | Disponibilidad/capacidades según proveedor y configuración |
| YouTube | Búsqueda opcional y reproducción por embed oficial | Requiere API/configuración apropiada; no es audio libre para descarga |
| Salas, señales SSE/WebSocket y Party Sound | Base integrada | Prueba física acústica, deriva, reconexión y Bluetooth (#53) |
| Android Capacitor/Media3 y scripts de APK | Código y CI integrados | APK instalada, pantalla apagada, notificaciones, rutas de audio |
| Cosmic Glass V2 | Integrado | Auditoría WCAG, responsive y dispositivos |
| iOS, Cast y DJ avanzado | Parcial o no certificado | Implementación y validación específica |

Los commits #66, #67, #68 y #70 incorporan rediseño, estabilidad, biblioteca escalable y carátulas. El [épico V2 #64](https://github.com/ErickRFM/Nebula/issues/64) y el [plan Party Sound #53](https://github.com/ErickRFM/Nebula/issues/53) registran los criterios de cierre. Consultar siempre la versión actual de `main`: la auditoría inicial [NEBULA_V2_IMPLEMENTATION_AUDIT](docs/roadmap/NEBULA_V2_IMPLEMENTATION_AUDIT.md) se redactó antes de varios de estos commits y contiene límites ya superados.

## Verificación antes de declarar una versión lista

1. Confirmar migraciones supervisadas, secretos y R2 privados; no desactivar controles de seguridad para facilitar despliegues.
2. Ejecutar `npm run check`, tests de integración PostgreSQL, `npm run test:e2e` y la compilación Android del CI.
3. En web desplegada, probar login, cambio de cuenta, biblioteca, permisos sobre archivos ajenos, favoritos, playlists y expiración de enlaces.
4. En dos teléfonos físicos: probar sala de 30 minutos, audio de fuentes autorizadas en ambos, cambio de anfitrión, expulsión, fondo/bloqueo, reconexión y medición acústica real de desfase; registrar evidencia en `docs/rooms/PHYSICAL_QA.md`.
5. Verificar SHA exacto desplegado y las rutas de recuperación antes de producción.

**Estado de release:** integración activa, **Party Sound no certificado físicamente**. Un commit verde, el simulador o el tiempo del reproductor no demuestran sincronización acústica.

## Arquitectura

- `apps/web`: búsqueda, biblioteca, cuenta, reproductor, salas y experiencia responsive.
- `apps/api`: autenticación privada, PostgreSQL, módulos cloud, proveedores y salas.
- `packages/player-core`: lógica de transporte/cola compartida.
- `native/android` y `scripts/integrate-android.mjs`: proyecto y automatización Android.
- `docs/`: contratos, arquitectura y evidencia de pruebas.

## Privacidad y derechos

Solo importar o reproducir audio con permiso suficiente. Los archivos privados de cuenta se mantienen aislados y se sirven con autorizaciones o URLs de duración limitada. La reproducción mediante proveedor externo no otorga permiso para descargar, retransmitir o eludir DRM.
