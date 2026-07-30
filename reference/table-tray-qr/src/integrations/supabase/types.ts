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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_invitations: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          role: string
          token: string
          used_at: string | null
          used_by_member_id: string | null
          zone: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          role?: string
          token?: string
          used_at?: string | null
          used_by_member_id?: string | null
          zone?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          role?: string
          token?: string
          used_at?: string | null
          used_by_member_id?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backoffice_invitations_used_by_member_id_fkey"
            columns: ["used_by_member_id"]
            isOneToOne: false
            referencedRelation: "backoffice_members"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_members: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          last_access_at: string | null
          name: string
          phone: string | null
          role: string
          user_id: string | null
          zone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_access_at?: string | null
          name: string
          phone?: string | null
          role?: string
          user_id?: string | null
          zone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_access_at?: string | null
          name?: string
          phone?: string | null
          role?: string
          user_id?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      bill_requests: {
        Row: {
          attended_at: string | null
          branch_id: string
          id: string
          requested_at: string | null
          session_id: string
          status: string | null
          table_id: string
          tenant_id: string
          tip_amount: number | null
          tip_percentage: number | null
          total_amount: number
        }
        Insert: {
          attended_at?: string | null
          branch_id: string
          id?: string
          requested_at?: string | null
          session_id: string
          status?: string | null
          table_id: string
          tenant_id: string
          tip_amount?: number | null
          tip_percentage?: number | null
          total_amount: number
        }
        Update: {
          attended_at?: string | null
          branch_id?: string
          id?: string
          requested_at?: string | null
          session_id?: string
          status?: string | null
          table_id?: string
          tenant_id?: string
          tip_amount?: number | null
          tip_percentage?: number | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          id: string
          is_open: boolean | null
          name: string
          opening_hours: Json | null
          phone: string | null
          restaurant_id: string
          tenant_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          is_open?: boolean | null
          name: string
          opening_hours?: Json | null
          phone?: string | null
          restaurant_id: string
          tenant_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          is_open?: boolean | null
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          restaurant_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          available_days: number[] | null
          available_from: string | null
          available_until: string | null
          created_at: string | null
          description: string | null
          emoji: string | null
          id: string
          is_visible: boolean | null
          menu_id: string
          name: string
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          available_days?: number[] | null
          available_from?: string | null
          available_until?: string | null
          created_at?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_visible?: boolean | null
          menu_id: string
          name: string
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          available_days?: number[] | null
          available_from?: string | null
          available_until?: string | null
          created_at?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_visible?: boolean | null
          menu_id?: string
          name?: string
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string | null
          default_enabled: boolean | null
          description: string | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string | null
          default_enabled?: boolean | null
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string | null
          default_enabled?: boolean | null
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          lead_id: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          lead_id: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          lead_id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          assigned_seller_id: string | null
          converted_tenant_id: string | null
          created_at: string | null
          demo_date: string | null
          email: string | null
          id: string
          lost_reason: string | null
          monthly_value: number | null
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          owner_name: string | null
          phone: string | null
          pilot_end_date: string | null
          pilot_start_date: string | null
          restaurant_name: string
          source: string | null
          stage: string
          temperature: string | null
          updated_at: string | null
          zone: string | null
        }
        Insert: {
          address?: string | null
          assigned_seller_id?: string | null
          converted_tenant_id?: string | null
          created_at?: string | null
          demo_date?: string | null
          email?: string | null
          id?: string
          lost_reason?: string | null
          monthly_value?: number | null
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          owner_name?: string | null
          phone?: string | null
          pilot_end_date?: string | null
          pilot_start_date?: string | null
          restaurant_name: string
          source?: string | null
          stage?: string
          temperature?: string | null
          updated_at?: string | null
          zone?: string | null
        }
        Update: {
          address?: string | null
          assigned_seller_id?: string | null
          converted_tenant_id?: string | null
          created_at?: string | null
          demo_date?: string | null
          email?: string | null
          id?: string
          lost_reason?: string | null
          monthly_value?: number | null
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          owner_name?: string | null
          phone?: string | null
          pilot_end_date?: string | null
          pilot_start_date?: string | null
          restaurant_name?: string
          source?: string | null
          stage?: string
          temperature?: string | null
          updated_at?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_seller_id_fkey"
            columns: ["assigned_seller_id"]
            isOneToOne: false
            referencedRelation: "backoffice_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[] | null
          category_id: string
          cost_price: number | null
          created_at: string | null
          description_long: string | null
          description_short: string | null
          id: string
          image_is_real: boolean | null
          image_url: string | null
          labels: string[] | null
          name: string
          prep_time_minutes: number | null
          price: number
          sort_order: number | null
          status: string | null
          tenant_id: string
          total_orders: number | null
          updated_at: string | null
        }
        Insert: {
          allergens?: string[] | null
          category_id: string
          cost_price?: number | null
          created_at?: string | null
          description_long?: string | null
          description_short?: string | null
          id?: string
          image_is_real?: boolean | null
          image_url?: string | null
          labels?: string[] | null
          name: string
          prep_time_minutes?: number | null
          price: number
          sort_order?: number | null
          status?: string | null
          tenant_id: string
          total_orders?: number | null
          updated_at?: string | null
        }
        Update: {
          allergens?: string[] | null
          category_id?: string
          cost_price?: number | null
          created_at?: string | null
          description_long?: string | null
          description_short?: string | null
          id?: string
          image_is_real?: boolean | null
          image_url?: string | null
          labels?: string[] | null
          name?: string
          prep_time_minutes?: number | null
          price?: number
          sort_order?: number | null
          status?: string | null
          tenant_id?: string
          total_orders?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          id: string
          max_selections: number | null
          menu_item_id: string
          min_selections: number | null
          name: string
          required: boolean | null
          sort_order: number | null
          tenant_id: string
          type: string
        }
        Insert: {
          id?: string
          max_selections?: number | null
          menu_item_id: string
          min_selections?: number | null
          name: string
          required?: boolean | null
          sort_order?: number | null
          tenant_id: string
          type: string
        }
        Update: {
          id?: string
          max_selections?: number | null
          menu_item_id?: string
          min_selections?: number | null
          name?: string
          required?: boolean | null
          sort_order?: number | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifiers: {
        Row: {
          extra_price: number | null
          group_id: string
          id: string
          is_available: boolean | null
          name: string
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          extra_price?: number | null
          group_id: string
          id?: string
          is_available?: boolean | null
          name: string
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          extra_price?: number | null
          group_id?: string
          id?: string
          is_available?: boolean | null
          name?: string
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          item_notes: string | null
          menu_item_id: string
          menu_item_name: string
          order_id: string
          quantity: number
          selected_modifiers: Json | null
          subtotal: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_notes?: string | null
          menu_item_id: string
          menu_item_name: string
          order_id: string
          quantity?: number
          selected_modifiers?: Json | null
          subtotal: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          item_notes?: string | null
          menu_item_id?: string
          menu_item_name?: string
          order_id?: string
          quantity?: number
          selected_modifiers?: Json | null
          subtotal?: number
          tenant_id?: string
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
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: string
          cancelled_reason: string | null
          confirmed_at: string | null
          created_at: string | null
          delivered_at: string | null
          id: string
          kitchen_accepted_at: string | null
          notes: string | null
          order_number: number
          ready_at: string | null
          session_id: string
          source: string | null
          status: string | null
          table_id: string
          tenant_id: string
          total_amount: number
        }
        Insert: {
          branch_id: string
          cancelled_reason?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          kitchen_accepted_at?: string | null
          notes?: string | null
          order_number: number
          ready_at?: string | null
          session_id: string
          source?: string | null
          status?: string | null
          table_id: string
          tenant_id: string
          total_amount: number
        }
        Update: {
          branch_id?: string
          cancelled_reason?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          kitchen_accepted_at?: string | null
          notes?: string | null
          order_number?: number
          ready_at?: string | null
          session_id?: string
          source?: string | null
          status?: string | null
          table_id?: string
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          display_name: string
          features: Json
          id: string
          is_active: boolean | null
          max_tables: number
          name: string
        }
        Insert: {
          created_at?: string | null
          display_name: string
          features?: Json
          id?: string
          is_active?: boolean | null
          max_tables?: number
          name: string
        }
        Update: {
          created_at?: string | null
          display_name?: string
          features?: Json
          id?: string
          is_active?: boolean | null
          max_tables?: number
          name?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          created_at: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_goals: {
        Row: {
          closes_goal: number | null
          commission_per_close: number | null
          created_at: string | null
          demos_goal: number | null
          id: string
          period: string
          pilots_goal: number | null
          seller_id: string
          visits_goal: number | null
        }
        Insert: {
          closes_goal?: number | null
          commission_per_close?: number | null
          created_at?: string | null
          demos_goal?: number | null
          id?: string
          period: string
          pilots_goal?: number | null
          seller_id: string
          visits_goal?: number | null
        }
        Update: {
          closes_goal?: number | null
          commission_per_close?: number | null
          created_at?: string | null
          demos_goal?: number | null
          id?: string
          period?: string
          pilots_goal?: number | null
          seller_id?: string
          visits_goal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_goals_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "backoffice_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          branch_id: string
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          role: string
          tenant_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          role?: string
          tenant_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          role?: string
          tenant_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_users: {
        Row: {
          auth_user_id: string | null
          branch_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          pin: string | null
          role: string
          tenant_id: string
        }
        Insert: {
          auth_user_id?: string | null
          branch_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          pin?: string | null
          role: string
          tenant_id: string
        }
        Update: {
          auth_user_id?: string | null
          branch_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          pin?: string | null
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          message: string
          priority: string
          status: string
          subject: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          priority?: string
          status?: string
          subject: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          priority?: string
          status?: string
          subject?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          branch_id: string
          closed_at: string | null
          id: string
          is_active: boolean | null
          opened_at: string | null
          rating: number | null
          table_id: string
          tenant_id: string
          tip_amount: number | null
          total_amount: number | null
        }
        Insert: {
          branch_id: string
          closed_at?: string | null
          id?: string
          is_active?: boolean | null
          opened_at?: string | null
          rating?: number | null
          table_id: string
          tenant_id: string
          tip_amount?: number | null
          total_amount?: number | null
        }
        Update: {
          branch_id?: string
          closed_at?: string | null
          id?: string
          is_active?: boolean | null
          opened_at?: string | null
          rating?: number | null
          table_id?: string
          tenant_id?: string
          tip_amount?: number | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          assigned_waiter_id: string | null
          branch_id: string
          capacity: number | null
          created_at: string | null
          id: string
          name: string | null
          number: number
          position_x: number | null
          position_y: number | null
          qr_token: string
          status: string | null
          tenant_id: string
          zone: string | null
        }
        Insert: {
          assigned_waiter_id?: string | null
          branch_id: string
          capacity?: number | null
          created_at?: string | null
          id?: string
          name?: string | null
          number: number
          position_x?: number | null
          position_y?: number | null
          qr_token: string
          status?: string | null
          tenant_id: string
          zone?: string | null
        }
        Update: {
          assigned_waiter_id?: string | null
          branch_id?: string
          capacity?: number | null
          created_at?: string | null
          id?: string
          name?: string | null
          number?: number
          position_x?: number | null
          position_y?: number | null
          qr_token?: string
          status?: string | null
          tenant_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_assigned_waiter_id_fkey"
            columns: ["assigned_waiter_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_flags: {
        Row: {
          flag_key: string
          is_enabled: boolean | null
          tenant_id: string
        }
        Insert: {
          flag_key: string
          is_enabled?: boolean | null
          tenant_id: string
        }
        Update: {
          flag_key?: string
          is_enabled?: boolean | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          branch_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
          plan_id: string | null
          plan_status: string | null
          primary_color: string | null
          rut: string | null
          secondary_color: string | null
          slug: string
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string | null
          welcome_message: string | null
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          phone?: string | null
          plan_id?: string | null
          plan_status?: string | null
          primary_color?: string | null
          rut?: string | null
          secondary_color?: string | null
          slug: string
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan_id?: string | null
          plan_status?: string | null
          primary_color?: string | null
          rut?: string | null
          secondary_color?: string | null
          slug?: string
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      waiter_calls: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          reason: string | null
          session_id: string | null
          status: string | null
          table_id: string
          tenant_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          reason?: string | null
          session_id?: string | null
          status?: string | null
          table_id: string
          tenant_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          reason?: string | null
          session_id?: string | null
          status?: string | null
          table_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiter_calls_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_tenant_id: { Args: never; Returns: string }
      has_backoffice_role: {
        Args: { _role: string; _user_id: string }
        Returns: boolean
      }
      has_staff_role: {
        Args: { _role: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
