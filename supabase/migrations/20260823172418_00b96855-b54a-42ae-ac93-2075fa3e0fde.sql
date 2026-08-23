REVOKE ALL ON FUNCTION public.movimiento_operable(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimiento_operable(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.guard_movimiento_operable() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.conciliacion_importacion_bitacora_inmutable() FROM public, anon, authenticated;