# Production Release Checklist

Esta checklist se usa únicamente después de que staging y la aceptación manual estén en PASS. No autoriza publicar producción por sí sola.

## Antes

- [ ] staging PASS;
- [ ] pruebas manuales PASS;
- [ ] backup disponible;
- [ ] variables production verificadas;
- [ ] dominio verificado;
- [ ] usuarios reales preparados.

## Deploy

1. [ ] aplicar migración production;
2. [ ] verificar SQL;
3. [ ] verificar RLS;
4. [ ] verificar RPC;
5. [ ] verificar Realtime;
6. [ ] deploy Edge Function;
7. [ ] smoke test Edge Function;
8. [ ] deploy frontend;
9. [ ] smoke test login;
10. [ ] smoke test consulta;
11. [ ] smoke test agenda;
12. [ ] smoke test quote.

## Después

- [ ] monitorear errores;
- [ ] monitorear Realtime;
- [ ] verificar consulta real;
- [ ] revisar registros;
- [ ] revisar cola recepción.

## Gate obligatorio

Detener el release ante cualquier fallo de migración, aislamiento multi-clínica, intake, Realtime o flujo comercial. Nunca ejecutar `db reset --linked` ni promover producción desde esta checklist.
