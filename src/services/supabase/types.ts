import type {
  AccountStatus,
  AttemptStatus,
  ContentStatus,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  MaterialType,
  PaymentStatus,
  ProgressStatus,
  QuestionType,
  QuizStatus,
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
          status: Database['public']['Enums']['content_status']
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id: string
          title: string
          description?: string | null
          position: number
          status?: Database['public']['Enums']['content_status']
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          description?: string | null
          position?: number
          status?: Database['public']['Enums']['content_status']
          updated_at?: string
        }
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
          status: Database['public']['Enums']['content_status']
          summary: string | null
          is_required: boolean
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
          status?: Database['public']['Enums']['content_status']
          summary?: string | null
          is_required?: boolean
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
          status?: Database['public']['Enums']['content_status']
          summary?: string | null
          is_required?: boolean
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
          file_path: string | null
          file_type: string | null
          file_size: number | null
          position: number
          material_type: Database['public']['Enums']['material_type']
          content_text: string | null
          external_url: string | null
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          title: string
          file_path?: string | null
          file_type?: string | null
          file_size?: number | null
          position?: number
          material_type?: Database['public']['Enums']['material_type']
          content_text?: string | null
          external_url?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          file_path?: string | null
          file_type?: string | null
          file_size?: number | null
          position?: number
          material_type?: Database['public']['Enums']['material_type']
          content_text?: string | null
          external_url?: string | null
          updated_at?: string
        }
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
        Update: {
          status?: Database['public']['Enums']['enrollment_status']
          completed_at?: string | null
        }
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
          student_id: string | null
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
          student_id?: string | null
          status?: Database['public']['Enums']['progress_status']
          progress_percent?: number
          last_position_seconds?: number | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          student_id?: string | null
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
            foreignKeyName: 'lesson_progress_student_id_fkey'
            columns: ['student_id']
            referencedRelation: 'profiles'
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

      quizzes: {
        Row: {
          id: string
          course_id: string
          module_id: string | null
          lesson_id: string | null
          title: string
          description: string | null
          passing_score: number
          attempts_allowed: number
          time_limit_minutes: number | null
          shuffle_questions: boolean
          reveal_answers: boolean
          status: Database['public']['Enums']['quiz_status']
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id: string
          module_id?: string | null
          lesson_id?: string | null
          title: string
          description?: string | null
          passing_score?: number
          attempts_allowed?: number
          time_limit_minutes?: number | null
          shuffle_questions?: boolean
          reveal_answers?: boolean
          status?: Database['public']['Enums']['quiz_status']
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          module_id?: string | null
          lesson_id?: string | null
          title?: string
          description?: string | null
          passing_score?: number
          attempts_allowed?: number
          time_limit_minutes?: number | null
          shuffle_questions?: boolean
          reveal_answers?: boolean
          status?: Database['public']['Enums']['quiz_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quizzes_course_id_fkey'
            columns: ['course_id']
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quizzes_module_id_fkey'
            columns: ['module_id']
            referencedRelation: 'modules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quizzes_lesson_id_fkey'
            columns: ['lesson_id']
            referencedRelation: 'lessons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quizzes_created_by_fkey'
            columns: ['created_by']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      quiz_questions: {
        Row: {
          id: string
          quiz_id: string
          question_type: Database['public']['Enums']['question_type']
          prompt: string
          points: number
          position: number
          /**
           * Withheld from students at the GRANT layer. A student has no SELECT on
           * this column, so `select *` on quiz_questions fails rather than quietly
           * including the answer written out in words.
           */
          explanation: string | null
          case_sensitive: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          quiz_id: string
          question_type: Database['public']['Enums']['question_type']
          prompt: string
          points?: number
          position?: number
          explanation?: string | null
          case_sensitive?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          prompt?: string
          points?: number
          position?: number
          explanation?: string | null
          case_sensitive?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_questions_quiz_id_fkey'
            columns: ['quiz_id']
            referencedRelation: 'quizzes'
            referencedColumns: ['id']
          },
        ]
      }

      quiz_options: {
        Row: {
          id: string
          question_id: string
          option_text: string
          /**
           * The answer key. No SELECT grant for `authenticated`; reachable only
           * through the `quiz_with_answers` RPC, which checks the caller teaches
           * the course.
           */
          is_correct: boolean
          position: number
        }
        Insert: {
          id?: string
          question_id: string
          option_text: string
          is_correct?: boolean
          position?: number
        }
        Update: {
          option_text?: string
          is_correct?: boolean
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_options_question_id_fkey'
            columns: ['question_id']
            referencedRelation: 'quiz_questions'
            referencedColumns: ['id']
          },
        ]
      }

      quiz_text_answers: {
        Row: {
          id: string
          question_id: string
          accepted_answer: string
          position: number
        }
        Insert: {
          id?: string
          question_id: string
          accepted_answer: string
          position?: number
        }
        Update: {
          accepted_answer?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_text_answers_question_id_fkey'
            columns: ['question_id']
            referencedRelation: 'quiz_questions'
            referencedColumns: ['id']
          },
        ]
      }

      quiz_attempts: {
        Row: {
          id: string
          quiz_id: string
          course_id: string
          enrollment_id: string | null
          student_id: string
          attempt_number: number
          status: Database['public']['Enums']['attempt_status']
          score: number | null
          max_score: number | null
          percentage: number | null
          passed: boolean | null
          started_at: string
          submitted_at: string | null
        }
        Insert: {
          id?: string
          quiz_id: string
          course_id: string
          enrollment_id?: string | null
          student_id: string
          attempt_number: number
          status?: Database['public']['Enums']['attempt_status']
          score?: number | null
          max_score?: number | null
          percentage?: number | null
          passed?: boolean | null
          started_at?: string
          submitted_at?: string | null
        }
        /**
         * UPDATE and DELETE are deliberately absent: a student must not be able to
         * mark their own attempt passed. `submit_quiz_attempt` writes as its owner.
         */
        Update: Record<never, never>
        Relationships: [
          {
            foreignKeyName: 'quiz_attempts_quiz_id_fkey'
            columns: ['quiz_id']
            referencedRelation: 'quizzes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_attempts_course_id_fkey'
            columns: ['course_id']
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_attempts_enrollment_id_fkey'
            columns: ['enrollment_id']
            referencedRelation: 'enrollments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_attempts_student_id_fkey'
            columns: ['student_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      quiz_answers: {
        Row: {
          id: string
          attempt_id: string
          question_id: string
          selected_option_id: string | null
          text_answer: string | null
          is_correct: boolean | null
          points_awarded: number | null
        }
        Insert: {
          id?: string
          attempt_id: string
          question_id: string
          selected_option_id?: string | null
          text_answer?: string | null
          is_correct?: boolean | null
          points_awarded?: number | null
        }
        Update: Record<never, never>
        Relationships: [
          {
            foreignKeyName: 'quiz_answers_attempt_id_fkey'
            columns: ['attempt_id']
            referencedRelation: 'quiz_attempts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_answers_question_id_fkey'
            columns: ['question_id']
            referencedRelation: 'quiz_questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_answers_selected_option_id_fkey'
            columns: ['selected_option_id']
            referencedRelation: 'quiz_options'
            referencedColumns: ['id']
          },
        ]
      }
    }

    Views: Record<never, never>

    Functions: {
      current_role: {
        Args: Record<never, never>
        Returns: Database['public']['Enums']['user_role']
      }
      is_admin: { Args: Record<never, never>; Returns: boolean }
      is_instructor_of: { Args: { course_id: string }; Returns: boolean }
      is_enrolled_in: { Args: { course_id: string }; Returns: boolean }
      start_quiz_attempt: { Args: { p_quiz_id: string }; Returns: string }
      submit_quiz_attempt: { Args: { p_attempt_id: string; p_answers: unknown }; Returns: unknown }
      quiz_with_answers: { Args: { p_quiz_id: string }; Returns: unknown }
      quiz_is_publishable: { Args: { p_quiz_id: string }; Returns: boolean }
      /**
       * Adds the calling instructor to a course they created, so they can edit
       * it. SECURITY DEFINER: ownership is checked as the function owner, because
       * checking it in a policy would mean checking it through a SELECT that the
       * courses policy had already filtered.
       */
      claim_own_course: { Args: { p_course_id: string }; Returns: boolean }
      /** Courses with no instructor assigned. An operations query. */
      unassigned_courses: { Args: Record<never, never>; Returns: unknown }
      /** True for an admin or the instructor assigned to the course. */
      can_edit_course_content: { Args: { target_course: string }; Returns: boolean }
      /**
       * Reorder modules or lessons in one atomic statement.
       *
       * `modules` and `lessons` both carry unique (parent, position), so writing
       * positions one at a time from the client either collides or leaves a gap
       * visible to readers. The function moves everything to negative placeholders
       * and then writes the final order.
       */
      reorder_curriculum: {
        Args: {
          p_table: string
          p_parent_column: string
          p_parent_id: string
          p_ordered_ids: string[]
        }
        Returns: undefined
      }
    }

    Enums: {
      user_role: Role
      account_status: AccountStatus
      course_status: CourseStatus
      course_level: CourseLevel
      enrollment_status: EnrollmentStatus
      lesson_type: LessonType
      content_status: ContentStatus
      material_type: MaterialType
      progress_status: ProgressStatus
      payment_status: PaymentStatus
      quiz_status: QuizStatus
      question_type: QuestionType
      attempt_status: AttemptStatus
    }

    CompositeTypes: Record<never, never>
  }
}

/** Convenience alias for a single table's row shape. */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
