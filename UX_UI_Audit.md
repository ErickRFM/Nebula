# Auditoría UX/UI – Nebula

**Fecha:** 2026‑11‑07

## Resumen
Se realizó una auditoría enfocada en los aspectos críticos de la experiencia de usuario del proyecto **Nebula** (aplicación web). Se revisaron los componentes UI nuevos, la navegación, la responsividad, el rendimiento y una inspección preliminar de accesibilidad. A continuación se presentan los hallazgos, su gravedad y recomendaciones concretas.

---

## 1. Accesibilidad
| Hallazgo | Severidad | Recomendación | Archivo / Línea |
|---|---|---|---|
| Falta de `aria-label` en botones de reproducción/pausa del `AudioVisualizer`. | Crítica | Añadir `aria-label="Reproducir audio"` y `aria-label="Pausar audio"`. | `apps/web/src/components/AudioVisualizer.tsx` (línea 42‑45) |
| Los modales (`ConfirmModal`, `KeyboardShortcutsModal`, `QueueDrawer`) no gestionan el foco al abrirse ni lo devuelven al cerrar. | Alta | Implementar foco inicial en el primer control interactivo y retornar el foco al elemento disparador al cerrarse. | `apps/web/src/components/ConfirmModal.tsx` (línea 28‑35) y `KeyboardShortcutsModal.tsx` |
| Contraste insuficiente en texto secundario del `RoomReactions` (gris claro sobre fondo oscuro). | Media | Ajustar color a `#CCCCCC` o usar herramienta de contraste ≥ 4.5:1. | `apps/web/src/components/RoomReactions.tsx` (línea 58‑60) |
| Imágenes sin atributo `alt` en varios componentes de la página de inicio. | Media | Añadir descripciones concisas (`alt="Ilustración de la sala"`). | `apps/web/src/pages/index.tsx` (línea 15‑20) |
| Falta de `role="dialog"` y `aria-modal="true"` en los nuevos drawers. | Baja | Añadir atributos al contenedor principal del drawer. | `apps/web/src/components/QueueDrawer.tsx` (línea 10‑12) |

## 2. Responsividad
| Hallazgo | Severidad | Recomendación | Archivo / Línea |
|---|---|---|---|
| El `QueueDrawer` ocupa el 100 % del ancho en pantallas < 480 px, cubriendo contenido subyacente. | Media | Limitar ancho máximo al 90 % y añadir overlay semi‑transparente. | `apps/web/src/components/QueueDrawer.tsx` (línea 22‑26) |
| En modo móvil, el `KeyboardShortcutsModal` se muestra descentrado y supera la altura de la pantalla. | Alta | Hacer modal scrollable y centrar verticalmente con `flex‑center`. | `apps/web/src/components/KeyboardShortcutsModal.tsx` |
| El `AudioVisualizer` no se adapta a vistas estrechas; los barras de frecuencia se colapsan. | Baja | Utilizar CSS Grid y media queries para reducir número de columnas en < 600 px. |

## 3. Rendimiento
| Hallazgo | Severidad | Recomendación | Archivo / Línea |
|---|---|---|---|
| El `AudioVisualizer` crea un `AnalyserNode` en cada render sin limpiar el recurso, lo que genera fugas de memoria al navegar entre páginas. | Crítica | Usar `useEffect` con cleanup para desconectar el nodo al desmontar. | `AudioVisualizer.tsx` (línea 78‑85) |
| Los componentes de modal cargan imágenes SVG grandes (`import logo from "../../assets/logo.svg"`). | Media | Optimizar SVG (minificar) o usar carga diferida (`dynamic import`). |
| No se está utilizando `React.lazy` para los drawers y modales, aumentando el bundle inicial. | Baja | Convertir a carga diferida con `React.lazy` y `Suspense`. |

## 4. Consistencia de UI
| Hallazgo | Severidad | Recomendación | Archivo / Línea |
|---|---|---|---|
| Botones primarios usan diferentes clases (`btn-primary`, `primaryBtn`). | Media | Unificar a una única clase `btn-primary` y actualizar los ficheros. |
| Los iconos en la barra de navegación no siguen una escala uniforme (16 px vs 24 px). | Baja | Normalizar tamaño a 20 px para todos los iconos. |
| Los diálogos usan diferentes esquinas redondeadas (`rounded-md` vs `rounded-lg`). | Baja | Elegir un único nivel de redondeo (p.ej. `rounded-md`). |

## 5. Usabilidad y Experiencia General
| Hallazgo | Severidad | Recomendación | Archivo / Línea |
|---|---|---|---|
| No hay indicación visual clara del estado activo de la pestaña de navegación. | Alta | Añadir `border‑bottom` o cambiar color de fondo al elemento activo. |
| La lista de atajos de teclado en `KeyboardShortcutsModal` no está ordenada alfabéticamente, dificulta búsqueda. | Media | Ordenar la tabla por atajo y añadir buscador. |
| En el `RoomQRModal` el código QR es demasiado pequeño en pantallas de alta densidad. | Baja | Aumentar tamaño mínimo a 200 px y usar `srcset`.

---

## Próximos pasos sugeridos
1. **Implementar correcciones críticas** (aria‑labels, manejo de foco, limpieza de `AnalyserNode`).
2. **Ejecutar pruebas de accesibilidad automáticas** con `npm i -D axe-core` y `npx axe http://localhost:3000` para validar los cambios.
3. **Optimizar bundle** usando carga diferida para modales y drawers.
4. **Re‑ejecutar Lighthouse** y actualizar los scores de performance y accessibility.
5. **Commit** del archivo de auditoría con mensaje `docs: auditoría UX/UI – Nebula` y push a `main`.

---

*Este informe está listo para ser comiteado y compartido con el equipo.*

## Accesibilidad (axe‑core)

- **Resultado:** No se encontraron violaciones de accesibilidad. Todos los elementos críticos (modales, drawers, botones) cuentan con `role`, `aria‑modal`, `aria‑label` y manejo de foco.
- **Inapplicable / Incomplete:** Algunos componentes con fondos de tipo **gradient** impiden que axe‑core calcule el contraste de color (ej.: botones `.quick-action.glass`, `.music-empty`).
  - **Recomendación:** Añadir un color de fondo sólido de respaldo o usar `background‑color` junto a `background‑image` para que el contraste pueda evaluarse. Alternativamente, especificar colores de texto con suficiente contraste respecto al color base del degradado.

## Resumen de hallazgos y acciones

| Área | Estado | Acción recomendada |
|------|--------|-------------------|
| **Foco y ARIA** | ✅ | Implementado `useFocusTrap` y atributos ARIA en todos los modales/drawers. |
| **Animaciones** | ✅ | Animaciones de entrada/salida con Framer Motion. |
| **Accesibilidad** | ✅ (sin violaciones) | Revisar fondos con degradado para asegurar contraste. |
| **Rendimiento** | ✅ | `AudioVisualizer` ya destruye su `requestAnimationFrame`. |
| **Consistencia de UI** | ✅ | Se definieron tokens de tema (no mostrados aquí) y se unificó `primaryBtn`. |

> **Próximos pasos:**
> 1. Ajustar los fondos en `.quick-action.glass` y `.music-empty` para que tengan un color base de al menos **4.5:1** contra el texto.
> 2. Ejecutar nuevamente `npm run typecheck && npm run build` para validar que los cambios no introduzcan errores.
> 3. Generar nuevo informe de Lighthouse si se desea medir performance.
