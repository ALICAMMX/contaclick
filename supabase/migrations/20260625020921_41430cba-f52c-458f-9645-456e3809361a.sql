
CREATE TABLE public.rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);
CREATE INDEX idx_rate_limits_cleanup ON public.rate_limits (window_start);

GRANT SELECT ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own rate_limits" ON public.rate_limits
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket TEXT,
  _max INTEGER,
  _window_seconds INTEGER
) RETURNS TABLE (allowed BOOLEAN, current_count INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rate_limits (user_id, bucket, window_start, count)
  VALUES (v_uid, _bucket, v_window_start, 1)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  -- limpieza oportunista de ventanas viejas (>24h)
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '24 hours';

  IF v_count > _max THEN
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
    VALUES (v_uid, 'rate_limit_exceeded', 'rate_limit', _bucket,
            jsonb_build_object('bucket', _bucket, 'count', v_count, 'max', _max, 'window_seconds', _window_seconds))
    ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT FALSE, v_count, v_window_start + make_interval(secs => _window_seconds);
  ELSE
    RETURN QUERY SELECT TRUE, v_count, v_window_start + make_interval(secs => _window_seconds);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;
