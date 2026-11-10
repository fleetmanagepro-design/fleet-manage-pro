
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id": string | null,"created_at": string,"id": string,"new_data": Json | null,"old_data": Json | null,"organization_id": string,"record_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id"?: string | null,"created_at"?: string,"id"?: string,"new_data"?: Json | null,"old_data"?: Json | null,"organization_id": string,"record_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["audit_action"],"actor_id"?: string | null,"created_at"?: string,"id"?: string,"new_data"?: Json | null,"old_data"?: Json | null,"organization_id"?: string,"record_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_contacts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"customer_id": string,"email": string | null,"id": string,"name": string,"organization_id": string,"phone": string | null,"role": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id": string,"email"?: string | null,"id"?: string,"name": string,"organization_id": string,"phone"?: string | null,"role"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"email"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"phone"?: string | null,"role"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_contacts_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "customer_contacts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "address_line1": string | null,"archived_at": string | null,"archived_by": string | null,"billing_email": string | null,"city": string | null,"created_at": string,"created_by": string | null,"customer_type": Database["public"]['Enums']["customer_type"],"do_not_use_reason": string | null,"id": string,"mc_number": string | null,"name": string,"notes": string | null,"organization_id": string,"payment_terms_days": number,"phone": string | null,"state": string | null,"status": Database["public"]['Enums']["customer_status"],"updated_at": string,"zip": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line1"?: string | null,"archived_at"?: string | null,"archived_by"?: string | null,"billing_email"?: string | null,"city"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_type"?: Database["public"]['Enums']["customer_type"],"do_not_use_reason"?: string | null,"id"?: string,"mc_number"?: string | null,"name": string,"notes"?: string | null,"organization_id": string,"payment_terms_days"?: number,"phone"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["customer_status"],"updated_at"?: string,"zip"?: string | null
                  }
                  Update: {
                    "address_line1"?: string | null,"archived_at"?: string | null,"archived_by"?: string | null,"billing_email"?: string | null,"city"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_type"?: Database["public"]['Enums']["customer_type"],"do_not_use_reason"?: string | null,"id"?: string,"mc_number"?: string | null,"name"?: string,"notes"?: string | null,"organization_id"?: string,"payment_terms_days"?: number,"phone"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["customer_status"],"updated_at"?: string,"zip"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_pay_rules": {
                  Row: {
                    "created_at": string,"created_by": string | null,"detention_pay_cents_per_hour": number,"driver_id": string,"effective_from": string,"flat_cents": number | null,"id": string,"miles_basis": Database["public"]['Enums']["miles_basis"] | null,"notes": string | null,"organization_id": string,"pay_type": Database["public"]['Enums']["pay_type"],"percent": number | null,"percent_basis": Database["public"]['Enums']["percent_basis"] | null,"rate_cents_per_mile": number | null,"stop_pay_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"detention_pay_cents_per_hour"?: number,"driver_id": string,"effective_from": string,"flat_cents"?: number | null,"id"?: string,"miles_basis"?: Database["public"]['Enums']["miles_basis"] | null,"notes"?: string | null,"organization_id": string,"pay_type": Database["public"]['Enums']["pay_type"],"percent"?: number | null,"percent_basis"?: Database["public"]['Enums']["percent_basis"] | null,"rate_cents_per_mile"?: number | null,"stop_pay_cents"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"detention_pay_cents_per_hour"?: number,"driver_id"?: string,"effective_from"?: string,"flat_cents"?: number | null,"id"?: string,"miles_basis"?: Database["public"]['Enums']["miles_basis"] | null,"notes"?: string | null,"organization_id"?: string,"pay_type"?: Database["public"]['Enums']["pay_type"],"percent"?: number | null,"percent_basis"?: Database["public"]['Enums']["percent_basis"] | null,"rate_cents_per_mile"?: number | null,"stop_pay_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_pay_rules_organization_id_driver_id_fkey"
      columns: ["organization_id","driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "driver_pay_rules_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"drivers": {
                  Row: {
                    "archived_at": string | null,"archived_by": string | null,"cdl_class": Database["public"]['Enums']["cdl_class"] | null,"cdl_expires_on": string | null,"cdl_number": string | null,"cdl_state": string | null,"created_at": string,"created_by": string | null,"default_truck_id": string | null,"driver_type": Database["public"]['Enums']["driver_type"],"email": string | null,"emergency_contact_name": string | null,"emergency_contact_phone": string | null,"first_name": string,"hire_date": string | null,"id": string,"last_name": string,"medical_card_expires_on": string | null,"notes": string | null,"organization_id": string,"phone": string | null,"status": Database["public"]['Enums']["driver_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"cdl_class"?: Database["public"]['Enums']["cdl_class"] | null,"cdl_expires_on"?: string | null,"cdl_number"?: string | null,"cdl_state"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_truck_id"?: string | null,"driver_type"?: Database["public"]['Enums']["driver_type"],"email"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"first_name": string,"hire_date"?: string | null,"id"?: string,"last_name": string,"medical_card_expires_on"?: string | null,"notes"?: string | null,"organization_id": string,"phone"?: string | null,"status"?: Database["public"]['Enums']["driver_status"],"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"cdl_class"?: Database["public"]['Enums']["cdl_class"] | null,"cdl_expires_on"?: string | null,"cdl_number"?: string | null,"cdl_state"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_truck_id"?: string | null,"driver_type"?: Database["public"]['Enums']["driver_type"],"email"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"first_name"?: string,"hire_date"?: string | null,"id"?: string,"last_name"?: string,"medical_card_expires_on"?: string | null,"notes"?: string | null,"organization_id"?: string,"phone"?: string | null,"status"?: Database["public"]['Enums']["driver_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drivers_organization_id_default_truck_id_fkey"
      columns: ["organization_id","default_truck_id"]
isOneToOne: false
      referencedRelation: "trucks"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "drivers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"load_accessorials": {
                  Row: {
                    "amount_cents": number,"billable_to_customer": boolean,"created_at": string,"created_by": string | null,"id": string,"load_id": string,"notes": string | null,"organization_id": string,"type": Database["public"]['Enums']["accessorial_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"billable_to_customer"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"load_id": string,"notes"?: string | null,"organization_id": string,"type": Database["public"]['Enums']["accessorial_type"]
                  }
                  Update: {
                    "amount_cents"?: number,"billable_to_customer"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"load_id"?: string,"notes"?: string | null,"organization_id"?: string,"type"?: Database["public"]['Enums']["accessorial_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "load_accessorials_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "load_accessorials_organization_id_load_id_fkey"
      columns: ["organization_id","load_id"]
isOneToOne: false
      referencedRelation: "loads"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"load_drivers": {
                  Row: {
                    "created_at": string,"driver_id": string,"is_primary": boolean,"load_id": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"driver_id": string,"is_primary"?: boolean,"load_id": string,"organization_id": string
                  }
                  Update: {
                    "created_at"?: string,"driver_id"?: string,"is_primary"?: boolean,"load_id"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "load_drivers_organization_id_driver_id_fkey"
      columns: ["organization_id","driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "load_drivers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "load_drivers_organization_id_load_id_fkey"
      columns: ["organization_id","load_id"]
isOneToOne: false
      referencedRelation: "loads"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"load_events": {
                  Row: {
                    "created_at": string,"created_by": string | null,"from_status": Database["public"]['Enums']["load_status"] | null,"id": string,"kind": Database["public"]['Enums']["load_event_kind"],"load_id": string,"organization_id": string,"reason": string | null,"to_status": Database["public"]['Enums']["load_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"from_status"?: Database["public"]['Enums']["load_status"] | null,"id"?: string,"kind"?: Database["public"]['Enums']["load_event_kind"],"load_id": string,"organization_id": string,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["load_status"] | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"from_status"?: Database["public"]['Enums']["load_status"] | null,"id"?: string,"kind"?: Database["public"]['Enums']["load_event_kind"],"load_id"?: string,"organization_id"?: string,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["load_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "load_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "load_events_organization_id_load_id_fkey"
      columns: ["organization_id","load_id"]
isOneToOne: false
      referencedRelation: "loads"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"load_stops": {
                  Row: {
                    "address_line1": string | null,"appointment_end": string | null,"appointment_start": string | null,"arrived_at": string | null,"city": string,"created_at": string,"departed_at": string | null,"facility_name": string | null,"id": string,"load_id": string,"notes": string | null,"organization_id": string,"sequence": number,"state": string,"stop_type": Database["public"]['Enums']["stop_type"],"timezone": string,"updated_at": string,"zip": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line1"?: string | null,"appointment_end"?: string | null,"appointment_start"?: string | null,"arrived_at"?: string | null,"city": string,"created_at"?: string,"departed_at"?: string | null,"facility_name"?: string | null,"id"?: string,"load_id": string,"notes"?: string | null,"organization_id": string,"sequence": number,"state": string,"stop_type": Database["public"]['Enums']["stop_type"],"timezone": string,"updated_at"?: string,"zip"?: string | null
                  }
                  Update: {
                    "address_line1"?: string | null,"appointment_end"?: string | null,"appointment_start"?: string | null,"arrived_at"?: string | null,"city"?: string,"created_at"?: string,"departed_at"?: string | null,"facility_name"?: string | null,"id"?: string,"load_id"?: string,"notes"?: string | null,"organization_id"?: string,"sequence"?: number,"state"?: string,"stop_type"?: Database["public"]['Enums']["stop_type"],"timezone"?: string,"updated_at"?: string,"zip"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "load_stops_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "load_stops_organization_id_load_id_fkey"
      columns: ["organization_id","load_id"]
isOneToOne: false
      referencedRelation: "loads"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"loads": {
                  Row: {
                    "cancelled_reason": string | null,"commodity": string | null,"created_at": string,"created_by": string | null,"customer_id": string,"customer_reference": string | null,"deadhead_miles": number,"delivered_at": string | null,"equipment_type": Database["public"]['Enums']["trailer_type"] | null,"fuel_surcharge_cents": number,"id": string,"is_tonu": boolean,"linehaul_cents": number,"load_number": string,"loaded_miles": number | null,"notes": string | null,"organization_id": string,"status": Database["public"]['Enums']["load_status"],"trailer_id": string | null,"truck_id": string | null,"updated_at": string,"weight_lbs": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_reason"?: string | null,"commodity"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"customer_reference"?: string | null,"deadhead_miles"?: number,"delivered_at"?: string | null,"equipment_type"?: Database["public"]['Enums']["trailer_type"] | null,"fuel_surcharge_cents"?: number,"id"?: string,"is_tonu"?: boolean,"linehaul_cents"?: number,"load_number": string,"loaded_miles"?: number | null,"notes"?: string | null,"organization_id": string,"status"?: Database["public"]['Enums']["load_status"],"trailer_id"?: string | null,"truck_id"?: string | null,"updated_at"?: string,"weight_lbs"?: number | null
                  }
                  Update: {
                    "cancelled_reason"?: string | null,"commodity"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"customer_reference"?: string | null,"deadhead_miles"?: number,"delivered_at"?: string | null,"equipment_type"?: Database["public"]['Enums']["trailer_type"] | null,"fuel_surcharge_cents"?: number,"id"?: string,"is_tonu"?: boolean,"linehaul_cents"?: number,"load_number"?: string,"loaded_miles"?: number | null,"notes"?: string | null,"organization_id"?: string,"status"?: Database["public"]['Enums']["load_status"],"trailer_id"?: string | null,"truck_id"?: string | null,"updated_at"?: string,"weight_lbs"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "loads_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "loads_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loads_organization_id_trailer_id_fkey"
      columns: ["organization_id","trailer_id"]
isOneToOne: false
      referencedRelation: "trailers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "loads_organization_id_truck_id_fkey"
      columns: ["organization_id","truck_id"]
isOneToOne: false
      referencedRelation: "trucks"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"odometer_readings": {
                  Row: {
                    "asset_type": Database["public"]['Enums']["asset_type"],"created_at": string,"created_by": string | null,"id": string,"is_correction": boolean,"note": string | null,"organization_id": string,"read_on": string,"reading": number,"reading_type": Database["public"]['Enums']["meter_type"],"source": Database["public"]['Enums']["meter_source"],"trailer_id": string | null,"truck_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_type": Database["public"]['Enums']["asset_type"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_correction"?: boolean,"note"?: string | null,"organization_id": string,"read_on"?: string,"reading": number,"reading_type": Database["public"]['Enums']["meter_type"],"source"?: Database["public"]['Enums']["meter_source"],"trailer_id"?: string | null,"truck_id"?: string | null
                  }
                  Update: {
                    "asset_type"?: Database["public"]['Enums']["asset_type"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_correction"?: boolean,"note"?: string | null,"organization_id"?: string,"read_on"?: string,"reading"?: number,"reading_type"?: Database["public"]['Enums']["meter_type"],"source"?: Database["public"]['Enums']["meter_source"],"trailer_id"?: string | null,"truck_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "odometer_readings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "odometer_readings_organization_id_trailer_id_fkey"
      columns: ["organization_id","trailer_id"]
isOneToOne: false
      referencedRelation: "trailers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "odometer_readings_organization_id_truck_id_fkey"
      columns: ["organization_id","truck_id"]
isOneToOne: false
      referencedRelation: "trucks"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"organization_counters": {
                  Row: {
                    "name": string,"next_value": number,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "name": string,"next_value": number,"organization_id": string
                  }
                  Update: {
                    "name"?: string,"next_value"?: number,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_counters_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address_line1": string | null,"city": string | null,"created_at": string,"created_by": string | null,"id": string,"mc_number": string | null,"name": string,"overhead_allocation": string,"state": string | null,"timezone": string,"updated_at": string,"usdot_number": string | null,"zip": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line1"?: string | null,"city"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"mc_number"?: string | null,"name": string,"overhead_allocation"?: string,"state"?: string | null,"timezone"?: string,"updated_at"?: string,"usdot_number"?: string | null,"zip"?: string | null
                  }
                  Update: {
                    "address_line1"?: string | null,"city"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"mc_number"?: string | null,"name"?: string,"overhead_allocation"?: string,"state"?: string | null,"timezone"?: string,"updated_at"?: string,"usdot_number"?: string | null,"zip"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"trailers": {
                  Row: {
                    "annual_inspection_on": string | null,"annual_inspection_valid_months": number,"archived_at": string | null,"archived_by": string | null,"created_at": string,"created_by": string | null,"hubodometer": number | null,"id": string,"length_ft": number | null,"make": string | null,"notes": string | null,"organization_id": string,"ownership": Database["public"]['Enums']["ownership_type"],"plate": string | null,"plate_state": string | null,"purchase_date": string | null,"purchase_price_cents": number | null,"reefer_hours": number | null,"registration_expires_on": string | null,"status": Database["public"]['Enums']["asset_status"],"trailer_type": Database["public"]['Enums']["trailer_type"],"unit_number": string,"updated_at": string,"vin": string | null,"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_inspection_on"?: string | null,"annual_inspection_valid_months"?: number,"archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"hubodometer"?: number | null,"id"?: string,"length_ft"?: number | null,"make"?: string | null,"notes"?: string | null,"organization_id": string,"ownership"?: Database["public"]['Enums']["ownership_type"],"plate"?: string | null,"plate_state"?: string | null,"purchase_date"?: string | null,"purchase_price_cents"?: number | null,"reefer_hours"?: number | null,"registration_expires_on"?: string | null,"status"?: Database["public"]['Enums']["asset_status"],"trailer_type": Database["public"]['Enums']["trailer_type"],"unit_number": string,"updated_at"?: string,"vin"?: string | null,"year"?: number | null
                  }
                  Update: {
                    "annual_inspection_on"?: string | null,"annual_inspection_valid_months"?: number,"archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"hubodometer"?: number | null,"id"?: string,"length_ft"?: number | null,"make"?: string | null,"notes"?: string | null,"organization_id"?: string,"ownership"?: Database["public"]['Enums']["ownership_type"],"plate"?: string | null,"plate_state"?: string | null,"purchase_date"?: string | null,"purchase_price_cents"?: number | null,"reefer_hours"?: number | null,"registration_expires_on"?: string | null,"status"?: Database["public"]['Enums']["asset_status"],"trailer_type"?: Database["public"]['Enums']["trailer_type"],"unit_number"?: string,"updated_at"?: string,"vin"?: string | null,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trailers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"trucks": {
                  Row: {
                    "annual_inspection_on": string | null,"annual_inspection_valid_months": number,"archived_at": string | null,"archived_by": string | null,"created_at": string,"created_by": string | null,"current_odometer": number | null,"id": string,"insurance_expires_on": string | null,"make": string | null,"model": string | null,"notes": string | null,"organization_id": string,"ownership": Database["public"]['Enums']["ownership_type"],"plate": string | null,"plate_state": string | null,"purchase_date": string | null,"purchase_price_cents": number | null,"registration_expires_on": string | null,"status": Database["public"]['Enums']["asset_status"],"unit_number": string,"updated_at": string,"vin": string,"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_inspection_on"?: string | null,"annual_inspection_valid_months"?: number,"archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_odometer"?: number | null,"id"?: string,"insurance_expires_on"?: string | null,"make"?: string | null,"model"?: string | null,"notes"?: string | null,"organization_id": string,"ownership"?: Database["public"]['Enums']["ownership_type"],"plate"?: string | null,"plate_state"?: string | null,"purchase_date"?: string | null,"purchase_price_cents"?: number | null,"registration_expires_on"?: string | null,"status"?: Database["public"]['Enums']["asset_status"],"unit_number": string,"updated_at"?: string,"vin": string,"year"?: number | null
                  }
                  Update: {
                    "annual_inspection_on"?: string | null,"annual_inspection_valid_months"?: number,"archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_odometer"?: number | null,"id"?: string,"insurance_expires_on"?: string | null,"make"?: string | null,"model"?: string | null,"notes"?: string | null,"organization_id"?: string,"ownership"?: Database["public"]['Enums']["ownership_type"],"plate"?: string | null,"plate_state"?: string | null,"purchase_date"?: string | null,"purchase_price_cents"?: number | null,"registration_expires_on"?: string | null,"status"?: Database["public"]['Enums']["asset_status"],"unit_number"?: string,"updated_at"?: string,"vin"?: string,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trucks_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"assign_load":
{ Args: { "p_driver_ids": (string)[],"p_load": string,"p_trailer": string,"p_truck": string }; Returns: undefined
                           },
"can_edit_load":
{ Args: { "p_load": string }; Returns: boolean
                           },
"change_load_status":
{ Args: { "p_deadhead_miles"?: number,"p_delivered_at"?: string,"p_load": string,"p_loaded_miles"?: number,"p_reason"?: string,"p_to": Database["public"]['Enums']["load_status"] }; Returns: undefined
                           },
"create_organization":
{ Args: { "p_address_line1"?: string,"p_city"?: string,"p_mc_number"?: string,"p_name": string,"p_state"?: string,"p_timezone"?: string,"p_usdot_number"?: string,"p_zip"?: string }; Returns: string
                           },
"get_invitation_preview":
{ Args: { "p_token": string }; Returns: {
              "email": string,"organization_name": string,"role": Database["public"]['Enums']["org_role"],"status": string
            }[]
                           },
"has_org_role":
{ Args: { "org": string,"roles": (Database["public"]['Enums']["org_role"])[] }; Returns: boolean
                           },
"is_org_member":
{ Args: { "org": string }; Returns: boolean
                           },
"list_organization_members":
{ Args: { "p_org": string }; Returns: {
              "email": string,"first_name": string,"joined_at": string,"last_name": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
            }[]
                           },
"load_is_open":
{ Args: { "s": Database["public"]['Enums']["load_status"] }; Returns: boolean
                           },
"load_status_rank":
{ Args: { "s": Database["public"]['Enums']["load_status"] }; Returns: number
                           },
"next_load_number":
{ Args: { "p_org": string }; Returns: string
                           },
"org_today":
{ Args: { "org": string }; Returns: string
                           },
"record_load_override":
{ Args: { "p_load": string,"p_reason": string }; Returns: undefined
                           },
"save_load":
{ Args: { "p_driver_ids": (string)[],"p_load": Json,"p_stops": Json }; Returns: string
                           }
          }
          Enums: {
            "accessorial_type": "detention"|"layover"|"lumper"|"tonu"|"stop_off"|"other","asset_status": "active"|"in_shop"|"out_of_service"|"sold","asset_type": "truck"|"trailer","audit_action": "insert"|"update"|"void"|"delete","cdl_class": "A"|"B"|"C","customer_status": "active"|"inactive"|"do_not_use","customer_type": "broker"|"shipper"|"both","driver_status": "active"|"inactive"|"terminated","driver_type": "company"|"owner_operator"|"team","load_event_kind": "status_change"|"assignment_override","load_status": "planned"|"dispatched"|"at_pickup"|"in_transit"|"delivered"|"invoiced"|"paid"|"cancelled","meter_source": "manual"|"fuel"|"work_order"|"load","meter_type": "odometer"|"hubodometer"|"reefer_hours","miles_basis": "loaded"|"all","org_role": "owner"|"admin"|"dispatcher"|"maintenance"|"accounting"|"viewer","ownership_type": "owned"|"financed"|"leased","pay_type": "per_mile"|"percent"|"flat","percent_basis": "linehaul"|"linehaul_fsc"|"total","stop_type": "pickup"|"delivery","trailer_type": "dry_van"|"reefer"|"flatbed"|"step_deck"|"other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "accessorial_type": ["detention", "layover", "lumper", "tonu", "stop_off", "other"],"asset_status": ["active", "in_shop", "out_of_service", "sold"],"asset_type": ["truck", "trailer"],"audit_action": ["insert", "update", "void", "delete"],"cdl_class": ["A", "B", "C"],"customer_status": ["active", "inactive", "do_not_use"],"customer_type": ["broker", "shipper", "both"],"driver_status": ["active", "inactive", "terminated"],"driver_type": ["company", "owner_operator", "team"],"load_event_kind": ["status_change", "assignment_override"],"load_status": ["planned", "dispatched", "at_pickup", "in_transit", "delivered", "invoiced", "paid", "cancelled"],"meter_source": ["manual", "fuel", "work_order", "load"],"meter_type": ["odometer", "hubodometer", "reefer_hours"],"miles_basis": ["loaded", "all"],"org_role": ["owner", "admin", "dispatcher", "maintenance", "accounting", "viewer"],"ownership_type": ["owned", "financed", "leased"],"pay_type": ["per_mile", "percent", "flat"],"percent_basis": ["linehaul", "linehaul_fsc", "total"],"stop_type": ["pickup", "delivery"],"trailer_type": ["dry_van", "reefer", "flatbed", "step_deck", "other"]
          }
        }
} as const
