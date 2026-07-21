-- Backfill iva_trasladado en CFDI cargados con el parser antiguo (traía IVA=0
-- porque tomaba el <Impuestos> interno del Concepto). Reconstruimos desde la
-- identidad aritmética: subtotal - descuento + trasladados - retenidos = total
-- => trasladados = total - subtotal + descuento + retenidos
UPDATE public.cfdi_xml
SET iva_trasladado = ROUND(
      (total - subtotal + COALESCE(descuento,0)
       + COALESCE(iva_retenido,0) + COALESCE(isr_retenido,0)
       - COALESCE(ieps_trasladado,0))::numeric, 2)
WHERE iva_trasladado = 0
  AND (total - subtotal + COALESCE(descuento,0)
       + COALESCE(iva_retenido,0) + COALESCE(isr_retenido,0)
       - COALESCE(ieps_trasladado,0)) > 0.5;