import type {
  AccountStatus,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  PaymentStatus,
  ProgressStatus,
  Role,
} from '@/types/enums'

/**
 * Hand-written Supabase `Database` type.
 *
 * This is the contract between TypeScript and Postgres. Keeping it hand-written
 * rather than generated means the types are reviewable in a pull request: a
 * schema change shows up as a deliberate diff here instead of a regenerated
 * blob. Regenerate it with `npx supabase gen types typescript` if the schema
 * grows enough to make hand-maintenance a burden.
 *
 * Row level security is on for every table. That is enforced in Postgres, not
 * here: these types describe shape, not permission.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: Database['public']['Enums']['user_role']
          full_name: string
          email: string
          avatar_url: string | null
          phone: string | null
          bio: string | null
          status: Database['public']['Enums']['account_status']
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: Database['public']['Enums']['user_role']
          full_name: string
          email: string
          avatar_url?: string | null
          phone?: string | null
          bio?: string | null
          status?: Database['public']['Enums']['account_status']
          created_at?: string
          updated_at?: string
        }
        Update: {
          role?: Database['public']['Enums']['user_role']
          full_name?: string
          email?: string
          avatar_url?: string | null
          phone?: string | null
          bio?: string | null
          status?: Database['public']['Enums']['account_status']
          updated_at?: string
        }
        Relationships: []
      }

      course_categories: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          icon: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          icon?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          slug?: string
          description?: string | null
          icon?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      courses: {
        Row: {
          id: string
          category_id: string | null
          title: string
          slug: string
          description: string | null
          thumbnail_url: string | null
          status: Database['public']['Enums']['course_status']
          level: Database['public']['Enums']['course_level']
          duration_minutes: number | null
          passing_score: number | null
          price_centavos: number
          created_by: string
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id?: string | null
          title: string
          slug: string
          description?: string | null
          thumbnail_url?: string | null
          status?: Database['public']['Enums']['course_status']
          level?: Database['public']['Enums']['course_level']
          duration_minutes?: number | null
          passing_score?: number | null
          price_centavos?: number
          created_by: string
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          title?: string
          slug?: string
          description?: string | null
          thumbnail_url?: string | null
          status?: Database['public']['Enums']['course_status']
          level?: Database['public']['Enums']['course_level']
          duration_minutes?: number | null
          passing_score?: number | null
          price_centavos?: number
          published_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'courses_category_id_fkey'
            columns: ['category_id']
            referencedRelation: 'course_categories'
            referencedColumns: ['id']
          },
        ]
      }

      course_instructors: {
        Row: { course_id: string; instructor_id: string; assigned_at: string }
        Insert: { course_id: string; instructor_id: string; assigned_at?: string }
        Update: { assigned_at?: string }
        Relationships: [
          {
            foreignKeyName: 'course_instructors_course_id_fkey'
            columns: ['course_id']
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'course_instructors_instructor_id_fkey'
            columns: ['instructor_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      modules: {
        Row: {
          id: string
          course_id: string
          title: string
          description: string | null
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id: string
          title: string
          description?: string | null
          position: number
          created_at?: string
          updated_at?: string
        }
        Update: { title?: string; description?: string | null; position?: number; updated_at?: string }
        Relationships: [
          {
            foreignKeyName: 'modules_course_id_fkey'
            columns: ['course_id']
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }

      lessons: {
        Row: {
          id: string
          module_id: string
          title: string
          content: string | null
          lesson_type: Database['public']['Enums']['lesson_type']
          position: number
          duration_minutes: number | null
          is_preview: boolean
          video_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          module_id: string
          title: string
          content?: string | null
          lesson_type?: Database['public']['Enums']['lesson_type']
          position: number
          duration_minutes?: number | null
          is_preview?: boolean
          video_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          content?: string | null
          lesson_type?: Database['public']['Enums']['lesson_type']
          position?: number
          duration_minutes?: number | null
          is_preview?: boolean
          video_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lessons_module_id_fkey'
            columns: ['module_id']
            referencedRelation: 'modules'
            referencedColumns: ['id']
          },
        ]
      }

      lesson_materials: {
        Row: {
          id: string
          lesson_id: string
          title: string
          file_path: string
          file_type: string | null
          file_size: number | null
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          title: string
          file_path: string
          file_type?: string | null
          file_size?: number | null
          position?: number
          created_at?: string
        }
        Update: { title?: string; file_path?: string; file_type?: string | null; file_size?: number | null; position?: number }
        Relationships: [
          {
            foreignKeyName: 'lesson_materials_lesson_id_fkey'
            columns: ['lesson_id']
            referencedRelation: 'lessons'
            referencedColumns: ['id']
          },
        ]
      }

      enrollments: {
        Row: {
          id: string
          course_id: string
          student_id: string
          status: Database['public']['Enums']['enrollment_status']
          enrolled_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          course_id: string
          student_id: string
          status?: Database['public']['Enums']['enrollment_status']
          enrolled_at?: string
          completed_at?: string | null
        }
        Update: { status?: Database['public']['Enums']['enrollment_status']; completed_at?: string | null }
        Relationships: [
          {
            foreignKeyName: 'enrollments_course_id_fkey'
            columns: ['course_id']
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'enrollments_student_id_fkey'
            columns: ['student_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      lesson_progress: {
        Row: {
          id: string
          enrollment_id: string
          lesson_id: string
          status: Database['public']['Enums']['progress_status']
          progress_percent: number
          last_position_seconds: number | null
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          enrollment_id: string
          lesson_id: string
          status?: Database['public']['Enums']['progress_status']
          progress_percent?: number
          last_position_seconds?: number | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          status?: Database['public']['Enums']['progress_status']
          progress_percent?: number
          last_position_seconds?: number | null
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'lesson_progress_enrollment_id_fkey'
            columns: ['enrollment_id']
            referencedRelation: 'enrollments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lesson_progress_lesson_id_fkey'
            columns: ['lesson_id']
            referencedRelation: 'lessons'
            referencedColumns: ['id']
          },
        ]
      }

      payments: {
        Row: {
          id: string
          student_id: string
          course_id: string
          amount_centavos: number
          currency: string
          status: Database['public']['Enums']['payment_status']
          provider: string
          provider_payment_id: string | null
          provider_checkout_id: string | null
          reference_number: string
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          course_id: string
          amount_centavos: number
          currency?: string
          status?: Database['public']['Enums']['payment_status']
          provider?: string
          provider_payment_id?: string | null
          provider_checkout_id?: string | null
          reference_number: string
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: Database['public']['Enums']['payment_status']
          provider_payment_id?: string | null
          provider_checkout_id?: string | null
          paid_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_course_id_fkey'
            columns: ['course_id']
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_student_id_fkey'
            columns: ['student_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }

    Views: Record<never, never>

    Functions: {
      current_role: { Args: Record<never, never>; Returns: Database['public']['Enums']['user_role'] }
      is_admin: { Args: Record<never, never>; Returns: boolean }
      is_instructor_of: { Args: { course_id: string }; Returns: boolean }
      is_enrolled_in: { Args: { course_id: string }; Returns: boolean }
    }

    Enums: {
      user_role: Role
      account_status: AccountStatus
      course_status: CourseStatus
      course_level: CourseLevel
      enrollment_status: EnrollmentStatus
      lesson_type: LessonType
      progress_status: ProgressStatus
      payment_status: PaymentStatus
    }

    CompositeTypes: Record<never, never>
  }
}

/** Convenience alias for a single table's row shape. */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']