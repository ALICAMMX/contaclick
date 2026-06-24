import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import { assertWithinLimit, UsageLimitError } from "@/lib/usage/limits";

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i;

const CreateSchema = z.object({
  rfc: z.string().regex(RFC_REGEX, "RFC inválido").transform((s) => s.toUpperCase()),
  razon_social: z.string().min(2).max(200),
  regimen_fiscal: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  telefono: z.string().max(40).optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
});

export const listClientes = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, regimen_fiscal, semaforo, estado_mes, email, telefono, created_at, despacho_id")
      .eq("tipo_relacion", "cliente")
      .is("cliente_padre_id", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Candado #10: filtro por permisos por expediente (acceso restringido).
    // Si el despacho activa acceso_restringido, los colaboradores sólo ven
    // los expedientes que les fueron asignados. Owner y rol "despacho" ven todo.
    const despachoIds = Array.from(new Set(rows.map((r: any) => r.despacho_id).filter(Boolean)));
    if (despachoIds.length === 0) return { clientes: rows.map(({ despacho_id: _d, ...r }: any) => r) };

    const { data: desps } = await supabase
      .from("despachos").select("id, owner_user_id, acceso_restringido").in("id", despachoIds);
    const dMap = new Map((desps ?? []).map((d: any) => [d.id, d]));

    const { data: roles } = await supabase
      .from("user_roles").select("despacho_id, role").eq("user_id", userId).eq("role", "despacho");
    const adminOf = new Set((roles ?? []).map((r: any) => r.despacho_id));

    const restrictedDespachos = despachoIds.filter((id) => {
      const d: any = dMap.get(id);
      if (!d?.acceso_restringido) return false;
      if (d.owner_user_id === userId) return false;
      if (adminOf.has(id)) return false;
      return true;
    });

    let allowedSet: Set<string> | null = null;
    if (restrictedDespachos.length) {
      const restrictedClienteIds = rows
        .filter((r: any) => restrictedDespachos.includes(r.despacho_id))
        .map((r: any) => r.id);
      const { data: asig } = await supabase
        .from("cliente_asignaciones").select("cliente_id")
        .eq("user_id", userId).in("cliente_id", restrictedClienteIds);
      allowedSet = new Set((asig ?? []).map((a: any) => a.cliente_id));
    }

    const visible = rows.filter((r: any) => {
      if (!restrictedDespachos.includes(r.despacho_id)) return true;
      return allowedSet?.has(r.id);
    }).map(({ despacho_id: _d, ...r }: any) => r);

    return { clientes: visible };
  });

export const getCliente = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("clientes").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return row;
  });

export const resolveActiveCliente = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const select = "id, rfc, razon_social, regimen_fiscal, tipo_relacion, cliente_padre_id";
    const { data: row, error } = await supabase
      .from("clientes")
      .select(select)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    if (row.tipo_relacion === "cliente" && !row.cliente_padre_id) {
      return {
        id: row.id,
        rfc: row.rfc,
        razon_social: row.razon_social,
        regimen_fiscal: row.regimen_fiscal,
      };
    }

    if (!row.cliente_padre_id) return null;
    const { data: parent, error: parentError } = await supabase
      .from("clientes")
      .select(select)
      .eq("id", row.cliente_padre_id)
      .eq("tipo_relacion", "cliente")
      .is("cliente_padre_id", null)
      .maybeSingle();
    if (parentError) throw new Error(parentError.message);
    if (!parent) return null;
    return {
      id: parent.id,
      rfc: parent.rfc,
      razon_social: parent.razon_social,
      regimen_fiscal: parent.regimen_fiscal,
    };
  });

