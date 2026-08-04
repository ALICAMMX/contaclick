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
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          cliente_id: string
          codigo: string
          created_at: string
          created_by: string | null
          despacho_id: string
          id: string
          naturaleza: string
          nombre: string
          tipo_sat: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          cliente_id: string
          codigo: string
          created_at?: string
          created_by?: string | null
          despacho_id: string
          id?: string
          naturaleza: string
          nombre: string
          tipo_sat?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          cliente_id?: string
          codigo?: string
          created_at?: string
          created_by?: string | null
          despacho_id?: string
          id?: string
          naturaleza?: string
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
      cfdi_conceptos: {
        Row: {
          cantidad: number | null
          cfdi_id: string
          clave_prod_serv: string | null
          descripcion: string | null
          descuento: number | null
          id: string
          importe: number | null
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
      cfdi_xml: {
        Row: {
          archivo_hash: string
          archivo_path: string | null
          cliente_id: string
          descuento: number
          despacho_id: string
          estatus_sat: string | null
          estatus_sat_check_at: string | null
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
          nombre_emisor: string | null
          nombre_receptor: string | null
          rfc_emisor: string
          rfc_id: string
          rfc_receptor: string
          subtotal: number
          tipo_cambio: number | null
          tipo_cfdi: string
          total: number
          uso_cfdi: string | null
          uuid: string
          version: string
        }
        Insert: {
          archivo_hash: string
          archivo_path?: string | null
          cliente_id: string
          descuento?: number
          despacho_id: string
          estatus_sat?: string | null
          estatus_sat_check_at?: string | null
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
          nombre_emisor?: string | null
          nombre_receptor?: string | null
          rfc_emisor: string
          rfc_id: string
          rfc_receptor: string
          subtotal?: number
          tipo_cambio?: number | null
          tipo_cfdi: string
          total?: number
          uso_cfdi?: string | null
          uuid: string
          version?: string
        }
        Update: {
          archivo_hash?: string
          archivo_path?: string | null
          cliente_id?: string
          descuento?: number
          despacho_id?: string
          estatus_sat?: string | null
          estatus_sat_check_at?: string | null
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
          nombre_emisor?: string | null
          nombre_receptor?: string | null
          rfc_emisor?: string
          rfc_id?: string
          rfc_receptor?: string
          subtotal?: number
          tipo_cambio?: number | null
          tipo_cfdi?: string
          total?: number
          uso_cfdi?: string | null
          uuid?: string
          version?: string
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
          cfdi_id: string | null
          cliente_id: string
          confirmado_at: string | null
          confirmado_por: string | null
          created_at: string
          despacho_id: string
          diferencia: number | null
          estatus: string
          id: string
          motivo: string | null
          movimiento_id: string | null
          probabilidad: number | null
          tipo_match: string
        }
        Insert: {
          cfdi_id?: string | null
          cliente_id: string
          confirmado_at?: string | null
          confirmado_por?: string | null
          created_at?: string
          despacho_id: string
          diferencia?: number | null
          estatus?: string
          id?: string
          motivo?: string | null
          movimiento_id?: string | null
          probabilidad?: number | null
          tipo_match: string
        }
        Update: {
          cfdi_id?: string | null
          cliente_id?: string
          confirmado_at?: string | null
          confirmado_por?: string | null
          created_at?: string
          despacho_id?: string
          diferencia?: number | null
          estatus?: string
          id?: string
          motivo?: string | null
          movimiento_id?: string | null
          probabilidad?: number | null
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
            foreignKeyName: "conciliaciones_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
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
          fecha: string
          hash: string
          id: string
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
          fecha: string
          hash: string
          id?: string
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
          fecha?: string
          hash?: string
          id?: string
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
      polizas: {
        Row: {
          cfdi_id: string | null
          cliente_id: string
          concepto: string | null
          created_at: string
          created_by: string | null
          cuenta: string | null
          despacho_id: string
          estado: string
          fecha: string
          id: string
          metadata: Json
          monto: number
          movimiento_bancario_id: string | null
          origen: string
          referencia: string | null
          tipo: string
          updated_at: string
          uuid_cfdi: string | null
        }
        Insert: {
          cfdi_id?: string | null
          cliente_id: string
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          cuenta?: string | null
          despacho_id: string
          estado?: string
          fecha: string
          id?: string
          metadata?: Json
          monto?: number
          movimiento_bancario_id?: string | null
          origen?: string
          referencia?: string | null
          tipo: string
          updated_at?: string
          uuid_cfdi?: string | null
        }
        Update: {
          cfdi_id?: string | null
          cliente_id?: string
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          cuenta?: string | null
          despacho_id?: string
          estado?: string
          fecha?: string
          id?: string
          metadata?: Json
          monto?: number
          movimiento_bancario_id?: string | null
          origen?: string
          referencia?: string | null
          tipo?: string
          updated_at?: string
          uuid_cfdi?: string | null
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
        }
        Insert: {
          cliente_id: string
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
        }
        Update: {
          cliente_id?: string
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
      sat_sync_config: {
        Row: {
          activo: boolean
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
          proxima_corrida_at: string | null
          recibidos: boolean
          retenciones: boolean
          ultima_corrida_at: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
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
          proxima_corrida_at?: string | null
          recibidos?: boolean
          retenciones?: boolean
          ultima_corrida_at?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
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
          cancelados: number
          cliente_id: string
          descargados: number
          desde: string | null
          despacho_id: string
          detalle: string | null
          duplicados: number
          duracion_ms: number | null
          errores: Json
          estatus: string
          finalizado_at: string | null
          hasta: string | null
          id: string
          iniciado_at: string
          nuevos: number
          origen: string
          proveedor: string
          solicitudes: Json
          tipo: string
          triggered_by: string | null
        }
        Insert: {
          cancelados?: number
          cliente_id: string
          descargados?: number
          desde?: string | null
          despacho_id: string
          detalle?: string | null
          duplicados?: number
          duracion_ms?: number | null
          errores?: Json
          estatus?: string
          finalizado_at?: string | null
          hasta?: string | null
          id?: string
          iniciado_at?: string
          nuevos?: number
          origen?: string
          proveedor?: string
          solicitudes?: Json
          tipo?: string
          triggered_by?: string | null
        }
        Update: {
          cancelados?: number
          cliente_id?: string
          descargados?: number
          desde?: string | null
          despacho_id?: string
          detalle?: string | null
          duplicados?: number
          duracion_ms?: number | null
          errores?: Json
          estatus?: string
          finalizado_at?: string | null
          hasta?: string | null
          id?: string
          iniciado_at?: string
          nuevos?: number
          origen?: string
          proveedor?: string
          solicitudes?: Json
          tipo?: string
          triggered_by?: string | null
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
      check_rate_limit: {
        Args: { _bucket: string; _max: number; _window_seconds: number }
        Returns: {
          allowed: boolean
          current_count: number
          reset_at: string
        }[]
      }
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
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
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
