# NÉBULA · Cuenta inicial privada

## Política
- `POST /v1/auth/register` **cerrado por defecto**.
- `NEBULA_ALLOW_REGISTRATION=true` se reserva a fixtures de CI/local y NO se configura en producción.
- La creación del primer usuario se realiza por CLI a través de una conexión PostgreSQL segura.
- No introducir el secreto JWT, credenciales ni audio en Git.
- Esta fase crea una sola cuenta inicial, **sin jerarquía de roles** todavía. Para invitaciones futuras se requerirá RBAC real.

## Inicialización del propietario

1. Crear la base de datos NÉBULA y definir `DATABASE_URL` para esa instancia exclusivamente.
2. Ejecutar `npm ci && npm run db:migrate`.
3. Establecer temporalmente `NEBULA_OWNER_EMAIL` y `NEBULA_OWNER_PASSWORD` (mínimo 12 caracteres; usar un gestor de contraseñas).
4. Ejecutar `npm run owner:bootstrap`.
5. Borrar del proceso/terminal las variables temporales.
6. Iniciar la API **sin** `NEBULA_ALLOW_REGISTRATION=true`.

El script rechaza ejecutarse si ya hay usuarios; nunca trunca tablas, ni promueve cuentas existentes automáticamente.

## Bloqueos antes de declarar privado el servicio
- La web estáticamente exportada permanece accesible si Vercel no tiene protección de acceso.
- El acceso a música privada y perfiles debe controlarse en la API; no basarse en ocultar botones.
- Renovación/revocación de sesiones y verificación de correo no se implementan en esta fase.
- Las cuentas invitadas no se habilitan hasta implementar roles OWNER/MEMBER e invitaciones seguras.
- Para uso personal, considere protección de despliegue de Vercel o red privada/VPN antes de añadir contenido sensible.