export const createCliente = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve user's active despacho (membership first, fallback to owner)
    let despachoId: string | null = null;
    const { data: mem } = await supabase
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .limit(1)
      .maybeSingle();
    if (mem?.despacho_id) despachoId = mem.despacho_id as string;
    if (!despachoId) {
      const { data: own } = await supabase
        .from("despachos").select("id").eq("owner_user_id", userId).limit(1).maybeSingle();
      if (own?.id) despachoId = own.id as string;
    }

    if (despachoId) {
      try { await assertWithinLimit(supabase, despachoId, "rfcs"); }
      catch (e) {
        if (e instanceof UsageLimitError) throw new Error(e.message);
        throw e;
      }
    }

    const { data: row, error } = await supabase
      .from("clientes")
      .insert({
        user_id: userId,
        despacho_id: despachoId,
        rfc: data.rfc,
        razon_social: data.razon_social,
        regimen_fiscal: data.regimen_fiscal || null,
        email: data.email || null,
        telefono: data.telefono || null,
        notas: data.notas || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCliente = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clientes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpsertFromCsfSchema = z.object({
  rfc: z.string().regex(RFC_REGEX, "RFC inválido").transform((s) => s.toUpperCase()),
  razon_social: z.string().min(2).max(200),
  regimen_fiscal: z.string().max(500).optional().nullable(),
  curp: z.string().max(20).optional().nullable(),
  tipo_persona: z.enum(["fisica", "moral"]).optional().nullable(),
  domicilio_fiscal: z.string().max(500).optional().nullable(),
  codigo_postal: z.string().max(10).optional().nullable(),
  csf_ultima_emision: z.string().optional().nullable(), // ISO date
  tipo_relacion: z.enum(["cliente", "proveedor", "acreedor"]).default("cliente"),
  cliente_padre_id: z.string().uuid().optional().nullable(),
});

export const upsertClienteFromCsf = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertFromCsfSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolver despacho_id
    let despachoId: string | null = null;
    const { data: mem } = await supabase
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .limit(1)
      .maybeSingle();
    if (mem?.despacho_id) despachoId = mem.despacho_id as string;
    if (!despachoId) {
      const { data: own } = await supabase
        .from("despachos").select("id").eq("owner_user_id", userId).limit(1).maybeSingle();
      if (own?.id) despachoId = own.id as string;
    }

    // Buscar existente por (despacho, rfc, tipo_relacion, padre)
    let query = supabase
      .from("clientes")
      .select("*")
      .eq("rfc", data.rfc)
      .eq("tipo_relacion", data.tipo_relacion);
    if (despachoId) query = query.eq("despacho_id", despachoId);
    else query = query.eq("user_id", userId);
    if (data.cliente_padre_id) query = query.eq("cliente_padre_id", data.cliente_padre_id);
    else query = query.is("cliente_padre_id", null);

    const { data: existing } = await query.maybeSingle();

    const csfFecha = data.csf_ultima_emision || null;

    const payload = {
      razon_social: data.razon_social,
      regimen_fiscal: data.regimen_fiscal || null,
      curp: data.curp || null,
      tipo_persona: data.tipo_persona || null,
      domicilio_fiscal: data.domicilio_fiscal || null,
      codigo_postal: data.codigo_postal || null,
      csf_ultima_emision: csfFecha,
    };

    if (existing) {
      const diffs: string[] = [];
      const labelMap: Record<string, string> = {
        razon_social: "Razón social",
        regimen_fiscal: "Régimen fiscal",
        curp: "CURP",
        tipo_persona: "Tipo de persona",
        domicilio_fiscal: "Domicilio fiscal",
        codigo_postal: "Código postal",
      };
      for (const k of Object.keys(labelMap)) {
        const nuevo = (payload as any)[k];
        const viejo = (existing as any)[k];
        if (nuevo && nuevo !== viejo) diffs.push(labelMap[k]);
      }
      const { data: updated, error } = await supabase
        .from("clientes")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { accion: "actualizado" as const, cliente: updated, diferencias: diffs };
    }

    const { data: inserted, error } = await supabase
      .from("clientes")
      .insert({
        user_id: userId,
        despacho_id: despachoId,
        rfc: data.rfc,
        tipo_relacion: data.tipo_relacion,
        cliente_padre_id: data.cliente_padre_id || null,
        ...payload,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { accion: "creado" as const, cliente: inserted, diferencias: [] as string[] };
  });

export const listTerceros = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("clientes")
      .select("id, rfc, razon_social, regimen_fiscal, tipo_relacion, csf_ultima_emision")
      .eq("cliente_padre_id", data.cliente_id)
      .in("tipo_relacion", ["proveedor", "acreedor"])
      .order("razon_social", { ascending: true });
    if (error) throw new Error(error.message);
    return { terceros: rows ?? [] };
  });

export const listRfcsVinculados = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, regimen_fiscal, tipo_relacion, tipo_persona, codigo_postal, csf_ultima_emision, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rfcs: data ?? [] };
  });

