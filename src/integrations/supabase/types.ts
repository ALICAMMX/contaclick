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
      alertas: {
        Row: {
          accion_sugerida: string | null
          cliente_id: string | null
          created_at: string
          descripcion: string | null
          despacho_id: string
          estatus: string
          evidencia: Json | null
          id: string
          nivel: string
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
          despacho_id: string
          estatus?: string
          evidencia?: Json | null
          id?: string
          nivel: string
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
          despacho_id?: string
          estatus?: string
          evidencia?: Json | null
          id?: string
          nivel?: string
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
      clientes: {
        Row: {
          created_at: string
          despacho_id: string | null
          email: string | null
          estado_mes: string | null
          id: string
          notas: string | null
          obligaciones: number
          razon_social: string
          regimen_fiscal: string | null
          rfc: string
          semaforo: string
          telefono: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          despacho_id?: string | null
          email?: string | null
          estado_mes?: string | null
          id?: string
          notas?: string | null
          obligaciones?: number
          razon_social: string
          regimen_fiscal?: string | null
          rfc: string
          semaforo?: string
          telefono?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          despacho_id?: string | null
          email?: string | null
          estado_mes?: string | null
          id?: string
          notas?: string | null
          obligaciones?: number
          razon_social?: string
          regimen_fiscal?: string | null
          rfc?: string
          semaforo?: string
          telefono?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
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
        ]
      }
      despachos: {
        Row: {
          created_at: string
          estado: string
          id: string
          nombre: string
          owner_user_id: string
          plan_id: string | null
          rfc_despacho: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: string
          id?: string
          nombre: string
          owner_user_id: string
          plan_id?: string | null
          rfc_despacho?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: string
          id?: string
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
          created_at: string
          created_by: string
          despacho_id: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          despacho_id: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          despacho_id?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
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
      obligaciones_fiscales: {
        Row: {
          clave: string
          created_at: string
          despacho_id: string
          estatus: string
          evidencia_path: string | null
          id: string
          periodicidad: string
          proximo_vencimiento: string | null
          rfc_id: string
          updated_at: string
        }
        Insert: {
          clave: string
          created_at?: string
          despacho_id: string
          estatus?: string
          evidencia_path?: string | null
          id?: string
          periodicidad: string
          proximo_vencimiento?: string | null
          rfc_id: string
          updated_at?: string
        }
        Update: {
          clave?: string
          created_at?: string
          despacho_id?: string
          estatus?: string
          evidencia_path?: string | null
          id?: string
          periodicidad?: string
          proximo_vencimiento?: string | null
          rfc_id?: string
          updated_at?: string
        }
        Relationships: [
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
      sat_credenciales: {
        Row: {
          cliente_id: string
          created_at: string
          despacho_id: string
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
      tareas: {
        Row: {
          asignado_a: string | null
          cliente_id: string | null
          created_at: string
          descripcion: string | null
          despacho_id: string
          due_date: string | null
          estatus: string
          id: string
          origen: string | null
          origen_id: string | null
          prioridad: string
          titulo: string
          updated_at: string
        }
        Insert: {
          asignado_a?: string | null
          cliente_id?: string | null
          created_at?: string
          descripcion?: string | null
          despacho_id: string
          due_date?: string | null
          estatus?: string
          id?: string
          origen?: string | null
          origen_id?: string | null
          prioridad?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          asignado_a?: string | null
          cliente_id?: string | null
          created_at?: string
          descripcion?: string | null
          despacho_id?: string
          due_date?: string | null
          estatus?: string
          id?: string
          origen?: string | null
          origen_id?: string | null
          prioridad?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      has_role: {
        Args: {
          _cliente?: string
          _despacho?: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_member_of: { Args: { _despacho: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "despacho"
        | "contador"
        | "auxiliar"
        | "cliente_final"
        | "colaborador"
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
    },
  },
} as const
