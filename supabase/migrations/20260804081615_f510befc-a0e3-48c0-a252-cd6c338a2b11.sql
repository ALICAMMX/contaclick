REVOKE ALL ON FUNCTION public.pac_reservar(text,integer,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pac_confirmar_consumo(text,integer,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pac_devolver_reserva(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pac_recargar(integer,bigint,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pac_ajustar(integer,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pac_conciliacion(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.excepcion_vigente(uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pac_recargar(integer,bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pac_ajustar(integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pac_conciliacion(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excepcion_vigente(uuid,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.pac_reservar(text,integer,uuid,uuid,text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.pac_confirmar_consumo(text,integer,uuid,uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.pac_devolver_reserva(text,text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.pac_recargar(integer,bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pac_ajustar(integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pac_conciliacion(timestamptz) TO service_role;