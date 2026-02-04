// Types générés à partir du schéma Supabase
// À regénérer avec: npx supabase gen types typescript --local > types/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nom: string
          prenom: string | null
          email: string
          telephone: string | null
          matricule_avocat: string | null
          barreau: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nom: string
          prenom?: string | null
          email: string
          telephone?: string | null
          matricule_avocat?: string | null
          barreau?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nom?: string
          prenom?: string | null
          email?: string
          telephone?: string | null
          matricule_avocat?: string | null
          barreau?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          user_id: string
          nom: string
          prenom: string | null
          cin: string | null
          date_naissance: string | null
          sexe: string | null
          telephone: string | null
          email: string | null
          adresse: string | null
          ville: string | null
          code_postal: string | null
          profession: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nom: string
          prenom?: string | null
          cin?: string | null
          date_naissance?: string | null
          sexe?: string | null
          telephone?: string | null
          email?: string | null
          adresse?: string | null
          ville?: string | null
          code_postal?: string | null
          profession?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nom?: string
          prenom?: string | null
          cin?: string | null
          date_naissance?: string | null
          sexe?: string | null
          telephone?: string | null
          email?: string | null
          adresse?: string | null
          ville?: string | null
          code_postal?: string | null
          profession?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      dossiers: {
        Row: {
          id: string
          user_id: string
          client_id: string
          numero_dossier: string
          type_procedure: string
          objet: string
          tribunal: string
          numero_rg: string | null
          partie_adverse: string | null
          statut: string
          date_ouverture: string
          date_cloture: string | null
          montant_demande: number | null
          montant_obtenu: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          numero_dossier: string
          type_procedure?: string
          objet: string
          tribunal: string
          numero_rg?: string | null
          partie_adverse?: string | null
          statut?: string
          date_ouverture?: string
          date_cloture?: string | null
          montant_demande?: number | null
          montant_obtenu?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string
          numero_dossier?: string
          type_procedure?: string
          objet?: string
          tribunal?: string
          numero_rg?: string | null
          partie_adverse?: string | null
          statut?: string
          date_ouverture?: string
          date_cloture?: string | null
          montant_demande?: number | null
          montant_obtenu?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      // Ajouter les autres tables selon le besoin
    }
    Views: {
      dashboard_stats: {
        Row: {
          user_id: string
          dossiers_actifs: number
          total_clients: number
          actions_urgentes: number
          echeances_prochaines: number
          factures_impayees: number
          montant_impaye: number
        }
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
