# NÉBULA V2 — Sistema visual y UX/UI (21-oct-2026)

Este documento registra una auditoría de implementación sobre `main@6a5b058`, no un rediseño imaginario. El sistema **Cosmic Glass** del repositorio sigue siendo la fuente visual de verdad.

## Referencias revisadas

| Proyecto abierto | Qué adoptamos como patrón | Qué NO copiamos |
|---|---|---|
| [Feishin](https://github.com/jeffvli/feishin) | Música real primero, álbumes reproducibles, controles persistentes, biblioteca por fuente | No copiamos código, componentes GPL-3.0, ni instalamos otro motor de música. |
| [Mice](https://github.com/sillyangel/mice) | Organización consistente de Home, biblioteca, búsquedas y control de cola usando React/Next | No importamos Tailwind/shadcn completo a un proyecto que ya tiene estilos y navegación. |
| [Tonearm](https://github.com/j4ckxyz/navidrome-client-web) | Atajos de teclado, canciones recientes, estado de cola accesible | Es principalmente escritorio; NÉBULA debe seguir funcionando en móvil. |
| [shadcn/ui](https://github.com/shadcn-ui/ui) y [Radix Primitives](https://www.radix-ui.com/primitives) | Estados de foco, semántica accesible, controles con tamaño táctil suficiente | No añadimos dependencias por moda; cada nueva primitiva se justifica con una necesidad comprobada. |

Estas referencias son de arquitectura/experiencia y no autorizan copiar sus recursos, identidad ni licencias.

## Auditoría inicial: problemas y resolución de este PR

| Pantalla/sistema | Problema verificado | Cambio implementado |
|---|---|---|
| Inicio | Hero extenso y álbumes ilustrativos usados como botones de playlist | Hero compacto contextual, tres accesos directos funcionales y colecciones reproducibles si hay canciones propias |
| Biblioteca | `Álbumes` mostraba ejemplos no vinculados a los archivos | Agrupación real de canciones locales por álbum y artista, reproducible en cola |
| Buscar | Tracks de demostración aparecían como resultados locales | Buscar ahora muestra únicamente importaciones locales; conserva fuentes externas y R2 |
| Playlists | Texto afirmaba falsamente que las canciones de cuenta no se sincronizan | Texto corregido y guía para añadir canciones reales; elimina carrusel de ejemplos inertes |
| Reproductor mini | Barra de progreso no interactiva | Seek con input de rango accesible, teclado y tiempos semánticos |
| Navegación | Ajustes inalcanzable en móvil; icono de notificaciones deshabilitado ocupaba espacio | Acceso táctil a Ajustes en la barra móvil; sin acción falsa |
| Accesibilidad | Sin preferencia de contraste alto; navegación solo por clic | Contraste alto persistido en localStorage, foco visible mejorado, Ctrl/Cmd+K y / abren Buscar |
| Design system | Bordes/glow inconsistentes, demasiados contenedores sueltos | Extensiones sobre variables y clases CSS existentes, glass mate, superficies, jerarquía y breakpoints. No hay framework paralelo |

### Calidad de interacción

- Lo que no se puede reproducir no aparece como canción propia reproducible.
- Las tarjetas de álbum corresponden a archivos reales. Se preserva el reproductor que ya existe.
- Las preferencias de contraste alto y movimiento reducido son independientes y persistentes.
- Los controles interactivos tienen etiqueta y estados de foco visibles. Los no implementados se omiten o marcan claramente.
- La UI móvil conserva acceso a Buscar, Ajustes, Cuenta, Biblioteca, Playlists y Salas.
- Todos los cambios se verifican en desktop y mobile Playwright; `npm run test` cubre agrupación de álbumes.

## Dependencias y decisiones

No se añadió Tailwind, shadcn, Radix o Framer Motion porque reemplazar la base existente implicaría duplicación y riesgo de regresiones. Se conserva `lucide-react`, `Next.js`, React y el `player-core` actual. En los próximos PR, incorporar una primitiva de Radix cuando exista un caso real, como menú contextual/diálogo accesible; registrar el costo de bundle y verificar la licencia.

## Siguientes fases existentes (Issue #64)

1. **Biblioteca a escala**: búsqueda SQL de R2 con paginación, etiquetas FLAC/M4A, carátulas, reanudación y deduplicación por hash.
2. **Buscador multifuente**: resolver capacidades, ranking de resultados sin inventarlos y errores parciales por proveedor. PR #65 Internet Archive está en validación independiente: no mezclarlo con UX.
3. **Motor de reproducción**: renovación de enlaces firmados durante colas, reproducción continua, dispositivos y Media3.
4. **Party Sound**: gateway validado, lista de receptores, control de DJ y medición física acústica con dos teléfonos y Bluetooth.
5. **Accesibilidad ampliada**: diálogos de confirmación consistentes, teclado completo, VoiceOver/TalkBack, WCAG 2.2 AA, contraste medido y preferencia automática del sistema.
6. **UX/UI restante**: refinar cuenta, gestión de playlists, estados del reproductor completo, botones de formularios de Party Sound, búsqueda paginada, componentes de feedback, optimización de imágenes y loading/error empty states con datos reales.

## Condiciones para merge y producción

No fusionar si no pasan typecheck, unit, API/integración, Next build, Playwright desktop/mobile y APK debug. Asegurar que `main` no cambió sin reconciliación. Confirmar en Vercel `READY` con el SHA exacto. Ni ese estado ni las pruebas automáticas certifican sonido sincronizado entre varios aparatos.
