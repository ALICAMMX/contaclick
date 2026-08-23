export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activos_fijos: {
        Row: {
          baja_fecha: string | null
          baja_motivo: string | null
          categoria: string
          cliente_id: string | null
          codigo: string | null
          created_at: string
          created_by: string | null
          descripcion: string
          despacho_id: string
          estado: string
          factura_uuid: string | null
          fecha_adquisicion: string
          fecha_inicio_uso: string | null
          id: string
          metodo: string
          moi: number
          notas: string | null
          proveedor: string | null
          responsable: string | null
          tasa_contable_anual: number | null
          tasa_fiscal_anual: number
          ubicacion: string | null
          updated_at: string
          valor_residual: number
        }
        Insert: {
          baja_fecha?: string | null
          baja_motivo?: string | null
          categoria?: string
          cliente_id?: string | null
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          descripcion: string
          despacho_id: string
          estado?: string
          factura_uuid?: string | null
          fecha_adquisicion: string
          fecha_inicio_uso?: string | null
          id?: string
          metodo?: string
          moi: number
          notas?: string | null
          proveedor?: string | null
          responsable?: string | null
          tasa_contable_anual?: number | null
          tasa_fiscal_anual?: number
          ubicacion?: string | null
          updated_at?: string
          valor_residual?: number
        }
        Update: {
          baja_fecha?: string | null
          baja_motivo?: string | null
          categoria?: string
          cliente_id?: string | null
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string
          despacho_id?: string
          estado?: string
          factura_uuid?: string | null
          fecha_adquisicion?: string
          fecha_inicio_uso?: string | null
          id?: string
          metodo?: string
          moi?: number
          notas?: string | null
          proveedor?: string | null
          responsable?: string | null
          tasa_contable_anual?: number | null
          tasa_fiscal_anual?: number
          ubicacion?: string | null
          updated_at?: string
          valor_residual?: number
        }
        Relationships: [
          {
            foreignKeyName: "activos_fijos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_fijos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          accion_sugerida: string | null
          cliente_id: string | null
          created_at: string
          descripcion: string | null
          despacho_id: string | null
          estatus: string
          evidencia: Json | null
          id: string
          nivel: string
          origen: string | null
          recomendacion: string | null
          resuelta_at: string | null
          resuelta_por: string | null
          rfc_id: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          accion_sugerida?: string | null
          cliente_id?: string | null
          created_at?: string
          descripcion?: string | null
          despacho_id?: string | null
          estatus?: string
          evidencia?: Json | null
          id?: string
          nivel: string
          origen?: string | null
          recomendacion?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          rfc_id?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          accion_sugerida?: string | null
          cliente_id?: string | null
          created_at?: string
          descripcion?: string | null
          despacho_id?: string | null
          estatus?: string
          evidencia?: Json | null
          id?: string
          nivel?: string
          origen?: string | null
          recomendacion?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          rfc_id?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_rfc_id_fkey"
            columns: ["rfc_id"]
            isOneToOne: false
            referencedRelation: "rfcs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          accion: string
          created_at: string
          despacho_id: string | null
          entidad: string | null
          entidad_id: string | null
          id: number
          ip: unknown
          payload: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          despacho_id?: string | null
          entidad?: string | null
          entidad_id?: string | null
          id?: number
          ip?: unknown
          payload?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          despacho_id?: string | null
          entidad?: string | null
          entidad_id?: string | null
          id?: number
          ip?: unknown
          payload?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_ayuda_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_ayuda_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "bot_ayuda_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_ayuda_threads: {
        Row: {
          created_at: string
          id: string
          modo: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          modo?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          modo?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      buzon_notificaciones: {
        Row: {
          asunto: string
          cliente_id: string | null
          created_at: string
          created_by: string | null
          despacho_id: string
          estado: string
          fecha_recibida: string
          folio: string | null
          ia_analisis: Json
          id: string
          origen: string
          pdf_base64: string | null
          pdf_filename: string | null
          plazo_dias: number | null
          resumen: string | null
          updated_at: string
          vence_at: string | null
        }
        Insert: {
          asunto: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          despacho_id: string
          estado?: string
          fecha_recibida?: string
          folio?: string | null
          ia_analisis?: Json
          id?: string
          origen?: string
          pdf_base64?: string | null
          pdf_filename?: string | null
          plazo_dias?: number | null
          resumen?: string | null
          updated_at?: string
          vence_at?: string | null
        }
        Update: {
          asunto?: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          estado?: string
          fecha_recibida?: string
          folio?: string | null
          ia_analisis?: Json
          id?: string
          origen?: string
          pdf_base64?: string | null
          pdf_filename?: string | null
          plazo_dias?: number | null
          resumen?: string | null
          updated_at?: string
          vence_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buzon_notificaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buzon_notificaciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_cuentas: {
        Row: {
          activa: boolean
          actualizada_at: string | null
          actualizada_por: string | null
          cliente_id: string
          codigo: string
          codigo_normalizado: string | null
          codigo_padre: string | null
          created_at: string
          created_by: string | null
          despacho_id: string
          external_id: string | null
          fuente: string
          id: string
          import_hash: string | null
          moneda: string
          naturaleza: string
          nivel: number | null
          nombre: string
          tipo_sat: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          actualizada_at?: string | null
          actualizada_por?: string | null
          cliente_id: string
          codigo: string
          codigo_normalizado?: string | null
          codigo_padre?: string | null
          created_at?: string
          created_by?: string | null
          despacho_id: string
          external_id?: string | null
          fuente?: string
          id?: string
          import_hash?: string | null
          moneda?: string
          naturaleza: string
          nivel?: number | null
          nombre: string
          tipo_sat?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          actualizada_at?: string | null
          actualizada_por?: string | null
          cliente_id?: string
          codigo?: string
          codigo_normalizado?: string | null
          codigo_padre?: string | null
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          external_id?: string | null
          fuente?: string
          id?: string
          import_hash?: string | null
          moneda?: string
          naturaleza?: string
          nivel?: number | null
          nombre?: string
          tipo_sat?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_cuentas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_cuentas_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_importaciones: {
        Row: {
          actor: string | null
          actualizadas: number
          altas: number
          cliente_id: string
          created_at: string
          despacho_id: string
          errores: number
          filas: number
          huella: string
          id: string
          modo: string
          omitidas: number
          reporte: Json
        }
        Insert: {
          actor?: string | null
          actualizadas?: number
          altas?: number
          cliente_id: string
          created_at?: string
          despacho_id: string
          errores?: number
          filas?: number
          huella: string
          id?: string
          modo: string
          omitidas?: number
          reporte?: Json
        }
        Update: {
          actor?: string | null
          actualizadas?: number
          altas?: number
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          errores?: number
          filas?: number
          huella?: string
          id?: string
          modo?: string
          omitidas?: number
          reporte?: Json
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_importaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_importaciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_conceptos: {
        Row: {
          cantidad: number | null
          cfdi_id: string
          clave_prod_serv: string | null
          descripcion: string | null
          descuento: number | null
          id: string
          importe: number | null
          numero: number | null
          valor_unitario: number | null
        }
        Insert: {
          cantidad?: number | null
          cfdi_id: string
          clave_prod_serv?: string | null
          descripcion?: string | null
          descuento?: number | null
          id?: string
          importe?: number | null
          numero?: number | null
          valor_unitario?: number | null
        }
        Update: {
          cantidad?: number | null
          cfdi_id?: string
          clave_prod_serv?: string | null
          descripcion?: string | null
          descuento?: number | null
          id?: string
          importe?: number | null
          numero?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_conceptos_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_decisiones_fiscales: {
        Row: {
          cfdi_id: string
          cliente_id: string
          created_at: string
          decidida_at: string
          decidida_por: string | null
          decision: string
          despacho_id: string
          fundamento: string | null
          historial_id: string | null
          id: string
          input_hash: string | null
          motivo: string | null
          origen: string
          periodo: string
          porcentaje_acreditable_iva: number | null
          porcentaje_deducible: number
          sugerencia_ia: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          cfdi_id: string
          cliente_id: string
          created_at?: string
          decidida_at?: string
          decidida_por?: string | null
          decision: string
          despacho_id: string
          fundamento?: string | null
          historial_id?: string | null
          id?: string
          input_hash?: string | null
          motivo?: string | null
          origen?: string
          periodo: string
          porcentaje_acreditable_iva?: number | null
          porcentaje_deducible?: number
          sugerencia_ia?: Json | null
          updated_at?: string
          version?: number
        }
        Update: {
          cfdi_id?: string
          cliente_id?: string
          created_at?: string
          decidida_at?: string
          decidida_por?: string | null
          decision?: string
          despacho_id?: string
          fundamento?: string | null
          historial_id?: string | null
          id?: string
          input_hash?: string | null
          motivo?: string | null
          origen?: string
          periodo?: string
          porcentaje_acreditable_iva?: number | null
          porcentaje_deducible?: number
          sugerencia_ia?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_decisiones_fiscales_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: true
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_decisiones_fiscales_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_decisiones_fiscales_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_decisiones_historial: {
        Row: {
          cfdi_id: string
          cliente_id: string
          created_at: string
          decidida_at: string
          decidida_por: string | null
          decision: string
          despacho_id: string
          fundamento: string | null
          id: string
          input_hash: string
          motivo: string | null
          origen: string
          periodo: string
          porcentaje_deducible: number
          regla_id: string | null
          regla_version: string | null
          sugerencia_ia: Json | null
          version: number
        }
        Insert: {
          cfdi_id: string
          cliente_id: string
          created_at?: string
          decidida_at?: string
          decidida_por?: string | null
          decision: string
          despacho_id: string
          fundamento?: string | null
          id?: string
          input_hash: string
          motivo?: string | null
          origen?: string
          periodo: string
          porcentaje_deducible?: number
          regla_id?: string | null
          regla_version?: string | null
          sugerencia_ia?: Json | null
          version: number
        }
        Update: {
          cfdi_id?: string
          cliente_id?: string
          created_at?: string
          decidida_at?: string
          decidida_por?: string | null
          decision?: string
          despacho_id?: string
          fundamento?: string | null
          id?: string
          input_hash?: string
          motivo?: string | null
          origen?: string
          periodo?: string
          porcentaje_deducible?: number
          regla_id?: string | null
          regla_version?: string | null
          sugerencia_ia?: Json | null
          version?: number
        }
        Relationships: []
      }
      cfdi_impuestos: {
        Row: {
          base: number | null
          cfdi_id: string
          concepto_numero: number | null
          created_at: string
          id: string
          importe: number | null
          impuesto: string
          impuesto_nombre: string | null
          nivel: string
          tasa_cuota: number | null
          tipo: string
          tipo_factor: string | null
        }
        Insert: {
          base?: number | null
          cfdi_id: string
          concepto_numero?: number | null
          created_at?: string
          id?: string
          importe?: number | null
          impuesto: string
          impuesto_nombre?: string | null
          nivel: string
          tasa_cuota?: number | null
          tipo: string
          tipo_factor?: string | null
        }
        Update: {
          base?: number | null
          cfdi_id?: string
          concepto_numero?: number | null
          created_at?: string
          id?: string
          importe?: number | null
          impuesto?: string
          impuesto_nombre?: string | null
          nivel?: string
          tasa_cuota?: number | null
          tipo?: string
          tipo_factor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_impuestos_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_pago_documentos: {
        Row: {
          cfdi_id: string
          cfdi_padre_id: string | null
          created_at: string
          equivalencia_dr: number | null
          folio: string | null
          id: string
          id_documento: string
          imp_pagado: number | null
          imp_saldo_ant: number | null
          imp_saldo_insoluto: number | null
          moneda_dr: string | null
          num_parcialidad: number | null
          objeto_imp_dr: string | null
          pago_id: string
          serie: string | null
        }
        Insert: {
          cfdi_id: string
          cfdi_padre_id?: string | null
          created_at?: string
          equivalencia_dr?: number | null
          folio?: string | null
          id?: string
          id_documento: string
          imp_pagado?: number | null
          imp_saldo_ant?: number | null
          imp_saldo_insoluto?: number | null
          moneda_dr?: string | null
          num_parcialidad?: number | null
          objeto_imp_dr?: string | null
          pago_id: string
          serie?: string | null
        }
        Update: {
          cfdi_id?: string
          cfdi_padre_id?: string | null
          created_at?: string
          equivalencia_dr?: number | null
          folio?: string | null
          id?: string
          id_documento?: string
          imp_pagado?: number | null
          imp_saldo_ant?: number | null
          imp_saldo_insoluto?: number | null
          moneda_dr?: string | null
          num_parcialidad?: number | null
          objeto_imp_dr?: string | null
          pago_id?: string
          serie?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_pago_documentos_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pago_documentos_cfdi_padre_id_fkey"
            columns: ["cfdi_padre_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pago_documentos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "cfdi_pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_pago_impuestos: {
        Row: {
          ambito: string
          base: number | null
          created_at: string
          documento_id: string | null
          id: string
          importe: number | null
          impuesto: string
          pago_id: string
          tasa_cuota: number | null
          tipo: string
          tipo_factor: string | null
        }
        Insert: {
          ambito: string
          base?: number | null
          created_at?: string
          documento_id?: string | null
          id?: string
          importe?: number | null
          impuesto: string
          pago_id: string
          tasa_cuota?: number | null
          tipo: string
          tipo_factor?: string | null
        }
        Update: {
          ambito?: string
          base?: number | null
          created_at?: string
          documento_id?: string | null
          id?: string
          importe?: number | null
          impuesto?: string
          pago_id?: string
          tasa_cuota?: number | null
          tipo?: string
          tipo_factor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_pago_impuestos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "cfdi_pago_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pago_impuestos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "cfdi_pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_pagos: {
        Row: {
          cfdi_id: string
          cliente_id: string
          created_at: string
          despacho_id: string
          fecha_pago: string | null
          forma_pago_p: string | null
          id: string
          moneda_p: string | null
          monto: number | null
          num_operacion: string | null
          numero_pago: number
          tipo_cambio_p: number | null
          updated_at: string
        }
        Insert: {
          cfdi_id: string
          cliente_id: string
          created_at?: string
          despacho_id: string
          fecha_pago?: string | null
          forma_pago_p?: string | null
          id?: string
          moneda_p?: string | null
          monto?: number | null
          num_operacion?: string | null
          numero_pago: number
          tipo_cambio_p?: number | null
          updated_at?: string
        }
        Update: {
          cfdi_id?: string
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          fecha_pago?: string | null
          forma_pago_p?: string | null
          id?: string
          moneda_p?: string | null
          monto?: number | null
          num_operacion?: string | null
          numero_pago?: number
          tipo_cambio_p?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_pagos_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pagos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pagos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_relaciones: {
        Row: {
          cfdi_id: string
          id: string
          tipo_relacion: string
          uuid_relacionado: string
        }
        Insert: {
          cfdi_id: string
          id?: string
          tipo_relacion: string
          uuid_relacionado: string
        }
        Update: {
          cfdi_id?: string
          id?: string
          tipo_relacion?: string
          uuid_relacionado?: string
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_relaciones_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_sat_evidencias: {
        Row: {
          cfdi_id: string
          cliente_id: string
          created_at: string
          despacho_id: string
          estado_comprobante: string
          estatus_derivado: string
          fuente: string
          id: string
          idempotency_key: string
          observada_at: string
          paquete_id: string
          proveedor: string | null
          run_id: string
          solicitud_id: string
        }
        Insert: {
          cfdi_id: string
          cliente_id: string
          created_at?: string
          despacho_id: string
          estado_comprobante: string
          estatus_derivado: string
          fuente?: string
          id?: string
          idempotency_key: string
          observada_at?: string
          paquete_id: string
          proveedor?: string | null
          run_id: string
          solicitud_id: string
        }
        Update: {
          cfdi_id?: string
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          estado_comprobante?: string
          estatus_derivado?: string
          fuente?: string
          id?: string
          idempotency_key?: string
          observada_at?: string
          paquete_id?: string
          proveedor?: string | null
          run_id?: string
          solicitud_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_sat_evidencias_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_sat_evidencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_sat_evidencias_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_sat_evidencias_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sat_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_xml: {
        Row: {
          archivo_hash: string
          archivo_path: string | null
          clase_documental: string | null
          cliente_id: string
          descuento: number
          despacho_id: string
          detalle_reconstruible: boolean
          direccion: string | null
          estado_procesamiento: string | null
          estado_relacion: string | null
          estatus_sat: string | null
          estatus_sat_check_at: string | null
          estatus_sat_evidencia_at: string | null
          estatus_sat_fuente: string | null
          fecha: string
          fecha_carga: string
          fecha_timbrado: string | null
          forma_pago: string | null
          id: string
          ieps_trasladado: number
          isr_retenido: number
          iva_retenido: number
          iva_trasladado: number
          metodo_pago: string | null
          moneda: string | null
          motivos: Json
          nombre_emisor: string | null
          nombre_receptor: string | null
          normalizacion_version: string | null
          normalizado_at: string | null
          origen: string | null
          original_almacenado_at: string | null
          original_bucket: string | null
          original_bytes: number | null
          original_error: string | null
          original_estado: string
          original_path: string | null
          original_sha256: string | null
          periodo: string | null
          proveedor: string | null
          rfc_emisor: string
          rfc_id: string
          rfc_receptor: string
          sat_paquete_id: string | null
          sat_run_id: string | null
          sat_solicitud_id: string | null
          subtotal: number
          tipo_cambio: number | null
          tipo_cfdi: string
          total: number
          uso_cfdi: string | null
          uuid: string
          validacion: string | null
          version: string
          xml_raw: string | null
        }
        Insert: {
          archivo_hash: string
          archivo_path?: string | null
          clase_documental?: string | null
          cliente_id: string
          descuento?: number
          despacho_id: string
          detalle_reconstruible?: boolean
          direccion?: string | null
          estado_procesamiento?: string | null
          estado_relacion?: string | null
          estatus_sat?: string | null
          estatus_sat_check_at?: string | null
          estatus_sat_evidencia_at?: string | null
          estatus_sat_fuente?: string | null
          fecha: string
          fecha_carga?: string
          fecha_timbrado?: string | null
          forma_pago?: string | null
          id?: string
          ieps_trasladado?: number
          isr_retenido?: number
          iva_retenido?: number
          iva_trasladado?: number
          metodo_pago?: string | null
          moneda?: string | null
          motivos?: Json
          nombre_emisor?: string | null
          nombre_receptor?: string | null
          normalizacion_version?: string | null
          normalizado_at?: string | null
          origen?: string | null
          original_almacenado_at?: string | null
          original_bucket?: string | null
          original_bytes?: number | null
          original_error?: string | null
          original_estado?: string
          original_path?: string | null
          original_sha256?: string | null
          periodo?: string | null
          proveedor?: string | null
          rfc_emisor: string
          rfc_id: string
          rfc_receptor: string
          sat_paquete_id?: string | null
          sat_run_id?: string | null
          sat_solicitud_id?: string | null
          subtotal?: number
          tipo_cambio?: number | null
          tipo_cfdi: string
          total?: number
          uso_cfdi?: string | null
          uuid: string
          validacion?: string | null
          version?: string
          xml_raw?: string | null
        }
        Update: {
          archivo_hash?: string
          archivo_path?: string | null
          clase_documental?: string | null
          cliente_id?: string
          descuento?: number
          despacho_id?: string
          detalle_reconstruible?: boolean
          direccion?: string | null
          estado_procesamiento?: string | null
          estado_relacion?: string | null
          estatus_sat?: string | null
          estatus_sat_check_at?: string | null
          estatus_sat_evidencia_at?: string | null
          estatus_sat_fuente?: string | null
          fecha?: string
          fecha_carga?: string
          fecha_timbrado?: string | null
          forma_pago?: string | null
          id?: string
          ieps_trasladado?: number
          isr_retenido?: number
          iva_retenido?: number
          iva_trasladado?: number
          metodo_pago?: string | null
          moneda?: string | null
          motivos?: Json
          nombre_emisor?: string | null
          nombre_receptor?: string | null
          normalizacion_version?: string | null
          normalizado_at?: string | null
          origen?: string | null
          original_almacenado_at?: string | null
          original_bucket?: string | null
          original_bytes?: number | null
          original_error?: string | null
          original_estado?: string
          original_path?: string | null
          original_sha256?: string | null
          periodo?: string | null
          proveedor?: string | null
          rfc_emisor?: string
          rfc_id?: string
          rfc_receptor?: string
          sat_paquete_id?: string | null
          sat_run_id?: string | null
          sat_solicitud_id?: string | null
          subtotal?: number
          tipo_cambio?: number | null
          tipo_cfdi?: string
          total?: number
          uso_cfdi?: string | null
          uuid?: string
          validacion?: string | null
          version?: string
          xml_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_xml_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_xml_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_xml_rfc_id_fkey"
            columns: ["rfc_id"]
            isOneToOne: false
            referencedRelation: "rfcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_xml_sat_run_id_fkey"
            columns: ["sat_run_id"]
            isOneToOne: false
            referencedRelation: "sat_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_config_bancos: {
        Row: {
          actualizado_por: string | null
          cliente_id: string
          created_at: string
          despacho_id: string
          motivo: string | null
          tolerancia_centavos: number
          updated_at: string
        }
        Insert: {
          actualizado_por?: string | null
          cliente_id: string
          created_at?: string
          despacho_id: string
          motivo?: string | null
          tolerancia_centavos?: number
          updated_at?: string
        }
        Update: {
          actualizado_por?: string | null
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          motivo?: string | null
          tolerancia_centavos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cierre_config_bancos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_config_bancos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_etapas: {
        Row: {
          aprobada_at: string | null
          aprobada_por: string | null
          cliente_id: string
          cobertura: number | null
          created_at: string
          criterios_cumplidos: Json
          criterios_pendientes: Json
          despacho_id: string
          estado: string
          etapa: string
          evaluador_version: string | null
          id: string
          idempotency_key: string | null
          iniciada_at: string | null
          input_hash: string | null
          lista_at: string | null
          motivo: string | null
          periodo: string
          resultado: Json
          updated_at: string
          version: number
        }
        Insert: {
          aprobada_at?: string | null
          aprobada_por?: string | null
          cliente_id: string
          cobertura?: number | null
          created_at?: string
          criterios_cumplidos?: Json
          criterios_pendientes?: Json
          despacho_id: string
          estado?: string
          etapa: string
          evaluador_version?: string | null
          id?: string
          idempotency_key?: string | null
          iniciada_at?: string | null
          input_hash?: string | null
          lista_at?: string | null
          motivo?: string | null
          periodo: string
          resultado?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          aprobada_at?: string | null
          aprobada_por?: string | null
          cliente_id?: string
          cobertura?: number | null
          created_at?: string
          criterios_cumplidos?: Json
          criterios_pendientes?: Json
          despacho_id?: string
          estado?: string
          etapa?: string
          evaluador_version?: string | null
          id?: string
          idempotency_key?: string | null
          iniciada_at?: string | null
          input_hash?: string | null
          lista_at?: string | null
          motivo?: string | null
          periodo?: string
          resultado?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cierre_etapas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_etapas_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_eventos: {
        Row: {
          actor_user_id: string | null
          cliente_id: string
          created_at: string
          despacho_id: string
          estado_anterior: string | null
          estado_nuevo: string | null
          etapa: string
          evento: string
          fuente: string | null
          id: string
          idempotency_key: string | null
          input_hash: string | null
          motivo: string | null
          periodo: string
          proceso: string | null
          referencia_id: string | null
          referencia_tipo: string | null
          version: number | null
        }
        Insert: {
          actor_user_id?: string | null
          cliente_id: string
          created_at?: string
          despacho_id: string
          estado_anterior?: string | null
          estado_nuevo?: string | null
          etapa: string
          evento: string
          fuente?: string | null
          id?: string
          idempotency_key?: string | null
          input_hash?: string | null
          motivo?: string | null
          periodo: string
          proceso?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          version?: number | null
        }
        Update: {
          actor_user_id?: string | null
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          estado_anterior?: string | null
          estado_nuevo?: string | null
          etapa?: string
          evento?: string
          fuente?: string | null
          id?: string
          idempotency_key?: string | null
          input_hash?: string | null
          motivo?: string | null
          periodo?: string
          proceso?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cierre_eventos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_eventos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_excepcion_bitacora: {
        Row: {
          accion: string
          created_at: string
          excepcion_id: string
          id: string
          motivo: string | null
          user_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          excepcion_id: string
          id?: string
          motivo?: string | null
          user_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          excepcion_id?: string
          id?: string
          motivo?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cierre_excepcion_bitacora_excepcion_id_fkey"
            columns: ["excepcion_id"]
            isOneToOne: false
            referencedRelation: "cierre_excepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_excepciones: {
        Row: {
          cerrada_motivo: string | null
          cfdi_id: string | null
          cliente_id: string
          codigo: string
          created_at: string
          despacho_id: string
          detalle: Json
          estado: string
          excepcion_previa_id: string | null
          id: string
          motivo: string | null
          ocurrencia: number
          periodo: string
          reactivada_at: string | null
          resuelta_at: string | null
          resuelta_por: string | null
          severidad: string
          tarea_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          cerrada_motivo?: string | null
          cfdi_id?: string | null
          cliente_id: string
          codigo: string
          created_at?: string
          despacho_id: string
          detalle?: Json
          estado?: string
          excepcion_previa_id?: string | null
          id?: string
          motivo?: string | null
          ocurrencia?: number
          periodo: string
          reactivada_at?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          severidad?: string
          tarea_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          cerrada_motivo?: string | null
          cfdi_id?: string | null
          cliente_id?: string
          codigo?: string
          created_at?: string
          despacho_id?: string
          detalle?: Json
          estado?: string
          excepcion_previa_id?: string | null
          id?: string
          motivo?: string | null
          ocurrencia?: number
          periodo?: string
          reactivada_at?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          severidad?: string
          tarea_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cierre_excepciones_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_excepciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_excepciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_excepciones_excepcion_previa_id_fkey"
            columns: ["excepcion_previa_id"]
            isOneToOne: false
            referencedRelation: "cierre_excepciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_excepciones_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_periodos: {
        Row: {
          cliente_id: string
          corte_at: string | null
          created_at: string
          declarada_at: string | null
          declarada_por: string | null
          despacho_id: string
          direcciones: Json
          etapa_documental: string
          id: string
          notas: string | null
          periodo: string
          ultima_revision_at: string | null
          updated_at: string
        }
        Insert: {
          cliente_id: string
          corte_at?: string | null
          created_at?: string
          declarada_at?: string | null
          declarada_por?: string | null
          despacho_id: string
          direcciones?: Json
          etapa_documental?: string
          id?: string
          notas?: string | null
          periodo: string
          ultima_revision_at?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          corte_at?: string | null
          created_at?: string
          declarada_at?: string | null
          declarada_por?: string | null
          despacho_id?: string
          direcciones?: Json
          etapa_documental?: string
          id?: string
          notas?: string | null
          periodo?: string
          ultima_revision_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cierre_periodos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_periodos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_reaperturas: {
        Row: {
          cfdi_id: string | null
          cfdi_uuid: string | null
          cliente_id: string
          created_at: string
          declarada_at_anterior: string | null
          declarada_por_anterior: string | null
          despacho_id: string
          estado_anterior: string | null
          id: string
          idempotency_key: string
          origen_ingesta: string | null
          periodo: string
          proceso: string | null
          proveedor: string | null
          reabierta_at: string
          responsable: string | null
          sat_paquete_id: string | null
          sat_run_id: string | null
          sat_solicitud_id: string | null
        }
        Insert: {
          cfdi_id?: string | null
          cfdi_uuid?: string | null
          cliente_id: string
          created_at?: string
          declarada_at_anterior?: string | null
          declarada_por_anterior?: string | null
          despacho_id: string
          estado_anterior?: string | null
          id?: string
          idempotency_key: string
          origen_ingesta?: string | null
          periodo: string
          proceso?: string | null
          proveedor?: string | null
          reabierta_at?: string
          responsable?: string | null
          sat_paquete_id?: string | null
          sat_run_id?: string | null
          sat_solicitud_id?: string | null
        }
        Update: {
          cfdi_id?: string | null
          cfdi_uuid?: string | null
          cliente_id?: string
          created_at?: string
          declarada_at_anterior?: string | null
          declarada_por_anterior?: string | null
          despacho_id?: string
          estado_anterior?: string | null
          id?: string
          idempotency_key?: string
          origen_ingesta?: string | null
          periodo?: string
          proceso?: string | null
          proveedor?: string | null
          reabierta_at?: string
          responsable?: string | null
          sat_paquete_id?: string | null
          sat_run_id?: string | null
          sat_solicitud_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cierre_reaperturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_reaperturas_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_resultado_fiscal: {
        Row: {
          calculado_por: string | null
          cliente_id: string
          created_at: string
          despacho_id: string
          entradas: Json
          escritor: string
          fuentes: Json
          fundamentos: Json
          id: string
          input_hash: string
          motor_version: string
          normativa: Json
          normativa_sha256: string
          obsoleto_at: string | null
          obsoleto_motivo: string | null
          periodo: string
          regimen: string
          resultado: Json
          solicitado_en: string
          solicitado_por: string | null
          vigente: boolean
        }
        Insert: {
          calculado_por?: string | null
          cliente_id: string
          created_at?: string
          despacho_id: string
          entradas?: Json
          escritor?: string
          fuentes?: Json
          fundamentos?: Json
          id?: string
          input_hash: string
          motor_version: string
          normativa?: Json
          normativa_sha256: string
          obsoleto_at?: string | null
          obsoleto_motivo?: string | null
          periodo: string
          regimen: string
          resultado?: Json
          solicitado_en?: string
          solicitado_por?: string | null
          vigente?: boolean
        }
        Update: {
          calculado_por?: string | null
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          entradas?: Json
          escritor?: string
          fuentes?: Json
          fundamentos?: Json
          id?: string
          input_hash?: string
          motor_version?: string
          normativa?: Json
          normativa_sha256?: string
          obsoleto_at?: string | null
          obsoleto_motivo?: string | null
          periodo?: string
          regimen?: string
          resultado?: Json
          solicitado_en?: string
          solicitado_por?: string | null
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cierre_resultado_fiscal_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_resultado_fiscal_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cierre_snapshots: {
        Row: {
          bloqueos: Json | null
          cliente_id: string
          created_at: string
          despacho_id: string
          etapas: Json
          evaluador_version: string | null
          huella: string
          id: string
          manifiesto: Json | null
          motivo: string
          periodo: string
          resumen: Json
          sellado_por: string | null
          version: number
        }
        Insert: {
          bloqueos?: Json | null
          cliente_id: string
          created_at?: string
          despacho_id: string
          etapas?: Json
          evaluador_version?: string | null
          huella: string
          id?: string
          manifiesto?: Json | null
          motivo: string
          periodo: string
          resumen?: Json
          sellado_por?: string | null
          version?: number
        }
        Update: {
          bloqueos?: Json | null
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          etapas?: Json
          evaluador_version?: string | null
          huella?: string
          id?: string
          manifiesto?: Json | null
          motivo?: string
          periodo?: string
          resumen?: Json
          sellado_por?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cierre_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_snapshots_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_asignaciones: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          despacho_id: string
          id: string
          user_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          despacho_id: string
          id?: string
          user_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_asignaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_asignaciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_portal_config: {
        Row: {
          cliente_id: string
          created_at: string
          despacho_id: string
          puede_subir_docs: boolean
          updated_at: string
          ver_cfdi: boolean
          ver_cxc: boolean
          ver_cxp: boolean
          ver_dashboard: boolean
          ver_impuestos: boolean
          ver_mensajes: boolean
          ver_obligaciones: boolean
          ver_reportes: boolean
          ver_salud_fiscal: boolean
        }
        Insert: {
          cliente_id: string
          created_at?: string
          despacho_id: string
          puede_subir_docs?: boolean
          updated_at?: string
          ver_cfdi?: boolean
          ver_cxc?: boolean
          ver_cxp?: boolean
          ver_dashboard?: boolean
          ver_impuestos?: boolean
          ver_mensajes?: boolean
          ver_obligaciones?: boolean
          ver_reportes?: boolean
          ver_salud_fiscal?: boolean
        }
        Update: {
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          puede_subir_docs?: boolean
          updated_at?: string
          ver_cfdi?: boolean
          ver_cxc?: boolean
          ver_cxp?: boolean
          ver_dashboard?: boolean
          ver_impuestos?: boolean
          ver_mensajes?: boolean
          ver_obligaciones?: boolean
          ver_reportes?: boolean
          ver_salud_fiscal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cliente_portal_config_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_portal_config_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          alert_channels_default: string[]
          alert_days_default: number
          cliente_padre_id: string | null
          codigo_postal: string | null
          created_at: string
          csf_ultima_emision: string | null
          curp: string | null
          despacho_id: string | null
          domicilio_fiscal: string | null
          email: string | null
          es_demo: boolean
          estado_mes: string | null
          id: string
          notas: string | null
          obligaciones: number
          razon_social: string
          regimen_fiscal: string | null
          rfc: string
          semaforo: string
          telefono: string | null
          tipo_persona: string | null
          tipo_relacion: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_channels_default?: string[]
          alert_days_default?: number
          cliente_padre_id?: string | null
          codigo_postal?: string | null
          created_at?: string
          csf_ultima_emision?: string | null
          curp?: string | null
          despacho_id?: string | null
          domicilio_fiscal?: string | null
          email?: string | null
          es_demo?: boolean
          estado_mes?: string | null
          id?: string
          notas?: string | null
          obligaciones?: number
          razon_social: string
          regimen_fiscal?: string | null
          rfc: string
          semaforo?: string
          telefono?: string | null
          tipo_persona?: string | null
          tipo_relacion?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_channels_default?: string[]
          alert_days_default?: number
          cliente_padre_id?: string | null
          codigo_postal?: string | null
          created_at?: string
          csf_ultima_emision?: string | null
          curp?: string | null
          despacho_id?: string | null
          domicilio_fiscal?: string | null
          email?: string | null
          es_demo?: boolean
          estado_mes?: string | null
          id?: string
          notas?: string | null
          obligaciones?: number
          razon_social?: string
          regimen_fiscal?: string | null
          rfc?: string
          semaforo?: string
          telefono?: string | null
          tipo_persona?: string | null
          tipo_relacion?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_cliente_padre_id_fkey"
            columns: ["cliente_padre_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_bitacora: {
        Row: {
          accion: string
          actor: string | null
          cliente_id: string
          created_at: string
          despacho_id: string
          detalle: Json
          estado_anterior: string | null
          estado_nuevo: string | null
          grupo_id: string | null
          id: string
          motivo: string | null
          movimiento_id: string | null
          periodo: string
        }
        Insert: {
          accion: string
          actor?: string | null
          cliente_id: string
          created_at?: string
          despacho_id: string
          detalle?: Json
          estado_anterior?: string | null
          estado_nuevo?: string | null
          grupo_id?: string | null
          id?: string
          motivo?: string | null
          movimiento_id?: string | null
          periodo: string
        }
        Update: {
          accion?: string
          actor?: string | null
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          detalle?: Json
          estado_anterior?: string | null
          estado_nuevo?: string | null
          grupo_id?: string | null
          id?: string
          motivo?: string | null
          movimiento_id?: string | null
          periodo?: string
        }
        Relationships: []
      }
      conciliacion_corridas: {
        Row: {
          actor: string | null
          algoritmo_version: string
          cliente_id: string
          despacho_id: string
          error: string | null
          estado: string
          fin_at: string | null
          id: string
          idempotency_key: string
          inicio_at: string
          input_hash: string
          metricas: Json
          parametros: Json
          periodo: string
        }
        Insert: {
          actor?: string | null
          algoritmo_version: string
          cliente_id: string
          despacho_id: string
          error?: string | null
          estado?: string
          fin_at?: string | null
          id?: string
          idempotency_key: string
          inicio_at?: string
          input_hash: string
          metricas?: Json
          parametros?: Json
          periodo: string
        }
        Update: {
          actor?: string | null
          algoritmo_version?: string
          cliente_id?: string
          despacho_id?: string
          error?: string | null
          estado?: string
          fin_at?: string | null
          id?: string
          idempotency_key?: string
          inicio_at?: string
          input_hash?: string
          metricas?: Json
          parametros?: Json
          periodo?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_corridas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_grupos: {
        Row: {
          cliente_id: string
          confirmado_at: string | null
          confirmado_por: string | null
          corrida_id: string | null
          created_at: string
          despacho_id: string
          diferencia_centavos: number
          estado: string
          evidencia: Json
          id: string
          idempotency_key: string | null
          importe_banco_centavos: number
          importe_cfdi_centavos: number
          motivo: string | null
          nivel_propuesta: string
          origen: string
          periodo: string
          probabilidad_bp: number
          rechazado_at: string | null
          rechazado_por: string | null
          regla: string | null
          tipo: string
          updated_at: string
          version: string
        }
        Insert: {
          cliente_id: string
          confirmado_at?: string | null
          confirmado_por?: string | null
          corrida_id?: string | null
          created_at?: string
          despacho_id: string
          diferencia_centavos?: number
          estado?: string
          evidencia?: Json
          id?: string
          idempotency_key?: string | null
          importe_banco_centavos?: number
          importe_cfdi_centavos?: number
          motivo?: string | null
          nivel_propuesta?: string
          origen: string
          periodo: string
          probabilidad_bp?: number
          rechazado_at?: string | null
          rechazado_por?: string | null
          regla?: string | null
          tipo?: string
          updated_at?: string
          version?: string
        }
        Update: {
          cliente_id?: string
          confirmado_at?: string | null
          confirmado_por?: string | null
          corrida_id?: string | null
          created_at?: string
          despacho_id?: string
          diferencia_centavos?: number
          estado?: string
          evidencia?: Json
          id?: string
          idempotency_key?: string | null
          importe_banco_centavos?: number
          importe_cfdi_centavos?: number
          motivo?: string | null
          nivel_propuesta?: string
          origen?: string
          periodo?: string
          probabilidad_bp?: number
          rechazado_at?: string | null
          rechazado_por?: string | null
          regla?: string | null
          tipo?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_grupos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_grupos_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: false
            referencedRelation: "conciliacion_corridas"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_importaciones: {
        Row: {
          actor: string | null
          archivo_bytes: number
          archivo_nombre: string
          archivo_sha256: string
          candidatos_duplicado: number
          cliente_id: string
          created_at: string
          cuenta_id: string
          despacho_id: string
          error: string | null
          estado: string
          filas_insertadas: number
          filas_reimportadas: number
          filas_totales: number
          formato: string
          id: string
          periodo_detectado: string | null
        }
        Insert: {
          actor?: string | null
          archivo_bytes?: number
          archivo_nombre: string
          archivo_sha256: string
          candidatos_duplicado?: number
          cliente_id: string
          created_at?: string
          cuenta_id: string
          despacho_id: string
          error?: string | null
          estado?: string
          filas_insertadas?: number
          filas_reimportadas?: number
          filas_totales?: number
          formato?: string
          id?: string
          periodo_detectado?: string | null
        }
        Update: {
          actor?: string | null
          archivo_bytes?: number
          archivo_nombre?: string
          archivo_sha256?: string
          candidatos_duplicado?: number
          cliente_id?: string
          created_at?: string
          cuenta_id?: string
          despacho_id?: string
          error?: string | null
          estado?: string
          filas_insertadas?: number
          filas_reimportadas?: number
          filas_totales?: number
          formato?: string
          id?: string
          periodo_detectado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_importaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_importaciones_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_incidencias: {
        Row: {
          cfdi_id: string | null
          cliente_id: string
          created_at: string
          despacho_id: string
          detalle: Json
          estatus: string
          explicacion_ia: string | null
          fecha: string | null
          gravedad: string
          id: string
          impacto_isr: number
          impacto_iva: number
          monto: number
          movimiento_id: string | null
          poliza_id: string | null
          recomendacion: string | null
          ref_hash: string
          resuelta_at: string | null
          resuelta_por: string | null
          run_id: string | null
          tarea_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cfdi_id?: string | null
          cliente_id: string
          created_at?: string
          despacho_id: string
          detalle?: Json
          estatus?: string
          explicacion_ia?: string | null
          fecha?: string | null
          gravedad?: string
          id?: string
          impacto_isr?: number
          impacto_iva?: number
          monto?: number
          movimiento_id?: string | null
          poliza_id?: string | null
          recomendacion?: string | null
          ref_hash: string
          resuelta_at?: string | null
          resuelta_por?: string | null
          run_id?: string | null
          tarea_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          cfdi_id?: string | null
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          detalle?: Json
          estatus?: string
          explicacion_ia?: string | null
          fecha?: string | null
          gravedad?: string
          id?: string
          impacto_isr?: number
          impacto_iva?: number
          monto?: number
          movimiento_id?: string | null
          poliza_id?: string | null
          recomendacion?: string | null
          ref_hash?: string
          resuelta_at?: string | null
          resuelta_por?: string | null
          run_id?: string | null
          tarea_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_incidencias_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_incidencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_incidencias_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_incidencias_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_incidencias_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_incidencias_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "conciliacion_integral_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_incidencias_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_integral_runs: {
        Row: {
          bajas: number
          cliente_id: string
          created_at: string
          created_by: string | null
          criticas: number
          desde: string
          despacho_id: string
          hasta: string
          id: string
          kpis: Json
          medias: number
          monto_observado: number
          score_consistencia: number
          total_incidencias: number
          trigger_origen: string
        }
        Insert: {
          bajas?: number
          cliente_id: string
          created_at?: string
          created_by?: string | null
          criticas?: number
          desde: string
          despacho_id: string
          hasta: string
          id?: string
          kpis?: Json
          medias?: number
          monto_observado?: number
          score_consistencia?: number
          total_incidencias?: number
          trigger_origen?: string
        }
        Update: {
          bajas?: number
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          criticas?: number
          desde?: string
          despacho_id?: string
          hasta?: string
          id?: string
          kpis?: Json
          medias?: number
          monto_observado?: number
          score_consistencia?: number
          total_incidencias?: number
          trigger_origen?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_integral_runs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_integral_runs_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_respaldo_bloque1: {
        Row: {
          etiqueta: string
          fila_id: string
          id: string
          snapshot: Json
          tabla: string
          tomado_at: string
        }
        Insert: {
          etiqueta: string
          fila_id: string
          id?: string
          snapshot: Json
          tabla: string
          tomado_at?: string
        }
        Update: {
          etiqueta?: string
          fila_id?: string
          id?: string
          snapshot?: Json
          tabla?: string
          tomado_at?: string
        }
        Relationships: []
      }
      conciliacion_score_historico: {
        Row: {
          bajas: number
          cliente_id: string
          created_at: string
          criticas: number
          despacho_id: string
          id: string
          medias: number
          monto_observado: number
          run_id: string | null
          score: number
        }
        Insert: {
          bajas?: number
          cliente_id: string
          created_at?: string
          criticas?: number
          despacho_id: string
          id?: string
          medias?: number
          monto_observado?: number
          run_id?: string | null
          score: number
        }
        Update: {
          bajas?: number
          cliente_id?: string
          created_at?: string
          criticas?: number
          despacho_id?: string
          id?: string
          medias?: number
          monto_observado?: number
          run_id?: string | null
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_score_historico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_score_historico_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_score_historico_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "conciliacion_integral_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliaciones: {
        Row: {
          asignado_centavos: number
          cfdi_id: string | null
          cliente_id: string
          confirmado_at: string | null
          confirmado_por: string | null
          corrida_id: string | null
          created_at: string
          despacho_id: string
          diferencia: number | null
          estado_grupo: string | null
          estatus: string
          grupo_id: string | null
          id: string
          motivo: string | null
          movimiento_id: string | null
          periodo: string | null
          probabilidad: number | null
          rechazado_at: string | null
          rechazado_por: string | null
          tipo_match: string
        }
        Insert: {
          asignado_centavos?: number
          cfdi_id?: string | null
          cliente_id: string
          confirmado_at?: string | null
          confirmado_por?: string | null
          corrida_id?: string | null
          created_at?: string
          despacho_id: string
          diferencia?: number | null
          estado_grupo?: string | null
          estatus?: string
          grupo_id?: string | null
          id?: string
          motivo?: string | null
          movimiento_id?: string | null
          periodo?: string | null
          probabilidad?: number | null
          rechazado_at?: string | null
          rechazado_por?: string | null
          tipo_match: string
        }
        Update: {
          asignado_centavos?: number
          cfdi_id?: string | null
          cliente_id?: string
          confirmado_at?: string | null
          confirmado_por?: string | null
          corrida_id?: string | null
          created_at?: string
          despacho_id?: string
          diferencia?: number | null
          estado_grupo?: string | null
          estatus?: string
          grupo_id?: string | null
          id?: string
          motivo?: string | null
          movimiento_id?: string | null
          periodo?: string | null
          probabilidad?: number | null
          rechazado_at?: string | null
          rechazado_por?: string | null
          tipo_match?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: false
            referencedRelation: "conciliacion_corridas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "conciliacion_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios"
            referencedColumns: ["id"]
          },
        ]
      }
      configuraciones: {
        Row: {
          clave: string
          despacho_id: string
          id: string
          updated_at: string
          valor: Json
        }
        Insert: {
          clave: string
          despacho_id: string
          id?: string
          updated_at?: string
          valor: Json
        }
        Update: {
          clave?: string
          despacho_id?: string
          id?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "configuraciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      conti_feedback: {
        Row: {
          comentario: string | null
          created_at: string
          id: string
          modo: string
          motivo: string | null
          respuesta: string | null
          thread_id: string | null
          user_id: string
          util: boolean
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          id?: string
          modo: string
          motivo?: string | null
          respuesta?: string | null
          thread_id?: string | null
          user_id: string
          util: boolean
        }
        Update: {
          comentario?: string | null
          created_at?: string
          id?: string
          modo?: string
          motivo?: string | null
          respuesta?: string | null
          thread_id?: string | null
          user_id?: string
          util?: boolean
        }
        Relationships: []
      }
      conti_telemetria: {
        Row: {
          con_expediente: boolean
          created_at: string
          derivo_calculo: boolean
          despacho_id: string | null
          evidencia: string
          id: string
          latencia_ms: number | null
          modelo: string | null
          modo: string
          saneada: boolean
          thread_id: string | null
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          con_expediente?: boolean
          created_at?: string
          derivo_calculo?: boolean
          despacho_id?: string | null
          evidencia: string
          id?: string
          latencia_ms?: number | null
          modelo?: string | null
          modo: string
          saneada?: boolean
          thread_id?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          con_expediente?: boolean
          created_at?: string
          derivo_calculo?: boolean
          despacho_id?: string | null
          evidencia?: string
          id?: string
          latencia_ms?: number | null
          modelo?: string | null
          modo?: string
          saneada?: boolean
          thread_id?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: []
      }
      cron_secretos: {
        Row: {
          created_at: string
          nombre: string
          updated_at: string
          valor: string
        }
        Insert: {
          created_at?: string
          nombre: string
          updated_at?: string
          valor: string
        }
        Update: {
          created_at?: string
          nombre?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      cuentas_bancarias: {
        Row: {
          alias: string | null
          banco: string
          cliente_id: string
          created_at: string
          despacho_id: string
          id: string
          moneda: string
          numero_cuenta_mask: string | null
        }
        Insert: {
          alias?: string | null
          banco: string
          cliente_id: string
          created_at?: string
          despacho_id: string
          id?: string
          moneda?: string
          numero_cuenta_mask?: string | null
        }
        Update: {
          alias?: string | null
          banco?: string
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          id?: string
          moneda?: string
          numero_cuenta_mask?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_bancarias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cumplimiento_items: {
        Row: {
          area: string
          cliente_id: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          despacho_id: string
          estado: string
          evidencia_url: string | null
          frecuencia: string
          id: string
          item: string
          notas: string | null
          proximo_vencimiento: string | null
          responsable: string | null
          ultimo_cumplido: string | null
          updated_at: string
        }
        Insert: {
          area: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          despacho_id: string
          estado?: string
          evidencia_url?: string | null
          frecuencia: string
          id?: string
          item: string
          notas?: string | null
          proximo_vencimiento?: string | null
          responsable?: string | null
          ultimo_cumplido?: string | null
          updated_at?: string
        }
        Update: {
          area?: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          despacho_id?: string
          estado?: string
          evidencia_url?: string | null
          frecuencia?: string
          id?: string
          item?: string
          notas?: string | null
          proximo_vencimiento?: string | null
          responsable?: string | null
          ultimo_cumplido?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cumplimiento_items_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cumplimiento_items_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cupon_redenciones: {
        Row: {
          billing_cycle: string
          created_at: string
          cupon_id: string
          descuento: number
          despacho_id: string
          id: string
          mp_subscription_id: string | null
          plan_id: string
          subtotal_original: number
          total_final: number
          user_id: string
        }
        Insert: {
          billing_cycle: string
          created_at?: string
          cupon_id: string
          descuento: number
          despacho_id: string
          id?: string
          mp_subscription_id?: string | null
          plan_id: string
          subtotal_original: number
          total_final: number
          user_id: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          cupon_id?: string
          descuento?: number
          despacho_id?: string
          id?: string
          mp_subscription_id?: string | null
          plan_id?: string
          subtotal_original?: number
          total_final?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cupon_redenciones_cupon_id_fkey"
            columns: ["cupon_id"]
            isOneToOne: false
            referencedRelation: "cupones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupon_redenciones_mp_subscription_id_fkey"
            columns: ["mp_subscription_id"]
            isOneToOne: false
            referencedRelation: "mp_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cupones: {
        Row: {
          activo: boolean
          ciclos_permitidos: string[] | null
          codigo: string
          created_at: string
          created_by: string | null
          descripcion: string | null
          id: string
          max_usos: number | null
          planes_permitidos: string[] | null
          porcentaje: number
          updated_at: string
          usos_actuales: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean
          ciclos_permitidos?: string[] | null
          codigo: string
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          id?: string
          max_usos?: number | null
          planes_permitidos?: string[] | null
          porcentaje: number
          updated_at?: string
          usos_actuales?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean
          ciclos_permitidos?: string[] | null
          codigo?: string
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          id?: string
          max_usos?: number | null
          planes_permitidos?: string[] | null
          porcentaje?: number
          updated_at?: string
          usos_actuales?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      cxc: {
        Row: {
          cliente_id: string | null
          concepto: string | null
          contraparte: string
          created_at: string
          created_by: string | null
          despacho_id: string
          estado: string
          fecha_emision: string
          fecha_vencimiento: string
          id: string
          moneda: string
          monto: number
          notas: string | null
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          concepto?: string | null
          contraparte: string
          created_at?: string
          created_by?: string | null
          despacho_id: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento: string
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          concepto?: string | null
          contraparte?: string
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cxc_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxc_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      cxp: {
        Row: {
          cliente_id: string | null
          concepto: string | null
          contraparte: string
          created_at: string
          created_by: string | null
          despacho_id: string
          estado: string
          fecha_emision: string
          fecha_vencimiento: string
          id: string
          moneda: string
          monto: number
          notas: string | null
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          concepto?: string | null
          contraparte: string
          created_at?: string
          created_by?: string | null
          despacho_id: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento: string
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          concepto?: string | null
          contraparte?: string
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cxp_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxp_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      defensas: {
        Row: {
          cliente_id: string
          conflicto: string | null
          created_at: string
          despacho_id: string
          estatus: string
          estrategia: string | null
          exito: number | null
          id: string
          nombre: string
          notas: string | null
          potencial: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cliente_id: string
          conflicto?: string | null
          created_at?: string
          despacho_id: string
          estatus?: string
          estrategia?: string | null
          exito?: number | null
          id?: string
          nombre: string
          notas?: string | null
          potencial?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cliente_id?: string
          conflicto?: string | null
          created_at?: string
          despacho_id?: string
          estatus?: string
          estrategia?: string | null
          exito?: number | null
          id?: string
          nombre?: string
          notas?: string | null
          potencial?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "defensas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defensas_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      despacho_google_tokens: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          connected_by: string | null
          created_at: string
          despacho_id: string
          expires_at: string | null
          google_email: string
          last_sync_at: string | null
          refresh_token: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          connected_by?: string | null
          created_at?: string
          despacho_id: string
          expires_at?: string | null
          google_email: string
          last_sync_at?: string | null
          refresh_token: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          connected_by?: string | null
          created_at?: string
          despacho_id?: string
          expires_at?: string | null
          google_email?: string
          last_sync_at?: string | null
          refresh_token?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "despacho_google_tokens_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: true
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      despachos: {
        Row: {
          acceso_restringido: boolean
          created_at: string
          es_sandbox: boolean
          estado: string
          id: string
          limites_override: Json | null
          nombre: string
          owner_user_id: string
          plan_id: string | null
          rfc_despacho: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          acceso_restringido?: boolean
          created_at?: string
          es_sandbox?: boolean
          estado?: string
          id?: string
          limites_override?: Json | null
          nombre: string
          owner_user_id: string
          plan_id?: string | null
          rfc_despacho?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          acceso_restringido?: boolean
          created_at?: string
          es_sandbox?: boolean
          estado?: string
          id?: string
          limites_override?: Json | null
          nombre?: string
          owner_user_id?: string
          plan_id?: string | null
          rfc_despacho?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "despachos_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entitlement_excepciones: {
        Row: {
          creado_por: string
          created_at: string
          despacho_id: string
          expira_at: string
          id: string
          motivo: string
          revocada_at: string | null
          revocada_por: string | null
          tipo: string
          updated_at: string
          valor_num: number | null
          valor_texto: string | null
        }
        Insert: {
          creado_por: string
          created_at?: string
          despacho_id: string
          expira_at: string
          id?: string
          motivo: string
          revocada_at?: string | null
          revocada_por?: string | null
          tipo: string
          updated_at?: string
          valor_num?: number | null
          valor_texto?: string | null
        }
        Update: {
          creado_por?: string
          created_at?: string
          despacho_id?: string
          expira_at?: string
          id?: string
          motivo?: string
          revocada_at?: string | null
          revocada_por?: string | null
          tipo?: string
          updated_at?: string
          valor_num?: number | null
          valor_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_excepciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_event_map: {
        Row: {
          despacho_id: string
          google_event_id: string
          id: string
          last_pushed_at: string
          obligacion_id: string
        }
        Insert: {
          despacho_id: string
          google_event_id: string
          id?: string
          last_pushed_at?: string
          obligacion_id: string
        }
        Update: {
          despacho_id?: string
          google_event_id?: string
          id?: string
          last_pushed_at?: string
          obligacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_event_map_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_event_map_obligacion_id_fkey"
            columns: ["obligacion_id"]
            isOneToOne: false
            referencedRelation: "obligaciones_fiscales"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_states: {
        Row: {
          created_at: string
          despacho_id: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          despacho_id: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          despacho_id?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_states_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_historial: {
        Row: {
          cliente_id: string | null
          costo_usd: number | null
          created_at: string
          despacho_id: string
          id: string
          modelo: string
          prompt: Json | null
          respuesta: Json | null
          rfc_id: string | null
          tokens_in: number | null
          tokens_out: number | null
          tool_key: string
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          costo_usd?: number | null
          created_at?: string
          despacho_id: string
          id?: string
          modelo: string
          prompt?: Json | null
          respuesta?: Json | null
          rfc_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          tool_key: string
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          costo_usd?: number | null
          created_at?: string
          despacho_id?: string
          id?: string
          modelo?: string
          prompt?: Json | null
          respuesta?: Json | null
          rfc_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          tool_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_historial_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_historial_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_historial_rfc_id_fkey"
            columns: ["rfc_id"]
            isOneToOne: false
            referencedRelation: "rfcs"
            referencedColumns: ["id"]
          },
        ]
      }
      invitaciones: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string
          despacho_id: string
          email: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by: string
          despacho_id: string
          email?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string
          despacho_id?: string
          email?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      ley_articulos: {
        Row: {
          created_at: string
          derogado: boolean
          fraccion: string | null
          id: string
          ley_id: string
          numero: string
          orden: number
          texto: string
          titulo: string | null
          updated_at: string
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          derogado?: boolean
          fraccion?: string | null
          id?: string
          ley_id: string
          numero: string
          orden?: number
          texto: string
          titulo?: string | null
          updated_at?: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          derogado?: boolean
          fraccion?: string | null
          id?: string
          ley_id?: string
          numero?: string
          orden?: number
          texto?: string
          titulo?: string | null
          updated_at?: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ley_articulos_ley_id_fkey"
            columns: ["ley_id"]
            isOneToOne: false
            referencedRelation: "leyes"
            referencedColumns: ["id"]
          },
        ]
      }
      ley_embeddings: {
        Row: {
          articulo_id: string
          chunk_index: number
          chunk_text: string
          created_at: string
          embedding: string
          id: string
          ley_id: string
          model: string
          tokens: number | null
        }
        Insert: {
          articulo_id: string
          chunk_index?: number
          chunk_text: string
          created_at?: string
          embedding: string
          id?: string
          ley_id: string
          model?: string
          tokens?: number | null
        }
        Update: {
          articulo_id?: string
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          embedding?: string
          id?: string
          ley_id?: string
          model?: string
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ley_embeddings_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "ley_articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ley_embeddings_ley_id_fkey"
            columns: ["ley_id"]
            isOneToOne: false
            referencedRelation: "leyes"
            referencedColumns: ["id"]
          },
        ]
      }
      leyes: {
        Row: {
          clave: string
          created_at: string
          fecha_publicacion_dof: string | null
          id: string
          nombre: string
          notas: string | null
          publicado: boolean
          tipo: string
          total_articulos: number
          total_embeddings: number
          updated_at: string
          url_fuente: string | null
          version: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          clave: string
          created_at?: string
          fecha_publicacion_dof?: string | null
          id?: string
          nombre: string
          notas?: string | null
          publicado?: boolean
          tipo?: string
          total_articulos?: number
          total_embeddings?: number
          updated_at?: string
          url_fuente?: string | null
          version?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          clave?: string
          created_at?: string
          fecha_publicacion_dof?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          publicado?: boolean
          tipo?: string
          total_articulos?: number
          total_embeddings?: number
          updated_at?: string
          url_fuente?: string | null
          version?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      mensajes: {
        Row: {
          asunto: string | null
          canal: string
          cliente_id: string | null
          created_at: string
          cuerpo: string | null
          despacho_id: string
          destinatario: string | null
          enviado_at: string | null
          error: string | null
          estatus: string
          id: string
          plantilla_key: string | null
          variables: Json | null
        }
        Insert: {
          asunto?: string | null
          canal: string
          cliente_id?: string | null
          created_at?: string
          cuerpo?: string | null
          despacho_id: string
          destinatario?: string | null
          enviado_at?: string | null
          error?: string | null
          estatus?: string
          id?: string
          plantilla_key?: string | null
          variables?: Json | null
        }
        Update: {
          asunto?: string | null
          canal?: string
          cliente_id?: string | null
          created_at?: string
          cuerpo?: string | null
          despacho_id?: string
          destinatario?: string | null
          enviado_at?: string | null
          error?: string | null
          estatus?: string
          id?: string
          plantilla_key?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_bancarios: {
        Row: {
          abono: number
          cargo: number
          cliente_id: string
          created_at: string
          cuenta_id: string
          descripcion: string | null
          despacho_id: string
          duplicado_candidato_de: string | null
          fecha: string
          fila_origen: number | null
          hash: string
          id: string
          ignorado_at: string | null
          ignorado_motivo: string | null
          ignorado_por: string | null
          importacion_id: string | null
          importe_centavos: number | null
          moneda: string
          no_fiscal: boolean
          referencia: string | null
          saldo: number | null
        }
        Insert: {
          abono?: number
          cargo?: number
          cliente_id: string
          created_at?: string
          cuenta_id: string
          descripcion?: string | null
          despacho_id: string
          duplicado_candidato_de?: string | null
          fecha: string
          fila_origen?: number | null
          hash: string
          id?: string
          ignorado_at?: string | null
          ignorado_motivo?: string | null
          ignorado_por?: string | null
          importacion_id?: string | null
          importe_centavos?: number | null
          moneda?: string
          no_fiscal?: boolean
          referencia?: string | null
          saldo?: number | null
        }
        Update: {
          abono?: number
          cargo?: number
          cliente_id?: string
          created_at?: string
          cuenta_id?: string
          descripcion?: string | null
          despacho_id?: string
          duplicado_candidato_de?: string | null
          fecha?: string
          fila_origen?: number | null
          hash?: string
          id?: string
          ignorado_at?: string | null
          ignorado_motivo?: string | null
          ignorado_por?: string | null
          importacion_id?: string | null
          importe_centavos?: number | null
          moneda?: string
          no_fiscal?: boolean
          referencia?: string | null
          saldo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_bancarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_bancarios_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_bancarios_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_bancarios_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "conciliacion_importaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_subscriptions: {
        Row: {
          amount_mxn: number
          billing_cycle: string
          created_at: string
          despacho_id: string
          id: string
          iva_included: boolean
          last_event: Json | null
          mp_init_point: string | null
          mp_preapproval_id: string | null
          plan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_mxn: number
          billing_cycle: string
          created_at?: string
          despacho_id: string
          id?: string
          iva_included?: boolean
          last_event?: Json | null
          mp_init_point?: string | null
          mp_preapproval_id?: string | null
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_mxn?: number
          billing_cycle?: string
          created_at?: string
          despacho_id?: string
          id?: string
          iva_included?: boolean
          last_event?: Json | null
          mp_init_point?: string | null
          mp_preapproval_id?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_subscriptions_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      nomina_simulaciones: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string | null
          despacho_id: string
          entrada: Json
          id: string
          nombre: string
          resultado: Json
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          despacho_id: string
          entrada?: Json
          id?: string
          nombre: string
          resultado?: Json
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          entrada?: Json
          id?: string
          nombre?: string
          resultado?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nomina_simulaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomina_simulaciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      obligaciones_fiscales: {
        Row: {
          adjunto_path: string | null
          alert_channels: string[]
          alert_days_before: number
          clave: string
          cliente_id: string | null
          completada_at: string | null
          completada_by: string | null
          created_at: string
          despacho_id: string
          estatus: string
          evidencia_path: string | null
          id: string
          nombre: string | null
          notas: string | null
          periodicidad: string
          periodo: string | null
          proximo_vencimiento: string | null
          responsable_user_id: string | null
          rfc_id: string
          tipo: string | null
          updated_at: string
        }
        Insert: {
          adjunto_path?: string | null
          alert_channels?: string[]
          alert_days_before?: number
          clave: string
          cliente_id?: string | null
          completada_at?: string | null
          completada_by?: string | null
          created_at?: string
          despacho_id: string
          estatus?: string
          evidencia_path?: string | null
          id?: string
          nombre?: string | null
          notas?: string | null
          periodicidad: string
          periodo?: string | null
          proximo_vencimiento?: string | null
          responsable_user_id?: string | null
          rfc_id: string
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          adjunto_path?: string | null
          alert_channels?: string[]
          alert_days_before?: number
          clave?: string
          cliente_id?: string | null
          completada_at?: string | null
          completada_by?: string | null
          created_at?: string
          despacho_id?: string
          estatus?: string
          evidencia_path?: string | null
          id?: string
          nombre?: string | null
          notas?: string | null
          periodicidad?: string
          periodo?: string | null
          proximo_vencimiento?: string | null
          responsable_user_id?: string | null
          rfc_id?: string
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligaciones_fiscales_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligaciones_fiscales_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligaciones_fiscales_rfc_id_fkey"
            columns: ["rfc_id"]
            isOneToOne: false
            referencedRelation: "rfcs"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          created_at: string
          despacho_id: string
          estatus: string | null
          id: string
          monto_mxn: number | null
          pagado_at: string | null
          proveedor: string | null
          proveedor_pago_id: string | null
          suscripcion_id: string | null
        }
        Insert: {
          created_at?: string
          despacho_id: string
          estatus?: string | null
          id?: string
          monto_mxn?: number | null
          pagado_at?: string | null
          proveedor?: string | null
          proveedor_pago_id?: string | null
          suscripcion_id?: string | null
        }
        Update: {
          created_at?: string
          despacho_id?: string
          estatus?: string | null
          id?: string
          monto_mxn?: number | null
          pagado_at?: string | null
          proveedor?: string | null
          proveedor_pago_id?: string | null
          suscripcion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          activo: boolean
          clave: string
          created_at: string
          id: string
          limites: Json
          nombre: string
          precio_mxn: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          clave: string
          created_at?: string
          id?: string
          limites?: Json
          nombre: string
          precio_mxn?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          clave?: string
          created_at?: string
          id?: string
          limites?: Json
          nombre?: string
          precio_mxn?: number
          updated_at?: string
        }
        Relationships: []
      }
      poliza_renglones: {
        Row: {
          abono_centavos: number
          cargo_centavos: number
          cfdi_id: string | null
          cliente_id: string
          concepto: string | null
          created_at: string
          cuenta: string
          cuenta_nombre: string | null
          despacho_id: string
          id: string
          movimiento_bancario_id: string | null
          numero: number
          origen: string
          poliza_id: string
          updated_at: string
        }
        Insert: {
          abono_centavos?: number
          cargo_centavos?: number
          cfdi_id?: string | null
          cliente_id: string
          concepto?: string | null
          created_at?: string
          cuenta: string
          cuenta_nombre?: string | null
          despacho_id: string
          id?: string
          movimiento_bancario_id?: string | null
          numero: number
          origen?: string
          poliza_id: string
          updated_at?: string
        }
        Update: {
          abono_centavos?: number
          cargo_centavos?: number
          cfdi_id?: string | null
          cliente_id?: string
          concepto?: string | null
          created_at?: string
          cuenta?: string
          cuenta_nombre?: string | null
          despacho_id?: string
          id?: string
          movimiento_bancario_id?: string | null
          numero?: number
          origen?: string
          poliza_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poliza_renglones_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poliza_renglones_movimiento_bancario_id_fkey"
            columns: ["movimiento_bancario_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poliza_renglones_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
        ]
      }
      polizas: {
        Row: {
          aprobada_at: string | null
          aprobada_por: string | null
          cfdi_id: string | null
          cliente_id: string
          concepto: string | null
          created_at: string
          created_by: string | null
          cuenta: string | null
          despacho_id: string
          estado: string
          evidencia_detalle: Json
          fecha: string
          id: string
          idempotency_key: string | null
          input_hash: string | null
          metadata: Json
          monto: number
          movimiento_bancario_id: string | null
          nivel_evidencia: string
          origen: string
          periodo: string | null
          rechazada_at: string | null
          rechazada_por: string | null
          rechazo_motivo: string | null
          referencia: string | null
          tipo: string
          updated_at: string
          uuid_cfdi: string | null
          version: number
        }
        Insert: {
          aprobada_at?: string | null
          aprobada_por?: string | null
          cfdi_id?: string | null
          cliente_id: string
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          cuenta?: string | null
          despacho_id: string
          estado?: string
          evidencia_detalle?: Json
          fecha: string
          id?: string
          idempotency_key?: string | null
          input_hash?: string | null
          metadata?: Json
          monto?: number
          movimiento_bancario_id?: string | null
          nivel_evidencia?: string
          origen?: string
          periodo?: string | null
          rechazada_at?: string | null
          rechazada_por?: string | null
          rechazo_motivo?: string | null
          referencia?: string | null
          tipo: string
          updated_at?: string
          uuid_cfdi?: string | null
          version?: number
        }
        Update: {
          aprobada_at?: string | null
          aprobada_por?: string | null
          cfdi_id?: string | null
          cliente_id?: string
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          cuenta?: string | null
          despacho_id?: string
          estado?: string
          evidencia_detalle?: Json
          fecha?: string
          id?: string
          idempotency_key?: string | null
          input_hash?: string | null
          metadata?: Json
          monto?: number
          movimiento_bancario_id?: string | null
          nivel_evidencia?: string
          origen?: string
          periodo?: string | null
          rechazada_at?: string | null
          rechazada_por?: string | null
          rechazo_motivo?: string | null
          referencia?: string | null
          tipo?: string
          updated_at?: string
          uuid_cfdi?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "polizas_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_xml"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polizas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polizas_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polizas_movimiento_bancario_id_fkey"
            columns: ["movimiento_bancario_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          despacho_nombre: string | null
          email: string | null
          full_name: string | null
          id: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          despacho_nombre?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          despacho_nombre?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      programa_fundador: {
        Row: {
          creado_por: string | null
          created_at: string
          descuento_pct: number
          despacho_id: string
          estado: string
          fecha_ingreso: string
          fecha_renovacion: string | null
          id: string
          notas: string | null
          plan_id: string | null
          precio_anual_acordado_centavos: number | null
          proxima_sesion_feedback: string | null
          renovaciones_cubiertas: number
          responsable_onboarding: string | null
          ultima_sesion_feedback: string | null
          updated_at: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          descuento_pct?: number
          despacho_id: string
          estado?: string
          fecha_ingreso?: string
          fecha_renovacion?: string | null
          id?: string
          notas?: string | null
          plan_id?: string | null
          precio_anual_acordado_centavos?: number | null
          proxima_sesion_feedback?: string | null
          renovaciones_cubiertas?: number
          responsable_onboarding?: string | null
          ultima_sesion_feedback?: string | null
          updated_at?: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          descuento_pct?: number
          despacho_id?: string
          estado?: string
          fecha_ingreso?: string
          fecha_renovacion?: string | null
          id?: string
          notas?: string | null
          plan_id?: string | null
          precio_anual_acordado_centavos?: number | null
          proxima_sesion_feedback?: string | null
          renovaciones_cubiertas?: number
          responsable_onboarding?: string | null
          ultima_sesion_feedback?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programa_fundador_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: true
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      recomendaciones_ia: {
        Row: {
          accion_sugerida: string | null
          categoria: string
          cliente_id: string | null
          created_at: string
          created_by: string | null
          descripcion: string
          despacho_id: string
          estado: string
          id: string
          impacto_estimado_centavos: number | null
          implementada_at: string | null
          prioridad: string
          reporte_id: string | null
          tarea_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          accion_sugerida?: string | null
          categoria: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion: string
          despacho_id: string
          estado?: string
          id?: string
          impacto_estimado_centavos?: number | null
          implementada_at?: string | null
          prioridad?: string
          reporte_id?: string | null
          tarea_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          accion_sugerida?: string | null
          categoria?: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string
          despacho_id?: string
          estado?: string
          id?: string
          impacto_estimado_centavos?: number | null
          implementada_at?: string | null
          prioridad?: string
          reporte_id?: string | null
          tarea_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recomendaciones_ia_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recomendaciones_ia_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recomendaciones_ia_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "reportes_ejecutivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recomendaciones_ia_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      reglas_concepto: {
        Row: {
          activa: boolean
          actor: string | null
          clave_prod_serv: string
          cliente_id: string
          created_at: string
          cuenta: string
          despacho_id: string
          id: string
          motivo: string | null
          origen: string
          patron_descripcion: string | null
          rfc_contraparte: string | null
          tipo_operacion: string
          tratamiento_iva: string
          updated_at: string
          version: number
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        Insert: {
          activa?: boolean
          actor?: string | null
          clave_prod_serv: string
          cliente_id: string
          created_at?: string
          cuenta: string
          despacho_id: string
          id?: string
          motivo?: string | null
          origen: string
          patron_descripcion?: string | null
          rfc_contraparte?: string | null
          tipo_operacion: string
          tratamiento_iva: string
          updated_at?: string
          version?: number
          vigencia_desde: string
          vigencia_hasta?: string | null
        }
        Update: {
          activa?: boolean
          actor?: string | null
          clave_prod_serv?: string
          cliente_id?: string
          created_at?: string
          cuenta?: string
          despacho_id?: string
          id?: string
          motivo?: string | null
          origen?: string
          patron_descripcion?: string | null
          rfc_contraparte?: string | null
          tipo_operacion?: string
          tratamiento_iva?: string
          updated_at?: string
          version?: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reglas_concepto_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reglas_concepto_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      reglas_concepto_historial: {
        Row: {
          accion: string
          actor: string | null
          cliente_id: string
          created_at: string
          id: string
          motivo: string | null
          regla_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          accion: string
          actor?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          motivo?: string | null
          regla_id: string
          snapshot: Json
          version: number
        }
        Update: {
          accion?: string
          actor?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          motivo?: string | null
          regla_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: []
      }
      reglas_contables: {
        Row: {
          activa: boolean
          cliente_id: string
          condicion: Json
          created_at: string
          created_by: string | null
          cuenta_abono: string
          cuenta_cargo: string
          despacho_id: string
          hits: number
          id: string
          nombre: string
          origen: string
          prioridad: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          cliente_id: string
          condicion?: Json
          created_at?: string
          created_by?: string | null
          cuenta_abono: string
          cuenta_cargo: string
          despacho_id: string
          hits?: number
          id?: string
          nombre: string
          origen?: string
          prioridad?: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          cliente_id?: string
          condicion?: Json
          created_at?: string
          created_by?: string | null
          cuenta_abono?: string
          cuenta_cargo?: string
          despacho_id?: string
          hits?: number
          id?: string
          nombre?: string
          origen?: string
          prioridad?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reglas_contables_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reglas_contables_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes: {
        Row: {
          archivo_path: string | null
          cliente_id: string | null
          created_at: string
          despacho_id: string
          generado_por: string | null
          id: string
          parametros: Json | null
          periodo: unknown
          resultado: Json | null
          rfc_id: string | null
          tipo: string
        }
        Insert: {
          archivo_path?: string | null
          cliente_id?: string | null
          created_at?: string
          despacho_id: string
          generado_por?: string | null
          id?: string
          parametros?: Json | null
          periodo?: unknown
          resultado?: Json | null
          rfc_id?: string | null
          tipo: string
        }
        Update: {
          archivo_path?: string | null
          cliente_id?: string | null
          created_at?: string
          despacho_id?: string
          generado_por?: string | null
          id?: string
          parametros?: Json | null
          periodo?: unknown
          resultado?: Json | null
          rfc_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_rfc_id_fkey"
            columns: ["rfc_id"]
            isOneToOne: false
            referencedRelation: "rfcs"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes_ejecutivos: {
        Row: {
          ahorro_estimado_centavos: number
          cliente_id: string | null
          conciliacion: Json
          created_at: string
          created_by: string | null
          despacho_id: string
          enviado_at: string | null
          estado: string
          hallazgos: Json
          id: string
          obligaciones: Json
          oportunidades: Json
          periodo: string
          resumen_ejecutivo: string | null
          resumen_financiero: Json
          resumen_fiscal: Json
          riesgos: Json
          salud: Json
          tipo: string
          updated_at: string
        }
        Insert: {
          ahorro_estimado_centavos?: number
          cliente_id?: string | null
          conciliacion?: Json
          created_at?: string
          created_by?: string | null
          despacho_id: string
          enviado_at?: string | null
          estado?: string
          hallazgos?: Json
          id?: string
          obligaciones?: Json
          oportunidades?: Json
          periodo: string
          resumen_ejecutivo?: string | null
          resumen_financiero?: Json
          resumen_fiscal?: Json
          riesgos?: Json
          salud?: Json
          tipo?: string
          updated_at?: string
        }
        Update: {
          ahorro_estimado_centavos?: number
          cliente_id?: string | null
          conciliacion?: Json
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          enviado_at?: string | null
          estado?: string
          hallazgos?: Json
          id?: string
          obligaciones?: Json
          oportunidades?: Json
          periodo?: string
          resumen_ejecutivo?: string | null
          resumen_financiero?: Json
          resumen_fiscal?: Json
          riesgos?: Json
          salud?: Json
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportes_ejecutivos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_ejecutivos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      rfcs: {
        Row: {
          cliente_id: string
          cp_fiscal: string | null
          created_at: string
          csf_pdf_path: string | null
          despacho_id: string
          id: string
          obligaciones: Json | null
          regimen_fiscal: string | null
          rfc: string
          tipo_persona: string
          updated_at: string
          vigente: boolean
        }
        Insert: {
          cliente_id: string
          cp_fiscal?: string | null
          created_at?: string
          csf_pdf_path?: string | null
          despacho_id: string
          id?: string
          obligaciones?: Json | null
          regimen_fiscal?: string | null
          rfc: string
          tipo_persona: string
          updated_at?: string
          vigente?: boolean
        }
        Update: {
          cliente_id?: string
          cp_fiscal?: string | null
          created_at?: string
          csf_pdf_path?: string | null
          despacho_id?: string
          id?: string
          obligaciones?: Json | null
          regimen_fiscal?: string | null
          rfc?: string
          tipo_persona?: string
          updated_at?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rfcs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfcs_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      salud_fiscal_snapshots: {
        Row: {
          ai_resumen: string | null
          alertas: Json
          cliente_id: string
          comparativo: Json
          computed_by: string | null
          created_at: string
          despacho_id: string
          hallazgos: Json
          id: string
          periodo: string
          recomendaciones: Json
          score: number
          semaforo: string
          subscores: Json
          updated_at: string
        }
        Insert: {
          ai_resumen?: string | null
          alertas?: Json
          cliente_id: string
          comparativo?: Json
          computed_by?: string | null
          created_at?: string
          despacho_id: string
          hallazgos?: Json
          id?: string
          periodo: string
          recomendaciones?: Json
          score: number
          semaforo: string
          subscores?: Json
          updated_at?: string
        }
        Update: {
          ai_resumen?: string | null
          alertas?: Json
          cliente_id?: string
          comparativo?: Json
          computed_by?: string | null
          created_at?: string
          despacho_id?: string
          hallazgos?: Json
          id?: string
          periodo?: string
          recomendaciones?: Json
          score?: number
          semaforo?: string
          subscores?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salud_fiscal_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salud_fiscal_snapshots_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_credenciales: {
        Row: {
          cliente_id: string
          consentimiento_at: string | null
          consentimiento_user_id: string | null
          consentimiento_version: string | null
          created_at: string
          despacho_id: string
          efirma_cer: string | null
          efirma_key_enc: string | null
          efirma_pass_enc: string | null
          efirma_rfc: string | null
          efirma_vence_at: string | null
          estatus: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          pac_token: string | null
          proveedor: string
          updated_at: string
          vault_key_id: string | null
          vault_version: number
        }
        Insert: {
          cliente_id: string
          consentimiento_at?: string | null
          consentimiento_user_id?: string | null
          consentimiento_version?: string | null
          created_at?: string
          despacho_id: string
          efirma_cer?: string | null
          efirma_key_enc?: string | null
          efirma_pass_enc?: string | null
          efirma_rfc?: string | null
          efirma_vence_at?: string | null
          estatus?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          pac_token?: string | null
          proveedor?: string
          updated_at?: string
          vault_key_id?: string | null
          vault_version?: number
        }
        Update: {
          cliente_id?: string
          consentimiento_at?: string | null
          consentimiento_user_id?: string | null
          consentimiento_version?: string | null
          created_at?: string
          despacho_id?: string
          efirma_cer?: string | null
          efirma_key_enc?: string | null
          efirma_pass_enc?: string | null
          efirma_rfc?: string | null
          efirma_vence_at?: string | null
          estatus?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          pac_token?: string | null
          proveedor?: string
          updated_at?: string
          vault_key_id?: string | null
          vault_version?: number
        }
        Relationships: []
      }
      sat_cron_heartbeat: {
        Row: {
          corridas_iniciadas: number
          created_at: string
          duracion_ms: number | null
          error: string | null
          fin_at: string | null
          http_status: number | null
          id: string
          inicio_at: string
          ok: boolean
          paquetes_descargados: number
          runs_reencauzados: number
          runs_revisados: number
          runs_saneados: number
          solicitudes_consultadas: number
          version: string
        }
        Insert: {
          corridas_iniciadas?: number
          created_at?: string
          duracion_ms?: number | null
          error?: string | null
          fin_at?: string | null
          http_status?: number | null
          id?: string
          inicio_at?: string
          ok?: boolean
          paquetes_descargados?: number
          runs_reencauzados?: number
          runs_revisados?: number
          runs_saneados?: number
          solicitudes_consultadas?: number
          version?: string
        }
        Update: {
          corridas_iniciadas?: number
          created_at?: string
          duracion_ms?: number | null
          error?: string | null
          fin_at?: string | null
          http_status?: number | null
          id?: string
          inicio_at?: string
          ok?: boolean
          paquetes_descargados?: number
          runs_reencauzados?: number
          runs_revisados?: number
          runs_saneados?: number
          solicitudes_consultadas?: number
          version?: string
        }
        Relationships: []
      }
      sat_pac_movimientos: {
        Row: {
          costo_centavos: number
          creado_por: string | null
          created_at: string
          despacho_id: string | null
          id: string
          idempotency_key: string
          motivo: string | null
          proveedor: string
          reservado_despues: number
          run_id: string | null
          saldo_antes: number
          saldo_despues: number
          solicitudes: number
          tipo: string
        }
        Insert: {
          costo_centavos?: number
          creado_por?: string | null
          created_at?: string
          despacho_id?: string | null
          id?: string
          idempotency_key: string
          motivo?: string | null
          proveedor?: string
          reservado_despues?: number
          run_id?: string | null
          saldo_antes: number
          saldo_despues: number
          solicitudes: number
          tipo: string
        }
        Update: {
          costo_centavos?: number
          creado_por?: string | null
          created_at?: string
          despacho_id?: string | null
          id?: string
          idempotency_key?: string
          motivo?: string | null
          proveedor?: string
          reservado_despues?: number
          run_id?: string | null
          saldo_antes?: number
          saldo_despues?: number
          solicitudes?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sat_pac_movimientos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_pac_saldo: {
        Row: {
          actualizado_at: string
          actualizado_por: string | null
          consumido_total: number
          costo_unitario_centavos: number
          id: string
          proveedor: string
          recargado_total: number
          reservado_solicitudes: number
          saldo_solicitudes: number
          umbral_aviso: number
          umbral_critico: number
        }
        Insert: {
          actualizado_at?: string
          actualizado_por?: string | null
          consumido_total?: number
          costo_unitario_centavos?: number
          id?: string
          proveedor?: string
          recargado_total?: number
          reservado_solicitudes?: number
          saldo_solicitudes?: number
          umbral_aviso?: number
          umbral_critico?: number
        }
        Update: {
          actualizado_at?: string
          actualizado_por?: string | null
          consumido_total?: number
          costo_unitario_centavos?: number
          id?: string
          proveedor?: string
          recargado_total?: number
          reservado_solicitudes?: number
          saldo_solicitudes?: number
          umbral_aviso?: number
          umbral_critico?: number
        }
        Relationships: []
      }
      sat_procesamiento_eventos: {
        Row: {
          cliente_id: string
          created_at: string
          derivados: Json
          despacho_id: string
          estado: string
          execution_id: string | null
          finalizado_at: string | null
          id: string
          idempotency_key: string
          iniciado_at: string
          module_id: string
          motivo: string | null
          resultado: Json
          run_id: string
          updated_at: string
          version: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          derivados?: Json
          despacho_id: string
          estado: string
          execution_id?: string | null
          finalizado_at?: string | null
          id?: string
          idempotency_key: string
          iniciado_at?: string
          module_id: string
          motivo?: string | null
          resultado?: Json
          run_id: string
          updated_at?: string
          version?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          derivados?: Json
          despacho_id?: string
          estado?: string
          execution_id?: string | null
          finalizado_at?: string | null
          id?: string
          idempotency_key?: string
          iniciado_at?: string
          module_id?: string
          motivo?: string | null
          resultado?: Json
          run_id?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "sat_procesamiento_eventos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_procesamiento_eventos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_procesamiento_eventos_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sat_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_programacion_bitacora: {
        Row: {
          accion: string
          actor_user_id: string | null
          cliente_id: string
          created_at: string
          despacho_id: string
          detalle: Json
          id: string
          programacion_id: string
          programada_at: string | null
          resultado: string | null
          retraso_ms: number | null
          run_id: string | null
        }
        Insert: {
          accion: string
          actor_user_id?: string | null
          cliente_id: string
          created_at?: string
          despacho_id: string
          detalle?: Json
          id?: string
          programacion_id: string
          programada_at?: string | null
          resultado?: string | null
          retraso_ms?: number | null
          run_id?: string | null
        }
        Update: {
          accion?: string
          actor_user_id?: string | null
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          detalle?: Json
          id?: string
          programacion_id?: string
          programada_at?: string | null
          resultado?: string | null
          retraso_ms?: number | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sat_programacion_bitacora_programacion_id_fkey"
            columns: ["programacion_id"]
            isOneToOne: false
            referencedRelation: "sat_programaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_programaciones: {
        Row: {
          activa: boolean
          actualizado_por: string | null
          bloqueo_at: string | null
          cancelada: boolean
          clasificar_nomina: boolean
          clasificar_pagos: boolean
          cliente_id: string
          creado_por: string | null
          created_at: string
          despacho_id: string
          dia_mes: number | null
          dias_semana: number[] | null
          emitidos: boolean
          fecha_unica: string | null
          hora: number
          id: string
          minuto: number
          pausada: boolean
          periodo_opcion: string
          politica_retraso: string
          proxima_ejecucion_at: string | null
          rango_desde: string | null
          rango_hasta: string | null
          recibidos: boolean
          recurrencia: string | null
          solapamiento_dias: number
          tipo: string
          tolerancia_minutos: number
          ultima_corrida_id: string | null
          ultima_ejecucion_at: string | null
          ultima_ocurrencia_key: string | null
          ultima_programada_at: string | null
          ultimo_detalle: string | null
          ultimo_resultado: string | null
          ultimo_retraso_ms: number | null
          updated_at: string
          version: number
          zona_horaria: string
        }
        Insert: {
          activa?: boolean
          actualizado_por?: string | null
          bloqueo_at?: string | null
          cancelada?: boolean
          clasificar_nomina?: boolean
          clasificar_pagos?: boolean
          cliente_id: string
          creado_por?: string | null
          created_at?: string
          despacho_id: string
          dia_mes?: number | null
          dias_semana?: number[] | null
          emitidos?: boolean
          fecha_unica?: string | null
          hora?: number
          id?: string
          minuto?: number
          pausada?: boolean
          periodo_opcion?: string
          politica_retraso?: string
          proxima_ejecucion_at?: string | null
          rango_desde?: string | null
          rango_hasta?: string | null
          recibidos?: boolean
          recurrencia?: string | null
          solapamiento_dias?: number
          tipo?: string
          tolerancia_minutos?: number
          ultima_corrida_id?: string | null
          ultima_ejecucion_at?: string | null
          ultima_ocurrencia_key?: string | null
          ultima_programada_at?: string | null
          ultimo_detalle?: string | null
          ultimo_resultado?: string | null
          ultimo_retraso_ms?: number | null
          updated_at?: string
          version?: number
          zona_horaria?: string
        }
        Update: {
          activa?: boolean
          actualizado_por?: string | null
          bloqueo_at?: string | null
          cancelada?: boolean
          clasificar_nomina?: boolean
          clasificar_pagos?: boolean
          cliente_id?: string
          creado_por?: string | null
          created_at?: string
          despacho_id?: string
          dia_mes?: number | null
          dias_semana?: number[] | null
          emitidos?: boolean
          fecha_unica?: string | null
          hora?: number
          id?: string
          minuto?: number
          pausada?: boolean
          periodo_opcion?: string
          politica_retraso?: string
          proxima_ejecucion_at?: string | null
          rango_desde?: string | null
          rango_hasta?: string | null
          recibidos?: boolean
          recurrencia?: string | null
          solapamiento_dias?: number
          tipo?: string
          tolerancia_minutos?: number
          ultima_corrida_id?: string | null
          ultima_ejecucion_at?: string | null
          ultima_ocurrencia_key?: string | null
          ultima_programada_at?: string | null
          ultimo_detalle?: string | null
          ultimo_resultado?: string | null
          ultimo_retraso_ms?: number | null
          updated_at?: string
          version?: number
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "sat_programaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_programaciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_programaciones_ultima_corrida_id_fkey"
            columns: ["ultima_corrida_id"]
            isOneToOne: false
            referencedRelation: "sat_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_sync_config: {
        Row: {
          activo: boolean
          clasificar_nomina: boolean
          clasificar_pagos: boolean
          cliente_id: string
          created_at: string
          despacho_id: string
          emitidos: boolean
          fecha_desde: string | null
          fecha_hasta: string | null
          frecuencia: string
          nomina: boolean
          pagos: boolean
          periodo: string
          proveedor: string
          proxima_corrida_at: string | null
          recibidos: boolean
          retenciones: boolean
          ultima_corrida_at: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          clasificar_nomina?: boolean
          clasificar_pagos?: boolean
          cliente_id: string
          created_at?: string
          despacho_id: string
          emitidos?: boolean
          fecha_desde?: string | null
          fecha_hasta?: string | null
          frecuencia?: string
          nomina?: boolean
          pagos?: boolean
          periodo?: string
          proveedor?: string
          proxima_corrida_at?: string | null
          recibidos?: boolean
          retenciones?: boolean
          ultima_corrida_at?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          clasificar_nomina?: boolean
          clasificar_pagos?: boolean
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          emitidos?: boolean
          fecha_desde?: string | null
          fecha_hasta?: string | null
          frecuencia?: string
          nomina?: boolean
          pagos?: boolean
          periodo?: string
          proveedor?: string
          proxima_corrida_at?: string | null
          recibidos?: boolean
          retenciones?: boolean
          ultima_corrida_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sat_sync_config_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_sync_config_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_sync_eventos: {
        Row: {
          cliente_id: string
          created_at: string
          despacho_id: string
          id: string
          mensaje: string | null
          monto: number | null
          payload: Json | null
          rfc_contraparte: string | null
          run_id: string | null
          tipo: string
          uuid_cfdi: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          despacho_id: string
          id?: string
          mensaje?: string | null
          monto?: number | null
          payload?: Json | null
          rfc_contraparte?: string | null
          run_id?: string | null
          tipo: string
          uuid_cfdi?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          despacho_id?: string
          id?: string
          mensaje?: string | null
          monto?: number | null
          payload?: Json | null
          rfc_contraparte?: string | null
          run_id?: string | null
          tipo?: string
          uuid_cfdi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sat_sync_eventos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_sync_eventos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_sync_eventos_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sat_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_sync_runs: {
        Row: {
          advertencia: string | null
          cancelados: number
          cliente_id: string
          cobertura: string
          descargados: number
          desde: string | null
          despacho_id: string
          detalle: string | null
          duplicados: number
          duracion_ms: number | null
          errores: Json
          estado: string
          estatus: string
          finalizado_at: string | null
          hasta: string | null
          id: string
          idempotency_key: string | null
          iniciado_at: string
          nuevos: number
          origen: string
          paquetes_procesados: number
          proveedor: string
          rechazados: number
          solicitudes: Json
          tipo: string
          triggered_by: string | null
          ultima_consulta_at: string | null
        }
        Insert: {
          advertencia?: string | null
          cancelados?: number
          cliente_id: string
          cobertura?: string
          descargados?: number
          desde?: string | null
          despacho_id: string
          detalle?: string | null
          duplicados?: number
          duracion_ms?: number | null
          errores?: Json
          estado?: string
          estatus?: string
          finalizado_at?: string | null
          hasta?: string | null
          id?: string
          idempotency_key?: string | null
          iniciado_at?: string
          nuevos?: number
          origen?: string
          paquetes_procesados?: number
          proveedor?: string
          rechazados?: number
          solicitudes?: Json
          tipo?: string
          triggered_by?: string | null
          ultima_consulta_at?: string | null
        }
        Update: {
          advertencia?: string | null
          cancelados?: number
          cliente_id?: string
          cobertura?: string
          descargados?: number
          desde?: string | null
          despacho_id?: string
          detalle?: string | null
          duplicados?: number
          duracion_ms?: number | null
          errores?: Json
          estado?: string
          estatus?: string
          finalizado_at?: string | null
          hasta?: string | null
          id?: string
          idempotency_key?: string | null
          iniciado_at?: string
          nuevos?: number
          origen?: string
          paquetes_procesados?: number
          proveedor?: string
          rechazados?: number
          solicitudes?: Json
          tipo?: string
          triggered_by?: string | null
          ultima_consulta_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sat_sync_runs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_sync_runs_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      semaforo_fiscal: {
        Row: {
          calculado_at: string
          color: string
          despacho_id: string
          id: string
          motivos: Json | null
          periodo: string
          rfc_id: string
        }
        Insert: {
          calculado_at?: string
          color: string
          despacho_id: string
          id?: string
          motivos?: Json | null
          periodo: string
          rfc_id: string
        }
        Update: {
          calculado_at?: string
          color?: string
          despacho_id?: string
          id?: string
          motivos?: Json | null
          periodo?: string
          rfc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "semaforo_fiscal_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semaforo_fiscal_rfc_id_fkey"
            columns: ["rfc_id"]
            isOneToOne: false
            referencedRelation: "rfcs"
            referencedColumns: ["id"]
          },
        ]
      }
      simulaciones_fiscales: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string | null
          despacho_id: string
          escenario: string
          id: string
          narrativa: string | null
          parametros: Json
          resultado: Json
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          despacho_id: string
          escenario: string
          id?: string
          narrativa?: string | null
          parametros?: Json
          resultado?: Json
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          escenario?: string
          id?: string
          narrativa?: string | null
          parametros?: Json
          resultado?: Json
        }
        Relationships: [
          {
            foreignKeyName: "simulaciones_fiscales_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulaciones_fiscales_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      suscripciones: {
        Row: {
          created_at: string
          current_period_end: string | null
          despacho_id: string
          estatus: string
          id: string
          plan_id: string
          proveedor: string
          proveedor_sub_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          despacho_id: string
          estatus: string
          id?: string
          plan_id: string
          proveedor: string
          proveedor_sub_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          despacho_id?: string
          estatus?: string
          id?: string
          plan_id?: string
          proveedor?: string
          proveedor_sub_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_adjuntos: {
        Row: {
          created_at: string
          despacho_id: string
          id: string
          mime: string | null
          nombre: string
          tamano_bytes: number | null
          tarea_id: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          despacho_id: string
          id?: string
          mime?: string | null
          nombre: string
          tamano_bytes?: number | null
          tarea_id: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          despacho_id?: string
          id?: string
          mime?: string | null
          nombre?: string
          tamano_bytes?: number | null
          tarea_id?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarea_adjuntos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarea_adjuntos_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_bitacora: {
        Row: {
          created_at: string
          despacho_id: string
          detalle: Json | null
          evento: string
          id: string
          tarea_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          despacho_id: string
          detalle?: Json | null
          evento: string
          id?: string
          tarea_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          despacho_id?: string
          detalle?: Json | null
          evento?: string
          id?: string
          tarea_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarea_bitacora_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarea_bitacora_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_comentarios: {
        Row: {
          contenido: string
          created_at: string
          despacho_id: string
          id: string
          tarea_id: string
          user_id: string
        }
        Insert: {
          contenido: string
          created_at?: string
          despacho_id: string
          id?: string
          tarea_id: string
          user_id: string
        }
        Update: {
          contenido?: string
          created_at?: string
          despacho_id?: string
          id?: string
          tarea_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarea_comentarios_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarea_comentarios_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas: {
        Row: {
          asignado_a: string | null
          cliente_id: string | null
          completada_at: string | null
          completada_by: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          despacho_id: string
          due_date: string | null
          estatus: string
          evidencia_url: string | null
          id: string
          kanban_estado: string
          origen: string | null
          origen_id: string | null
          prioridad: string
          requires_evidence: boolean
          tiempo_invertido_min: number
          tipo: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          asignado_a?: string | null
          cliente_id?: string | null
          completada_at?: string | null
          completada_by?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          despacho_id: string
          due_date?: string | null
          estatus?: string
          evidencia_url?: string | null
          id?: string
          kanban_estado?: string
          origen?: string | null
          origen_id?: string | null
          prioridad?: string
          requires_evidence?: boolean
          tiempo_invertido_min?: number
          tipo?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          asignado_a?: string | null
          cliente_id?: string | null
          completada_at?: string | null
          completada_by?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          despacho_id?: string
          due_date?: string | null
          estatus?: string
          evidencia_url?: string | null
          id?: string
          kanban_estado?: string
          origen?: string | null
          origen_id?: string | null
          prioridad?: string
          requires_evidence?: boolean
          tiempo_invertido_min?: number
          tipo?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_runs: {
        Row: {
          cliente_id: string | null
          created_at: string
          despacho_id: string
          id: string
          input: Json | null
          notes: string | null
          output: Json | null
          status: string
          tool_key: string
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          despacho_id: string
          id?: string
          input?: Json | null
          notes?: string | null
          output?: Json | null
          status?: string
          tool_key: string
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          despacho_id?: string
          id?: string
          input?: Json | null
          notes?: string | null
          output?: Json | null
          status?: string
          tool_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_runs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_runs_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      tramites: {
        Row: {
          autoridad: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          despacho_id: string
          estado: string
          fecha_vencimiento: string | null
          id: string
          notas: string | null
          orden: number
          responsable: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          autoridad?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          despacho_id: string
          estado?: string
          fecha_vencimiento?: string | null
          id?: string
          notas?: string | null
          orden?: number
          responsable?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          autoridad?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          despacho_id?: string
          estado?: string
          fecha_vencimiento?: string | null
          id?: string
          notas?: string | null
          orden?: number
          responsable?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tramites_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tramites_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memberships: {
        Row: {
          created_at: string
          despacho_id: string
          estado: string
          invited_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          despacho_id: string
          estado?: string
          invited_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          despacho_id?: string
          estado?: string
          invited_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memberships_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          cliente_id: string | null
          created_at: string
          despacho_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          despacho_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          despacho_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_eventos: {
        Row: {
          created_at: string
          despacho_id: string
          id: string
          metadata: Json | null
          model: string | null
          tipo: string
          tokens_in: number
          tokens_out: number
          tool: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          despacho_id: string
          id?: string
          metadata?: Json | null
          model?: string | null
          tipo: string
          tokens_in?: number
          tokens_out?: number
          tool?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          despacho_id?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          tipo?: string
          tokens_in?: number
          tokens_out?: number
          tool?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uso_eventos_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_periodo: {
        Row: {
          despacho_id: string
          ia_requests: number
          ia_tokens: number
          id: string
          periodo: string
          rfc_activos: number
          sat_costo_centavos: number
          sat_solicitudes: number
          updated_at: string
        }
        Insert: {
          despacho_id: string
          ia_requests?: number
          ia_tokens?: number
          id?: string
          periodo: string
          rfc_activos?: number
          sat_costo_centavos?: number
          sat_solicitudes?: number
          updated_at?: string
        }
        Update: {
          despacho_id?: string
          ia_requests?: number
          ia_tokens?: number
          id?: string
          periodo?: string
          rfc_activos?: number
          sat_costo_centavos?: number
          sat_solicitudes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uso_periodo_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_events: {
        Row: {
          cliente_id: string | null
          created_at: string
          despacho_id: string
          id: string
          payload: Json
          procesado: boolean
          procesado_at: string | null
          trigger_type: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          despacho_id: string
          id?: string
          payload?: Json
          procesado?: boolean
          procesado_at?: string | null
          trigger_type: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          despacho_id?: string
          id?: string
          payload?: Json
          procesado?: boolean
          procesado_at?: string | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_events_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_run_steps: {
        Row: {
          despacho_id: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          input: Json | null
          kind: string
          node_id: string
          output: Json | null
          position: number
          run_id: string
          started_at: string
          status: Database["public"]["Enums"]["workflow_step_status"]
          step_type: string
        }
        Insert: {
          despacho_id: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind: string
          node_id: string
          output?: Json | null
          position?: number
          run_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step_type: string
        }
        Update: {
          despacho_id?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind?: string
          node_id?: string
          output?: Json | null
          position?: number
          run_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_steps_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          cliente_id: string | null
          created_at: string
          despacho_id: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: Database["public"]["Enums"]["workflow_run_status"]
          steps_failed: number
          steps_ok: number
          total_steps: number
          trigger_payload: Json
          trigger_type: string
          triggered_by: string | null
          workflow_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          despacho_id: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          steps_failed?: number
          steps_ok?: number
          total_steps?: number
          trigger_payload?: Json
          trigger_type: string
          triggered_by?: string | null
          workflow_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          despacho_id?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          steps_failed?: number
          steps_ok?: number
          total_steps?: number
          trigger_payload?: Json
          trigger_type?: string
          triggered_by?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_suggestions: {
        Row: {
          acciones_sugeridas: Json
          cliente_id: string | null
          confianza: number
          created_at: string
          descripcion: string
          despacho_id: string
          estado: string
          evidencia: Json | null
          id: string
          patron_detectado: string
          resolved_at: string | null
          resolved_by: string | null
          template_sugerido: string | null
          titulo: string
          trigger_sugerido: string | null
        }
        Insert: {
          acciones_sugeridas?: Json
          cliente_id?: string | null
          confianza?: number
          created_at?: string
          descripcion: string
          despacho_id: string
          estado?: string
          evidencia?: Json | null
          id?: string
          patron_detectado: string
          resolved_at?: string | null
          resolved_by?: string | null
          template_sugerido?: string | null
          titulo: string
          trigger_sugerido?: string | null
        }
        Update: {
          acciones_sugeridas?: Json
          cliente_id?: string | null
          confianza?: number
          created_at?: string
          descripcion?: string
          despacho_id?: string
          estado?: string
          evidencia?: Json | null
          id?: string
          patron_detectado?: string
          resolved_at?: string | null
          resolved_by?: string | null
          template_sugerido?: string | null
          titulo?: string
          trigger_sugerido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_suggestions_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_suggestions_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          despacho_id: string
          edges: Json
          id: string
          last_run_at: string | null
          next_run_at: string | null
          nodes: Json
          nombre: string
          prioridad: string
          responsable_user_id: string | null
          status: Database["public"]["Enums"]["workflow_status"]
          template_key: string | null
          total_failed: number
          total_runs: number
          total_success: number
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          despacho_id: string
          edges?: Json
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          nodes?: Json
          nombre: string
          prioridad?: string
          responsable_user_id?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          template_key?: string | null
          total_failed?: number
          total_runs?: number
          total_success?: number
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          despacho_id?: string
          edges?: Json
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          nodes?: Json
          nombre?: string
          prioridad?: string
          responsable_user_id?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          template_key?: string | null
          total_failed?: number
          total_runs?: number
          total_success?: number
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      catalogo_cuenta_desactivar: {
        Args: { _cliente_id: string; _codigo: string }
        Returns: Json
      }
      catalogo_cuenta_guardar: {
        Args: {
          _activa?: boolean
          _agrupador_sat?: string
          _cliente_id: string
          _codigo: string
          _codigo_padre?: string
          _moneda?: string
          _naturaleza: string
          _nombre: string
        }
        Returns: Json
      }
      catalogo_importar_lote: {
        Args: {
          _cliente_id: string
          _cuentas: Json
          _huella: string
          _modo: string
        }
        Returns: Json
      }
      cc_normalizar_codigo: { Args: { _c: string }; Returns: string }
      cfdi_normalizacion_reemplazar: {
        Args: { _cfdi_id: string; _payload: Json }
        Returns: Json
      }
      cfdi_registrar_evidencia_sat: {
        Args: {
          _cfdi_id: string
          _paquete_id: string
          _run_id: string
          _solicitud_id: string
        }
        Returns: Json
      }
      check_rate_limit: {
        Args: { _bucket: string; _max: number; _window_seconds: number }
        Returns: {
          allowed: boolean
          current_count: number
          reset_at: string
        }[]
      }
      cierre_autorizar_expediente: {
        Args: { _cliente_id: string }
        Returns: string
      }
      cierre_bloqueos: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_canonizar: { Args: { _v: Json }; Returns: string }
      cierre_decision_evidencia_suficiente: {
        Args: { _cfdi_id: string }
        Returns: boolean
      }
      cierre_diag_bancos: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_diag_clasificacion: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_diag_impuestos: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_diag_polizas: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_entradas_fiscales: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_entradas_fiscales_base: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_estado: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_etapa_transicion: {
        Args: {
          _cliente_id: string
          _cobertura?: number
          _criterios_cumplidos?: Json
          _criterios_pendientes?: Json
          _estado: string
          _etapa: string
          _evaluador_version?: string
          _fuente?: string
          _idempotency_key?: string
          _input_hash?: string
          _motivo?: string
          _periodo: string
          _resultado?: Json
        }
        Returns: {
          aprobada_at: string | null
          aprobada_por: string | null
          cliente_id: string
          cobertura: number | null
          created_at: string
          criterios_cumplidos: Json
          criterios_pendientes: Json
          despacho_id: string
          estado: string
          etapa: string
          evaluador_version: string | null
          id: string
          idempotency_key: string | null
          iniciada_at: string | null
          input_hash: string | null
          lista_at: string | null
          motivo: string | null
          periodo: string
          resultado: Json
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "cierre_etapas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cierre_evaluar_bancos: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_evaluar_clasificacion: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_evaluar_impuestos: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_evaluar_polizas: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_excepcion_cerrar_automatica: {
        Args: { _actor?: string; _ids: string[]; _motivo?: string }
        Returns: {
          cerrada_id: string
        }[]
      }
      cierre_excepcion_crear_ocurrencia: {
        Args: {
          _actor?: string
          _cfdi_id: string
          _cliente_id: string
          _codigo: string
          _despacho_id: string
          _detalle: Json
          _excepcion_previa_id?: string
          _ocurrencia: number
          _periodo: string
          _severidad: string
          _titulo: string
        }
        Returns: string
      }
      cierre_hash_jsonb: { Args: { _v: Json }; Returns: string }
      cierre_huella: { Args: { _man: Json }; Returns: string }
      cierre_manifiesto: {
        Args: { _cliente_id: string; _periodo: string }
        Returns: Json
      }
      cierre_marcar_no_aplica: {
        Args: {
          _cliente_id: string
          _etapa: string
          _motivo: string
          _periodo: string
        }
        Returns: Json
      }
      cierre_marcar_no_comprobada: {
        Args: {
          _cliente_id: string
          _detalle: string
          _etapa: string
          _periodo: string
        }
        Returns: Json
      }
      cierre_normativa_canonica: { Args: { _n: Json }; Returns: string }
      cierre_reabrir: {
        Args: {
          _cliente_id: string
          _disparador: string
          _idempotency_key?: string
          _motivo: string
          _periodo: string
          _referencia_id?: string
          _referencia_tipo?: string
        }
        Returns: Json
      }
      cierre_reabrir_cascada: {
        Args: {
          _cliente_id: string
          _disparador: string
          _idempotency_key?: string
          _motivo: string
          _periodo: string
          _referencia_id?: string
          _referencia_tipo?: string
        }
        Returns: {
          estado_anterior: string
          etapa: string
          version: number
        }[]
      }
      cierre_regimen_desde_sat: { Args: { _regimen: string }; Returns: string }
      cierre_registrar_decision_fiscal: {
        Args: {
          _cfdi_id: string
          _cliente_id: string
          _decision: string
          _fundamento?: string
          _motivo?: string
          _origen?: string
          _porcentaje?: number
          _porcentaje_iva?: number
          _regla_id?: string
          _regla_version?: string
          _sugerencia_ia?: Json
        }
        Returns: Json
      }
      cierre_registrar_resultado_fiscal_srv: {
        Args: {
          _cliente_id: string
          _entradas: Json
          _fuentes: Json
          _fundamentos: Json
          _input_hash: string
          _motor_version: string
          _normativa: Json
          _normativa_sha256: string
          _periodo: string
          _regimen: string
          _resultado: Json
          _solicitado_por: string
        }
        Returns: Json
      }
      cierre_resumen: { Args: { _man: Json }; Returns: Json }
      cierre_sellar_manifiesto: {
        Args: {
          _cliente_id: string
          _idempotency_key?: string
          _motivo: string
          _periodo: string
        }
        Returns: {
          bloqueos: Json | null
          cliente_id: string
          created_at: string
          despacho_id: string
          etapas: Json
          evaluador_version: string | null
          huella: string
          id: string
          manifiesto: Json | null
          motivo: string
          periodo: string
          resumen: Json
          sellado_por: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "cierre_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cierre_set_tolerancia_bancos: {
        Args: {
          _cliente_id: string
          _motivo: string
          _tolerancia_centavos: number
        }
        Returns: Json
      }
      cliente_eliminar: { Args: { p_cliente_id: string }; Returns: Json }
      conciliacion_confirmar_grupo: {
        Args: { _grupo_id: string; _motivo?: string }
        Returns: Json
      }
      conciliacion_ejecutar_corrida: {
        Args: {
          _actor: string
          _algoritmo_version: string
          _cliente_id: string
          _dias_ventana?: number
          _grupos: Json
          _idempotency_key: string
          _input_hash: string
          _parametros: Json
          _periodo: string
        }
        Returns: Json
      }
      conciliacion_ignorar_movimiento: {
        Args: { _motivo: string; _movimiento_id: string; _no_fiscal?: boolean }
        Returns: Json
      }
      conciliacion_rechazar_grupo: {
        Args: { _grupo_id: string; _motivo: string }
        Returns: Json
      }
      conciliacion_revertir_grupo: {
        Args: { _grupo_id: string; _motivo: string }
        Returns: Json
      }
      cron_secreto: { Args: { _nombre: string }; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      descontar_saldo_pac: {
        Args: { _costo_centavos: number; _solicitudes: number }
        Returns: {
          actualizado_at: string
          actualizado_por: string | null
          consumido_total: number
          costo_unitario_centavos: number
          id: string
          proveedor: string
          recargado_total: number
          reservado_solicitudes: number
          saldo_solicitudes: number
          umbral_aviso: number
          umbral_critico: number
        }
        SetofOptions: {
          from: "*"
          to: "sat_pac_saldo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      emitir_avisos_vencimiento: {
        Args: never
        Returns: {
          excepciones: number
          trials: number
        }[]
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      es_despacho_sandbox: { Args: { _despacho: string }; Returns: boolean }
      excepcion_vigente: {
        Args: { _despacho: string; _tipo: string }
        Returns: {
          expira_at: string
          motivo: string
          valor_num: number
          valor_texto: string
        }[]
      }
      expirar_trials: {
        Args: never
        Returns: {
          normalizadas: number
          vencidas: number
        }[]
      }
      has_cliente_access: { Args: { _cliente: string }; Returns: boolean }
      has_cliente_access_for: {
        Args: { _cliente: string; _user: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _cliente?: string
          _despacho?: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      incrementar_uso_ia: {
        Args: {
          _despacho: string
          _periodo: string
          _requests: number
          _tokens: number
        }
        Returns: {
          despacho_id: string
          ia_requests: number
          ia_tokens: number
          id: string
          periodo: string
          rfc_activos: number
          sat_costo_centavos: number
          sat_solicitudes: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "uso_periodo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      incrementar_uso_sat: {
        Args: {
          _costo_centavos: number
          _despacho: string
          _periodo: string
          _solicitudes: number
        }
        Returns: {
          despacho_id: string
          ia_requests: number
          ia_tokens: number
          id: string
          periodo: string
          rfc_activos: number
          sat_costo_centavos: number
          sat_solicitudes: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "uso_periodo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_despacho_admin: { Args: { _despacho: string }; Returns: boolean }
      is_member_of: { Args: { _despacho: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      match_ley_articulos: {
        Args: {
          filter_ley_claves?: string[]
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          articulo_id: string
          chunk_text: string
          fraccion: string
          ley_clave: string
          ley_id: string
          ley_nombre: string
          numero: string
          similarity: number
          texto: string
          titulo: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      pac_ajustar: {
        Args: { _delta: number; _key: string; _motivo: string }
        Returns: number
      }
      pac_conciliacion: {
        Args: { _desde?: string }
        Returns: {
          ajustes: number
          consumos: number
          corridas_sat: number
          descuadre: number
          devoluciones: number
          recargas: number
          reservado: number
          saldo_actual: number
          saldo_calculado: number
          solicitudes_uso_periodo: number
        }[]
      }
      pac_confirmar_consumo: {
        Args: {
          _despacho?: string
          _key: string
          _run_id?: string
          _solicitudes_reales: number
        }
        Returns: {
          consumidas: number
          devueltas: number
          saldo_solicitudes: number
        }[]
      }
      pac_devolver_reserva: {
        Args: { _key: string; _motivo: string }
        Returns: boolean
      }
      pac_liberar_abandonadas: { Args: { _minutos?: number }; Returns: number }
      pac_recargar: {
        Args: {
          _costo_total_centavos: number
          _key: string
          _motivo: string
          _solicitudes: number
        }
        Returns: {
          duplicado: boolean
          saldo_solicitudes: number
        }[]
      }
      pac_reservar: {
        Args: {
          _despacho?: string
          _key: string
          _motivo?: string
          _run_id?: string
          _solicitudes: number
        }
        Returns: {
          duplicado: boolean
          ok: boolean
          reservadas: number
          saldo_disponible: number
        }[]
      }
      pac_reservas_abandonadas: {
        Args: { _minutos?: number }
        Returns: {
          created_at: string
          despacho_id: string
          idempotency_key: string
          minutos_abierta: number
          run_id: string
          solicitudes: number
        }[]
      }
      poliza_aprobar: {
        Args: { _motivo: string; _poliza_id: string }
        Returns: Json
      }
      poliza_generar_borrador: {
        Args: {
          _cliente_id: string
          _concepto: string
          _fecha: string
          _idempotency_key: string
          _origen: string
          _periodo: string
          _renglones: Json
          _tipo: string
        }
        Returns: Json
      }
      poliza_marcar_evidencia: {
        Args: { _detalle?: Json; _nivel: string; _poliza_id: string }
        Returns: Json
      }
      poliza_rechazar: {
        Args: { _motivo: string; _poliza_id: string }
        Returns: Json
      }
      purga_expediente_en_curso: { Args: never; Returns: boolean }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recargar_saldo_pac: {
        Args: { _costo_total_centavos: number; _solicitudes: number }
        Returns: {
          actualizado_at: string
          actualizado_por: string | null
          consumido_total: number
          costo_unitario_centavos: number
          id: string
          proveedor: string
          recargado_total: number
          reservado_solicitudes: number
          saldo_solicitudes: number
          umbral_aviso: number
          umbral_critico: number
        }
        SetofOptions: {
          from: "*"
          to: "sat_pac_saldo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      regla_concepto_desactivar: {
        Args: { _motivo: string; _regla_id: string }
        Returns: Json
      }
      regla_concepto_guardar: {
        Args: {
          _clave_prod_serv: string
          _cliente_id: string
          _cuenta: string
          _motivo: string
          _origen?: string
          _patron_descripcion?: string
          _rfc_contraparte?: string
          _tipo_operacion: string
          _tratamiento_iva: string
          _vigencia_desde: string
          _vigencia_hasta?: string
        }
        Returns: Json
      }
      regla_concepto_resolver: {
        Args: {
          _clave_prod_serv: string
          _cliente_id: string
          _descripcion: string
          _fecha: string
          _rfc_contraparte: string
        }
        Returns: Json
      }
      sat_prog_puede_administrar: {
        Args: { _despacho: string; _user: string }
        Returns: boolean
      }
      sat_programacion_cambiar_estado: {
        Args: {
          _accion: string
          _cliente: string
          _detalle?: Json
          _proxima?: string
        }
        Returns: Json
      }
      sat_programacion_guardar: {
        Args: { _cliente: string; _detalle?: Json; _fila: Json }
        Returns: Json
      }
      sat_programacion_resolver_ocurrencia: {
        Args: {
          _accion: string
          _activa?: boolean
          _avanzar?: boolean
          _bloqueo: string
          _corrida?: string
          _detalle?: Json
          _marcar_ejecucion?: boolean
          _ocurrencia: string
          _programacion: string
          _programada: string
          _proxima?: string
          _resultado?: string
          _retraso?: number
          _run?: string
          _ultimo_detalle?: string
        }
        Returns: Json
      }
      sat_programaciones_reclamar: {
        Args: { _ahora?: string; _limite?: number }
        Returns: {
          activa: boolean
          actualizado_por: string | null
          bloqueo_at: string | null
          cancelada: boolean
          clasificar_nomina: boolean
          clasificar_pagos: boolean
          cliente_id: string
          creado_por: string | null
          created_at: string
          despacho_id: string
          dia_mes: number | null
          dias_semana: number[] | null
          emitidos: boolean
          fecha_unica: string | null
          hora: number
          id: string
          minuto: number
          pausada: boolean
          periodo_opcion: string
          politica_retraso: string
          proxima_ejecucion_at: string | null
          rango_desde: string | null
          rango_hasta: string | null
          recibidos: boolean
          recurrencia: string | null
          solapamiento_dias: number
          tipo: string
          tolerancia_minutos: number
          ultima_corrida_id: string | null
          ultima_ejecucion_at: string | null
          ultima_ocurrencia_key: string | null
          ultima_programada_at: string | null
          ultimo_detalle: string | null
          ultimo_resultado: string | null
          ultimo_retraso_ms: number | null
          updated_at: string
          version: number
          zona_horaria: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sat_programaciones"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      validar_cupon: {
        Args: {
          _codigo: string
          _cycle: string
          _despacho: string
          _plan_id: string
        }
        Returns: {
          cupon_id: string
          motivo: string
          porcentaje: number
          valido: boolean
        }[]
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "despacho"
        | "contador"
        | "auxiliar"
        | "cliente_final"
        | "colaborador"
      workflow_run_status:
        | "pendiente"
        | "corriendo"
        | "exito"
        | "fallido"
        | "parcial"
        | "cancelado"
      workflow_status: "activo" | "pausado" | "borrador" | "archivado"
      workflow_step_status:
        | "pendiente"
        | "corriendo"
        | "exito"
        | "fallido"
        | "omitido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "despacho",
        "contador",
        "auxiliar",
        "cliente_final",
        "colaborador",
      ],
      workflow_run_status: [
        "pendiente",
        "corriendo",
        "exito",
        "fallido",
        "parcial",
        "cancelado",
      ],
      workflow_status: ["activo", "pausado", "borrador", "archivado"],
      workflow_step_status: [
        "pendiente",
        "corriendo",
        "exito",
        "fallido",
        "omitido",
      ],
    },
  },
} as const
