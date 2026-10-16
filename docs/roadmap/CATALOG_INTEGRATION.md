# NÉBULA · Catálogos externos — Plan ejecutable (15 oct 2026)

## Estado verificado
- main anterior: `8613a4f`. No hay PR abiertos.
- API Fastify/PostgreSQL y web Next.js existentes.
- La web de Vercel no tiene configurada la URL del backend; los cambios de servidor no funcionarán públicamente hasta desplegarlo.
- Se preservará la biblioteca privada. El buscador solo debe estar disponible para cuentas autenticadas.
- Las pistas de ejemplo no representan un catálogo licenciado.

## Fases, dependencias y criterios de cierre

| Etapa | Implementación | Cierre con evidencia |
| --- | --- | --- |
| C00 | Contratos, adaptadores, validación y límites de búsqueda | Tests de normalización + endpoints auth |
| C01 | Jamendo | Búsqueda real con client ID propio, audio autorizado y licencia mostrada |
| C02 | MusicBrainz + Cover Art Archive | Coincidencias revisables sin pisar etiquetas manuales; max 1 solicitud/s |
| C03 | Openverse | Búsqueda paginada, fuente/atribución y verificación de licencias |
| C04 | Audius | Resolución de streams con API actual y permisos comprobados |
| C05 | Referencias personales en PostgreSQL | Guardar/quitar referencias con aislamiento entre cuentas |
| C06 | UI Cosmic Glass | Buscar/escuchar/guardar con estados de error y sin botones ficticios |
| C07 | R2 privado | Importación explícita autorizada, idempotencia y seguridad SSRF |
| C08 | Streaming propio | Token firmado, Range 206, compatibilidad y acceso entre dispositivos |
| C09 | Operación/QA | Administración, limitadores, fallos parciales, dashboards y cobertura E2E |
| C10 | Internet Archive | Añadir solo con procedencia/licencias verificadas |

## Restricciones
- **No equivale a licencia de almacenamiento** un `audiodownload_allowed: true` ni una URL de streaming. `canStorePrivateCopy=false` por defecto.
- No descargar ni transcodificar fuentes de terceros hasta que exista una comprobación positiva y específica de permiso, proceso de consentimiento y objetos privados.
- Nunca redirigir el backend a URLs suministradas por clientes. Usar hosts fijos y reglas SSRF.
- No agregar un catálogo público anónimo: todos los endpoints que exponen listas requieren identidad.
- No iniciar servicios de pago ni crear bucket de producción sin autorización explícita.
- Git: ramas breves, CI verde, no force push, cambios incrementales.

## Primer release verificable
1. Inicio de sesión en API privada.
2. Consultar proveedores activos y resultados normalizados.
3. Buscar un tema real y distinguir disponibilidad/capacidades.
4. Reproducir desde proveedor compatible, sujeto a autorización y CORS.
5. Guardar una referencia en biblioteca del usuario y recuperarla tras recarga.
6. Denegar lectura a otra cuenta.
7. No copiar ni cachear audio de terceros en R2 sin permiso.

## Evidencia pendiente externa
- `JAMENDO_CLIENT_ID` de proyecto y términos aplicables.
- URL de Fastify en producción en Render y PostgreSQL accesible.
- Verificación de la reproducción de Audius/Openverse según navegador y restricciones actuales.
- R2 privado con credenciales de alcance mínimo.
