# Guardar referencias externas en biblioteca privada (C05)

Los resultados encontrados en Jamendo/Openverse/Audius son **referencias**, no archivos almacenados en R2. Esta fase guarda en PostgreSQL exclusivamente una ficha: proveedor, ID, título, autor, portada, fuente, licencia informativa.

Endpoints autenticados:
- `GET /v1/library/external`: referencias del usuario (máximo 1000 temporalmente).
- `POST /v1/library/external`: crea de forma idempotente por userId+provider+externalId.
- `DELETE /v1/library/external/:provider/:externalId`: elimina solo la referencia del propietario.

No se persisten URLs de streaming, claves, descargas ni permisos para copiar. Los títulos son snapshots enviados por el cliente, tratados como texto no verificado. En futuros PRs se resolverán desde el proveedor antes de reproducir y se actualizará la metadata comprobada.

Migración 0002 añade `external_library_items`, clave de usuario y unicidad. No toca registros anteriores. El runner actual usa SQL idempotente enumerado (mejorar tracking/checksum en una fase posterior).

## QA
Integración PostgreSQL comprueba duplicados, protección entre usuarios y acceso no autenticado.
