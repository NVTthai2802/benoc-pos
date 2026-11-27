// Kiểu dữ liệu sinh tự động từ Supabase Product (bảng, view, hàm RPC). Sinh lại khi đổi cấu trúc cơ sở dữ liệu.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bank_txns: {
        Row: {
          amount: number
          content: string | null
          created_at: string
          device: string | null
          id: number
          note: string | null
          order_id: string | null
          pay_code: string | null
          ref: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sale_id: string | null
          sepay_id: number | null
          src: string
          src_hash: string | null
          status: string
          txn_at: string | null
        }
        Insert: {
          amount: number
          content?: string | null
          created_at?: string
          device?: string | null
          id?: number
          note?: string | null
          order_id?: string | null
          pay_code?: string | null
          ref?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sale_id?: string | null
          sepay_id?: number | null
          src?: string
          src_hash?: string | null
          status?: string
          txn_at?: string | null
        }
        Update: {
          amount?: number
          content?: string | null
          created_at?: string
          device?: string | null
          id?: number
          note?: string | null
          order_id?: string | null
          pay_code?: string | null
          ref?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sale_id?: string | null
          sepay_id?: number | null
          src?: string
          src_hash?: string | null
          status?: string
          txn_at?: string | null
        }
        Relationships: []
      }
      bot_photos: {
        Row: {
          caption: string | null
          chat_id: string
          created_at: string
          done: boolean
          id: number
          kenh: string
          ref: string
        }
        Insert: {
          caption?: string | null
          chat_id: string
          created_at?: string
          done?: boolean
          id?: number
          kenh: string
          ref: string
        }
        Update: {
          caption?: string | null
          chat_id?: string
          created_at?: string
          done?: boolean
          id?: number
          kenh?: string
          ref?: string
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          chat_id: string
          created_at: string
          kenh: string
          name: string | null
        }
        Insert: {
          chat_id: string
          created_at?: string
          kenh: string
          name?: string | null
        }
        Update: {
          chat_id?: string
          created_at?: string
          kenh?: string
          name?: string | null
        }
        Relationships: []
      }
      chat_captures: {
        Row: {
          ai_error: string | null
          ai_json: Json | null
          ai_model: string | null
          ai_ms: number | null
          ai_text: string | null
          created_at: string
          device: string | null
          id: number
          image_bytes: number | null
          image_path: string
          image_sha256: string
          image_type: string | null
          ios_text: string | null
          label_json: Json | null
          note: string | null
          source: string
          status: string
        }
        Insert: {
          ai_error?: string | null
          ai_json?: Json | null
          ai_model?: string | null
          ai_ms?: number | null
          ai_text?: string | null
          created_at?: string
          device?: string | null
          id?: never
          image_bytes?: number | null
          image_path: string
          image_sha256: string
          image_type?: string | null
          ios_text?: string | null
          label_json?: Json | null
          note?: string | null
          source?: string
          status?: string
        }
        Update: {
          ai_error?: string | null
          ai_json?: Json | null
          ai_model?: string | null
          ai_ms?: number | null
          ai_text?: string | null
          created_at?: string
          device?: string | null
          id?: never
          image_bytes?: number | null
          image_path?: string
          image_sha256?: string
          image_type?: string | null
          ios_text?: string | null
          label_json?: Json | null
          note?: string | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          auth_user_id: string | null
          created_at: string
          full_name: string
          hourly_rate: number
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          full_name: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          full_name?: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: []
      }
      fb_drafts: {
        Row: {
          address: string | null
          anh: string[]
          approved_at: string | null
          approved_by: string | null
          asked: string[]
          at: string | null
          changed_after: boolean
          chat_id: string | null
          convo: Json
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          dine_type: string | null
          id: string
          items: Json
          kenh: string
          missing: string[]
          nguoi_gui: string | null
          note: string | null
          order_id: string | null
          psid: string | null
          status: string
          total_est: number
          unknown: Json
          updated_at: string
        }
        Insert: {
          address?: string | null
          anh?: string[]
          approved_at?: string | null
          approved_by?: string | null
          asked?: string[]
          at?: string | null
          changed_after?: boolean
          chat_id?: string | null
          convo?: Json
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          dine_type?: string | null
          id?: string
          items?: Json
          kenh?: string
          missing?: string[]
          nguoi_gui?: string | null
          note?: string | null
          order_id?: string | null
          psid?: string | null
          status?: string
          total_est?: number
          unknown?: Json
          updated_at?: string
        }
        Update: {
          address?: string | null
          anh?: string[]
          approved_at?: string | null
          approved_by?: string | null
          asked?: string[]
          at?: string | null
          changed_after?: boolean
          chat_id?: string | null
          convo?: Json
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          dine_type?: string | null
          id?: string
          items?: Json
          kenh?: string
          missing?: string[]
          nguoi_gui?: string | null
          note?: string | null
          order_id?: string | null
          psid?: string | null
          status?: string
          total_est?: number
          unknown?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fb_drafts_psid_fkey"
            columns: ["psid"]
            isOneToOne: false
            referencedRelation: "fb_threads"
            referencedColumns: ["psid"]
          },
        ]
      }
      fb_messages: {
        Row: {
          created_at: string
          id: number
          mid: string | null
          psid: string
          sender: string
          text: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          mid?: string | null
          psid: string
          sender: string
          text?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          mid?: string | null
          psid?: string
          sender?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fb_messages_psid_fkey"
            columns: ["psid"]
            isOneToOne: false
            referencedRelation: "fb_threads"
            referencedColumns: ["psid"]
          },
        ]
      }
      fb_threads: {
        Row: {
          created_at: string
          last_at: string
          link: string | null
          name: string | null
          need_human: boolean
          paused_until: string | null
          psid: string
        }
        Insert: {
          created_at?: string
          last_at?: string
          link?: string | null
          name?: string | null
          need_human?: boolean
          paused_until?: string | null
          psid: string
        }
        Update: {
          created_at?: string
          last_at?: string
          link?: string | null
          name?: string | null
          need_human?: boolean
          paused_until?: string | null
          psid?: string
        }
        Relationships: []
      }
      fb_train: {
        Row: {
          answer: string | null
          convo: Json
          created_at: string
          draft_id: string | null
          edits: string[] | null
          final: Json | null
          id: number
          intent: string | null
          menu_hash: string | null
          model: string | null
          now_vn: string
          outcome: string
          state_before: Json
          target: Json | null
          thread_hash: string
        }
        Insert: {
          answer?: string | null
          convo?: Json
          created_at?: string
          draft_id?: string | null
          edits?: string[] | null
          final?: Json | null
          id?: number
          intent?: string | null
          menu_hash?: string | null
          model?: string | null
          now_vn: string
          outcome?: string
          state_before?: Json
          target?: Json | null
          thread_hash: string
        }
        Update: {
          answer?: string | null
          convo?: Json
          created_at?: string
          draft_id?: string | null
          edits?: string[] | null
          final?: Json | null
          id?: number
          intent?: string | null
          menu_hash?: string | null
          model?: string | null
          now_vn?: string
          outcome?: string
          state_before?: Json
          target?: Json | null
          thread_hash?: string
        }
        Relationships: []
      }
      fb_train_menu: {
        Row: {
          created_at: string
          hash: string
          menu: Json
        }
        Insert: {
          created_at?: string
          hash: string
          menu: Json
        }
        Update: {
          created_at?: string
          hash?: string
          menu?: Json
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          color: string
          id: number
          name: string
          sort_order: number
          station: string
        }
        Insert: {
          color?: string
          id?: number
          name: string
          sort_order?: number
          station?: string
        }
        Update: {
          color?: string
          id?: number
          name?: string
          sort_order?: number
          station?: string
        }
        Relationships: []
      }
      menu_item_option_groups: {
        Row: {
          group_id: number
          menu_item_id: string
          sort_order: number
        }
        Insert: {
          group_id: number
          menu_item_id: string
          sort_order?: number
        }
        Update: {
          group_id?: number
          menu_item_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_option_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_option_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: number | null
          description: string | null
          id: string
          image_path: string | null
          is_available: boolean
          name: string
          prep_minutes: number
          price: number
          sort_order: number
          tag: string | null
        }
        Insert: {
          category_id?: number | null
          description?: string | null
          id?: string
          image_path?: string | null
          is_available?: boolean
          name: string
          prep_minutes?: number
          price: number
          sort_order?: number
          tag?: string | null
        }
        Update: {
          category_id?: number | null
          description?: string | null
          id?: string
          image_path?: string | null
          is_available?: boolean
          name?: string
          prep_minutes?: number
          price?: number
          sort_order?: number
          tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_samples: {
        Row: {
          active_orders: number | null
          at: string
          auth_ms: number | null
          auth_ok: boolean | null
          cache_hit: number | null
          colo: string | null
          conns: number | null
          conns_max: number | null
          db_bytes: number | null
          deadlocks: number | null
          locks: number | null
          long_q: number | null
          rest_ms: number | null
          rest_ok: boolean | null
          rpc_ms: number | null
          site_ms: number | null
          site_ok: boolean | null
          stale_orders: number | null
          storage_ms: number | null
          storage_ok: boolean | null
          xact_commit: number | null
        }
        Insert: {
          active_orders?: number | null
          at?: string
          auth_ms?: number | null
          auth_ok?: boolean | null
          cache_hit?: number | null
          colo?: string | null
          conns?: number | null
          conns_max?: number | null
          db_bytes?: number | null
          deadlocks?: number | null
          locks?: number | null
          long_q?: number | null
          rest_ms?: number | null
          rest_ok?: boolean | null
          rpc_ms?: number | null
          site_ms?: number | null
          site_ok?: boolean | null
          stale_orders?: number | null
          storage_ms?: number | null
          storage_ok?: boolean | null
          xact_commit?: number | null
        }
        Update: {
          active_orders?: number | null
          at?: string
          auth_ms?: number | null
          auth_ok?: boolean | null
          cache_hit?: number | null
          colo?: string | null
          conns?: number | null
          conns_max?: number | null
          db_bytes?: number | null
          deadlocks?: number | null
          locks?: number | null
          long_q?: number | null
          rest_ms?: number | null
          rest_ok?: boolean | null
          rpc_ms?: number | null
          site_ms?: number | null
          site_ok?: boolean | null
          stale_orders?: number | null
          storage_ms?: number | null
          storage_ok?: boolean | null
          xact_commit?: number | null
        }
        Relationships: []
      }
      option_choices: {
        Row: {
          group_id: number
          id: number
          is_available: boolean
          is_default: boolean
          name: string
          price_delta: number
          sort_order: number
        }
        Insert: {
          group_id: number
          id?: number
          is_available?: boolean
          is_default?: boolean
          name: string
          price_delta?: number
          sort_order?: number
        }
        Update: {
          group_id?: number
          id?: number
          is_available?: boolean
          is_default?: boolean
          name?: string
          price_delta?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "option_choices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      option_groups: {
        Row: {
          id: number
          kind: string
          max_select: number
          min_select: number
          name: string
          sort_order: number
          title: string
        }
        Insert: {
          id?: number
          kind?: string
          max_select?: number
          min_select?: number
          name: string
          sort_order?: number
          title: string
        }
        Update: {
          id?: number
          kind?: string
          max_select?: number
          min_select?: number
          name?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      order_changes: {
        Row: {
          by_staff: boolean
          created_at: string
          id: number
          kind: string
          lines: Json
          order_id: string
          token: string | null
        }
        Insert: {
          by_staff?: boolean
          created_at?: string
          id?: number
          kind: string
          lines?: Json
          order_id: string
          token?: string | null
        }
        Update: {
          by_staff?: boolean
          created_at?: string
          id?: number
          kind?: string
          lines?: Json
          order_id?: string
          token?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          added_at: string
          edited_at: string | null
          id: number
          item_name: string
          menu_item_id: string | null
          note: string | null
          options: Json
          order_id: string
          promo_group: string | null
          promo_id: string | null
          promo_kind: string | null
          promo_name: string | null
          promo_part: string | null
          promo_units: number | null
          qty: number
          station: string
          unit_price: number
        }
        Insert: {
          added_at?: string
          edited_at?: string | null
          id?: number
          item_name: string
          menu_item_id?: string | null
          note?: string | null
          options?: Json
          order_id: string
          promo_group?: string | null
          promo_id?: string | null
          promo_kind?: string | null
          promo_name?: string | null
          promo_part?: string | null
          promo_units?: number | null
          qty: number
          station?: string
          unit_price: number
        }
        Update: {
          added_at?: string
          edited_at?: string | null
          id?: number
          item_name?: string
          menu_item_id?: string | null
          note?: string | null
          options?: Json
          order_id?: string
          promo_group?: string | null
          promo_id?: string | null
          promo_kind?: string | null
          promo_name?: string | null
          promo_part?: string | null
          promo_units?: number | null
          qty?: number
          station?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stations: {
        Row: {
          accepted_at: string | null
          estimated_ready_at: string | null
          order_id: string
          served_at: string | null
          station: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          accepted_at?: string | null
          estimated_ready_at?: string | null
          order_id: string
          served_at?: string | null
          station: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          accepted_at?: string | null
          estimated_ready_at?: string | null
          order_id?: string
          served_at?: string | null
          station?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_stations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          access_token: string
          address: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          deliver_at: string | null
          dine_type: string
          estimated_ready_at: string | null
          id: string
          note: string | null
          paid_amount: number | null
          paid_at: string | null
          paid_by: string | null
          paid_method: string | null
          queue_number: number | null
          served_at: string | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          total: number
        }
        Insert: {
          accepted_at?: string | null
          access_token?: string
          address?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          deliver_at?: string | null
          dine_type?: string
          estimated_ready_at?: string | null
          id?: string
          note?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          paid_method?: string | null
          queue_number?: number | null
          served_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
        }
        Update: {
          accepted_at?: string | null
          access_token?: string
          address?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          deliver_at?: string | null
          dine_type?: string
          estimated_ready_at?: string | null
          id?: string
          note?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          paid_method?: string | null
          queue_number?: number | null
          served_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_items: {
        Row: {
          id: number
          menu_item_id: string
          part: string
          promotion_id: string
          qty: number
          sort_order: number
        }
        Insert: {
          id?: number
          menu_item_id: string
          part: string
          promotion_id: string
          qty?: number
          sort_order?: number
        }
        Update: {
          id?: number
          menu_item_id?: string
          part?: string
          promotion_id?: string
          qty?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_items_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          buy_qty: number
          created_at: string
          days: number[] | null
          description: string | null
          dine_types: string[] | null
          end_at: string | null
          get_qty: number
          gift_name: string | null
          gift_same: boolean
          gift_station: string
          id: string
          image_path: string | null
          is_active: boolean
          kind: string
          limit_per: string
          limit_qty: number | null
          min_total: number | null
          name: string
          need_qty: number | null
          option_mode: string
          price: number | null
          sale_mode: string
          sale_value: number | null
          sort_order: number
          start_at: string | null
          time_from: string | null
          time_to: string | null
        }
        Insert: {
          buy_qty?: number
          created_at?: string
          days?: number[] | null
          description?: string | null
          dine_types?: string[] | null
          end_at?: string | null
          get_qty?: number
          gift_name?: string | null
          gift_same?: boolean
          gift_station?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          kind: string
          limit_per?: string
          limit_qty?: number | null
          min_total?: number | null
          name: string
          need_qty?: number | null
          option_mode?: string
          price?: number | null
          sale_mode?: string
          sale_value?: number | null
          sort_order?: number
          start_at?: string | null
          time_from?: string | null
          time_to?: string | null
        }
        Update: {
          buy_qty?: number
          created_at?: string
          days?: number[] | null
          description?: string | null
          dine_types?: string[] | null
          end_at?: string | null
          get_qty?: number
          gift_name?: string | null
          gift_same?: boolean
          gift_station?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          kind?: string
          limit_per?: string
          limit_qty?: number | null
          min_total?: number | null
          name?: string
          need_qty?: number | null
          option_mode?: string
          price?: number | null
          sale_mode?: string
          sale_value?: number | null
          sort_order?: number
          start_at?: string | null
          time_from?: string | null
          time_to?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          accepted_at: string | null
          address: string | null
          bank_txn_id: number | null
          cashier_id: string | null
          cook_minutes: number | null
          customer_name: string | null
          customer_phone: string | null
          dine_type: string
          id: string
          items: Json
          ordered_at: string
          paid_at: string
          paid_real_at: string | null
          payment_method: string
          queue_number: number | null
          served_at: string | null
          source: string
          station_minutes: Json | null
          total: number
        }
        Insert: {
          accepted_at?: string | null
          address?: string | null
          bank_txn_id?: number | null
          cashier_id?: string | null
          cook_minutes?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          dine_type?: string
          id: string
          items: Json
          ordered_at: string
          paid_at?: string
          paid_real_at?: string | null
          payment_method: string
          queue_number?: number | null
          served_at?: string | null
          source?: string
          station_minutes?: Json | null
          total: number
        }
        Update: {
          accepted_at?: string | null
          address?: string | null
          bank_txn_id?: number | null
          cashier_id?: string | null
          cook_minutes?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          dine_type?: string
          id?: string
          items?: Json
          ordered_at?: string
          paid_at?: string
          paid_real_at?: string | null
          payment_method?: string
          queue_number?: number | null
          served_at?: string | null
          source?: string
          station_minutes?: Json | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          actual_minutes: number | null
          check_in_at: string
          check_in_photo: string
          check_out_at: string | null
          check_out_photo: string | null
          employee_id: string
          employee_name: string
          hourly_rate: number
          id: string
          note: string | null
          paid_minutes: number | null
          paid_out_at: string | null
          pay_amount: number | null
          pay_round: number | null
          round_minutes: number | null
          round_mode: string | null
        }
        Insert: {
          actual_minutes?: number | null
          check_in_at?: string
          check_in_photo: string
          check_out_at?: string | null
          check_out_photo?: string | null
          employee_id: string
          employee_name: string
          hourly_rate: number
          id?: string
          note?: string | null
          paid_minutes?: number | null
          paid_out_at?: string | null
          pay_amount?: number | null
          pay_round?: number | null
          round_minutes?: number | null
          round_mode?: string | null
        }
        Update: {
          actual_minutes?: number | null
          check_in_at?: string
          check_in_photo?: string
          check_out_at?: string | null
          check_out_photo?: string | null
          employee_id?: string
          employee_name?: string
          hourly_rate?: number
          id?: string
          note?: string | null
          paid_minutes?: number | null
          paid_out_at?: string | null
          pay_amount?: number | null
          pay_round?: number | null
          round_minutes?: number | null
          round_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          bank_account: string
          bank_bin: string
          bank_holder: string
          bank_name: string
          bank_note: string
          bar_capacity: number
          fb_bot_on: boolean
          fb_close: string
          fb_hello: string | null
          fb_open: string
          fb_train_on: boolean
          id: number
          kitchen_capacity: number
          print_address: string
          print_phone: string
          pay_round: number
          round_minutes: number
          round_mode: string
          shop_name: string
          updated_at: string
        }
        Insert: {
          bank_account?: string
          bank_bin?: string
          bank_holder?: string
          bank_name?: string
          bank_note?: string
          bar_capacity?: number
          fb_bot_on?: boolean
          fb_close?: string
          fb_hello?: string | null
          fb_open?: string
          fb_train_on?: boolean
          id?: number
          kitchen_capacity?: number
          print_address?: string
          print_phone?: string
          pay_round?: number
          round_minutes?: number
          round_mode?: string
          shop_name?: string
          updated_at?: string
        }
        Update: {
          bank_account?: string
          bank_bin?: string
          bank_holder?: string
          bank_name?: string
          bank_note?: string
          bar_capacity?: number
          fb_bot_on?: boolean
          fb_close?: string
          fb_hello?: string | null
          fb_open?: string
          fb_train_on?: boolean
          id?: number
          kitchen_capacity?: number
          print_address?: string
          print_phone?: string
          pay_round?: number
          round_minutes?: number
          round_mode?: string
          shop_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_calls: {
        Row: {
          created_at: string
          id: number
          message: string | null
          order_id: string | null
          queue_number: number | null
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          message?: string | null
          order_id?: string | null
          queue_number?: number | null
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          message?: string | null
          order_id?: string | null
          queue_number?: number | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_calls_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_barcodes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          item_id: string
          unit_kind: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          item_id: string
          unit_kind?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          item_id?: string
          unit_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_barcodes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          buy_unit: string
          cost_per_buy: number | null
          created_at: string
          grp: string | null
          id: string
          is_active: boolean
          min_qty: number
          name: string
          note: string | null
          pack_id: number | null
          per_buy: number
          qty: number
          sort_order: number
          use_unit: string
        }
        Insert: {
          buy_unit?: string
          cost_per_buy?: number | null
          created_at?: string
          grp?: string | null
          id?: string
          is_active?: boolean
          min_qty?: number
          name: string
          note?: string | null
          pack_id?: number | null
          per_buy?: number
          qty?: number
          sort_order?: number
          use_unit?: string
        }
        Update: {
          buy_unit?: string
          cost_per_buy?: number | null
          created_at?: string
          grp?: string | null
          id?: string
          is_active?: boolean
          min_qty?: number
          name?: string
          note?: string | null
          pack_id?: number | null
          per_buy?: number
          qty?: number
          sort_order?: number
          use_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "stock_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_moves: {
        Row: {
          amount: number
          cost: number | null
          created_at: string
          delta: number
          employee_id: string | null
          employee_name: string | null
          id: number
          item_id: string
          kind: string
          note: string | null
          qty_after: number
          receipt_id: number | null
          unit: string
        }
        Insert: {
          amount: number
          cost?: number | null
          created_at?: string
          delta: number
          employee_id?: string | null
          employee_name?: string | null
          id?: number
          item_id: string
          kind: string
          note?: string | null
          qty_after: number
          receipt_id?: number | null
          unit: string
        }
        Update: {
          amount?: number
          cost?: number | null
          created_at?: string
          delta?: number
          employee_id?: string | null
          employee_name?: string | null
          id?: number
          item_id?: string
          kind?: string
          note?: string | null
          qty_after?: number
          receipt_id?: number | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_moves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "stock_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_packs: {
        Row: {
          buy_unit: string
          id: number
          name: string
          per_buy: number
          sort_order: number
          use_unit: string
        }
        Insert: {
          buy_unit: string
          id?: number
          name: string
          per_buy: number
          sort_order?: number
          use_unit: string
        }
        Update: {
          buy_unit?: string
          id?: number
          name?: string
          per_buy?: number
          sort_order?: number
          use_unit?: string
        }
        Relationships: []
      }
      stock_receipts: {
        Row: {
          created_at: string
          employee_id: string | null
          employee_name: string | null
          id: number
          invoice_no: string | null
          note: string | null
          photo_path: string
          supplier: string | null
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: number
          invoice_no?: string | null
          note?: string | null
          photo_path: string
          supplier?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: number
          invoice_no?: string | null
          note?: string | null
          photo_path?: string
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_order: {
        Args: { p_minutes: number; p_order_id: string; p_station?: string }
        Returns: undefined
      }
      apply_rounding: {
        Args: { p_minutes: number; p_mode: string; p_step: number }
        Returns: number
      }
      bank_noti_ingest: { Args: { p: Json; p_key: string }; Returns: Json }
      best_sellers: {
        Args: { p_days?: number }
        Returns: {
          menu_item_id: string
          qty: number
          station: string
        }[]
      }
      bot_dat_don: { Args: { p_draft: string }; Returns: Json }
      bot_don_mo: { Args: { p_order: string }; Returns: boolean }
      bot_huy_don: { Args: { p_draft: string }; Returns: Json }
      bot_link_code: { Args: never; Returns: Json }
      bot_link_use: {
        Args: { p_chat: string; p_code: string; p_kenh: string; p_name: string }
        Returns: boolean
      }
      call_staff: {
        Args: { p_message?: string; p_token: string }
        Returns: undefined
      }
      cancel_order: { Args: { p_order_id: string }; Returns: undefined }
      check_in: { Args: { p_photo: string }; Returns: string }
      check_out: {
        Args: { p_photo: string }
        Returns: {
          actual_minutes: number | null
          check_in_at: string
          check_in_photo: string
          check_out_at: string | null
          check_out_photo: string | null
          employee_id: string
          employee_name: string
          hourly_rate: number
          id: string
          note: string | null
          paid_minutes: number | null
          paid_out_at: string | null
          pay_amount: number | null
          pay_round: number | null
          round_minutes: number | null
          round_mode: string | null
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_owner: {
        Args: { p_full_name: string; p_phone?: string }
        Returns: string
      }
      complete_payment: {
        Args: { p_method: string; p_order_id: string }
        Returns: undefined
      }
      dismiss_bank_txn: { Args: { p_txn: number }; Returns: undefined }
      extend_wait: {
        Args: {
          p_extra_minutes: number
          p_order_id: string
          p_station?: string
        }
        Returns: undefined
      }
      fb_approve: {
        Args: {
          p_address: string
          p_at: string
          p_dine: string
          p_draft: string
          p_items: Json
          p_name: string
          p_note?: string
          p_phone: string
        }
        Returns: Json
      }
      get_menu: { Args: never; Returns: Json }
      get_my_order: { Args: { p_token: string }; Returns: Json }
      get_order_changes: { Args: { p_token: string }; Returns: Json }
      get_payment_info: { Args: never; Returns: Json }
      get_promotions: { Args: never; Returns: Json }
      get_sepay_key: { Args: never; Returns: string }
      has_owner: { Args: never; Returns: boolean }
      health_snapshot: { Args: never; Returns: Json }
      link_bank_txn: { Args: { p_order: string; p_txn: number }; Returns: Json }
      mark_served: {
        Args: { p_order_id: string; p_station?: string }
        Returns: undefined
      }
      monitor_collect: { Args: { p: Json }; Returns: Json }
      monitor_dashboard: { Args: { p_hours?: number }; Returns: Json }
      my_employee_id: { Args: never; Returns: string }
      my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      owner_update_shift: {
        Args: { p_id: string; p_in: string; p_note: string; p_out: string }
        Returns: {
          actual_minutes: number | null
          check_in_at: string
          check_in_photo: string
          check_out_at: string | null
          check_out_photo: string | null
          employee_id: string
          employee_name: string
          hourly_rate: number
          id: string
          note: string | null
          paid_minutes: number | null
          paid_out_at: string | null
          pay_amount: number | null
          pay_round: number | null
          round_minutes: number | null
          round_mode: string | null
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_order: {
        Args: {
          p_address?: string
          p_confirm_duplicate?: boolean
          p_customer_name: string
          p_customer_phone?: string
          p_deliver_at?: string
          p_dine_type?: string
          p_items: Json
          p_note?: string
          p_queue_number: number
        }
        Returns: Json
      }
      promo_live: {
        Args: {
          p: Database["public"]["Tables"]["promotions"]["Row"]
          p_at?: string
        }
        Returns: boolean
      }
      promo_usage: { Args: never; Returns: Json }
      refresh_order_status: { Args: { p_order: string }; Returns: undefined }
      reset_sepay_key: { Args: never; Returns: string }
      round_money: {
        Args: { p_amount: number; p_step: number }
        Returns: number
      }
      staff_add_items: {
        Args: { p_items: Json; p_order_id: string }
        Returns: number
      }
      staff_set_item_options: {
        Args: { p_choice_ids: number[]; p_item_id: number }
        Returns: number
      }
      staff_set_item_qty: {
        Args: { p_item_id: number; p_qty: number }
        Returns: number
      }
      staff_update_order: {
        Args: {
          p_dine_type: string
          p_order_id: string
          p_queue_number?: number
        }
        Returns: Json
      }
      stock_move: {
        Args: {
          p_amount: number
          p_cost?: number
          p_in_buy_unit?: boolean
          p_item: string
          p_kind: string
          p_note?: string
          p_receipt?: number
        }
        Returns: Json
      }
      stock_receipt_add: {
        Args: {
          p_invoice_no?: string
          p_note?: string
          p_path: string
          p_supplier?: string
        }
        Returns: number
      }
      suggest_wait_minutes: {
        Args: { p_order_id: string; p_station?: string }
        Returns: number
      }
      unlink_sale: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: {
      order_status: "cho_nhan" | "dang_lam" | "da_ra_mon"
      staff_role: "owner" | "kitchen" | "staff" | "bar"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      order_status: ["cho_nhan", "dang_lam", "da_ra_mon"],
      staff_role: ["owner", "kitchen", "staff", "bar"],
    },
  },
} as const
