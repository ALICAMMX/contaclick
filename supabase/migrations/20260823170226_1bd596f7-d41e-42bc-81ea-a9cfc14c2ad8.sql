ALTER TABLE public.movimientos_bancarios
  DROP CONSTRAINT IF EXISTS movimientos_bancarios_sentido_exclusivo_chk;

ALTER TABLE public.movimientos_bancarios
  ADD CONSTRAINT movimientos_bancarios_sentido_exclusivo_chk
  CHECK (
    cargo >= 0
    AND abono >= 0
    AND ((cargo > 0 AND abono = 0) OR (abono > 0 AND cargo = 0))
  );