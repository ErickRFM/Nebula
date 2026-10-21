# NÉBULA C10 — Internet Archive: catálogo de audio abierto sin clave

## Alcance implementado (pendiente de validación posterior)

El proveedor `internetarchive` consulta la API pública de búsqueda de Internet Archive por título o artista, sin `YOUTUBE_API_KEY`, sin servicio adicional y sin transcodificar audio.

**Flujo:** Buscar / Explorar → Internet Archive → resultados normalizados → Escuchar con el reproductor HTML Audio existente → abrir fuente y licencia → Guardar referencia en la cuenta → agregarla a una playlist o a favoritos.

### Adaptador y seguridad

- Buscar exclusivamente en `https://archive.org/advancedsearch.php` con `mediatype:audio`, parámetro de consulta literal y paginación.
- Resolver metadatos y archivos desde `https://archive.org/metadata/{identifier}`; máximo seis elementos del Archive por consulta para contener la latencia.
- Solo ofrecer audio reproducible cuando el registro del item tenga una **licencia Creative Commons o marca de dominio público explícita**, un archivo de audio público de origen original/derivado y una URL fija de descarga generada por NÉBULA.
- Evitar acceso a host arbitrario desde el backend; ambas APIs tienen dominio fijo en la lista permitida. Se ignoran identificadores peligrosos, archivos privados, archivos no compatibles y metadatos sin permiso explícito.
- Cada referencia guarda ID estable calculado del identificador del item y el nombre del archivo. No se guardan URLs de audio firmadas.
- `canStorePrivateCopy=false` y `canDownload=false` hasta documentar derechos específicos de redistribución/almacenamiento por pista. Buscar y escuchar no debe implicar copia automática.
- Una falla de metadatos de un item no derriba los otros proveedores federados.

### Base de datos

`0013_internet_archive_provider.sql` amplía únicamente el CHECK de `external_library_items.provider`. No altera usuarios, objetos de R2, títulos, playlists, favoritos ni referencias existentes. No aplicarla a producción hasta la etapa de validación/despliegue acordada.

### Pruebas pendientes de ejecución/recepción

1. `npm run typecheck`, tests unitarios y pruebas de integración con PostgreSQL aislado.
2. Ejecutar todas las migraciones desde cero, verificando reproducción aditiva y restricciones.
3. Buscar una obra explícitamente CC0/CC BY del Archive. Revisar licencia y procedencia antes de reproducir.
4. Abrir el MP3 en el navegador: comprobar CORS, redirecciones, formato, duración, pausa, cambio de canción y errores visibles.
5. Guardar una referencia en Cuenta, recargarla y añadirla a una playlist; rechazar el acceso de otra cuenta.
6. Buscar un item sin licencia, privado y no-musical: no debe anunciarse como reproducible.
7. Medir latencia y límites de consultas del Archive y ajustar el número de resultados si fuera necesario.

El catálogo de Internet Archive **no equivale a las discografías completas de YouTube, Spotify o SoundCloud**, y la disponibilidad del audio puede cambiar. Este conector no bloquea anuncios ni convierte videos protegidos.
