# Reglas de desarrollo del proyecto

Estas instrucciones aplican a futuros cambios realizados por Codex dentro de este repositorio.

## Arquitectura

- Usar React para las nuevas interfaces de la CRM.
- Mantener Vite como herramienta de desarrollo y build del frontend React.
- Mantener Tailwind CSS como sistema principal de estilos de la CRM.
- Usar Motion sólo cuando la animación mejore la comprensión, el feedback o la continuidad de la interfaz.
- Respetar siempre prefers-reduced-motion.
- Crear componentes reutilizables y evitar volver a concentrar páginas, modales y lógica de acceso a datos en un único archivo.
- Mantener separadas las responsabilidades de components, pages, hooks, services, lib, estilos y assets.
- Preferir una migración progresiva sobre una reescritura masiva.

## Backend y seguridad

- Respetar la arquitectura existente: landing estática, CRM React y backend Supabase.
- Mantener separados frontend y backend; no migrar Supabase ni la lógica de negocio a Node.js por conveniencia del frontend.
- No romper ni cambiar innecesariamente contratos de APIs, Edge Functions, RPCs, Auth, RLS, roles o multi-clínica.
- No hardcodear clinic_id; derivarlo siempre de la sesión y el perfil autorizados.
- No exponer service_role, secretos ni variables privadas en el frontend.
- No desactivar RLS ni sustituir las restricciones de base de datos por validaciones únicamente visuales.
- No agregar dependencias salvo que resuelvan una necesidad concreta y no exista ya una solución adecuada en el proyecto.

## UX y calidad

- Mantener una interfaz moderna, limpia, intuitiva y orientada a la próxima acción.
- Diseñar y verificar cada cambio para escritorio, tablet y móvil.
- Adaptar navegación, formularios, filtros, cards, tablas y modales al espacio disponible; no limitarse a reducir tamaños.
- Usar estados de carga, vacíos, éxito y error claros.
- Revisar errores de consola, imports, rutas, formularios y llamadas al backend después de cambios importantes.
- Ejecutar como mínimo la instalación necesaria y el build de producción antes de finalizar cambios importantes.
- Ejecutar lint y tests existentes cuando estén disponibles y corregir errores causados por los cambios.
- Mantener build.sourcemap en false salvo una decisión explícita y justificada.
