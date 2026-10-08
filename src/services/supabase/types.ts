import type {
  AccountStatus,
  AssignmentStatus,
  AttemptStatus,
  ContentStatus,
  CourseLevel,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  MaterialType,
  NotificationType,
  PaymentEventStatus,
  PaymentReceiptStatus,
  PaymentStatus,
  ProgressStatus,
  QuestionType,
  QuizStatus,
  RequirementType,
  Role,
  SubmissionStatus,
} from '@/types/enums'

/**
 * Hand-written Supabase `Database` type, merged from the live schema.
 *
 * The intent is that the types are reviewable in a pull request - a schema change
 * shows up as a deliberate diff rather than a regenerated blob - but that intent
 * had drifted. Twelve tables (`certificates`, `notifications`, `assignments`, the
 * conversation tables, `activity_logs` and others) and five enums were missing
 * entirely while five services already queried them, so every row those services
 * read was untyped and narrowed with `as unknown as`. That is the worst of both:
 * the compile-time safety is gone and the reviewable diff is a fiction.
 *
 * So the missing blocks were merged in from `npx supabase gen types typescript
 * --linked`, with `scripts/merge-generated-types.mjs`, rather than regenerating the
 * whole file. A wholesale regeneration would have deleted the commentary that
 * explains *why* a column has no grant, which is the part worth reviewing.
 *
 * Re-run it after a schema change:
 *
 *     npx supabase gen types typescript --linked --schema public --file types.gen.ts
 *     node scripts/merge-generated-types.mjs types.gen.ts src/services/supabase/types.ts
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
          email_code_sign_in: boolean
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
          email_code_sign_in?: boolean
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
          email_code_sign_in?: boolean
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
          enrollment_id: string | null
          provider_checkout_url: string | null
          /**
           * The single payee, snapshotted from `courses.created_by` when the payment was
           * created. NOT `course_instructors`: a course has one seller however many
           * instructors teach it. Read-only to the browser - INSERT and UPDATE on payments
           * are revoked from every client role.
           */
          instructor_id: string | null
          /**
           * The fee rate this payment was priced at. A snapshot, so changing the configured
           * rate afterwards does not restate this sale.
           */
          platform_fee_pct: number | null
          /** round(amount_centavos * platform_fee_pct / 100). The platform's share. */
          platform_fee_centavos: number | null
          /** amount_centavos - platform_fee_centavos. What the instructor earned. */
          instructor_share_centavos: number | null
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
          enrollment_id?: string | null
          provider_checkout_url?: string | null
          instructor_id?: string | null
          platform_fee_pct?: number | null
          platform_fee_centavos?: number | null
          instructor_share_centavos?: number | null
        }
        Update: {
          status?: Database['public']['Enums']['payment_status']
          provider_payment_id?: string | null
          provider_checkout_id?: string | null
          paid_at?: string | null
          updated_at?: string
          provider_checkout_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'payments_course_id_fkey'
            columns: ['course_id']
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_enrollment_id_fkey'
            columns: ['enrollment_id']
            referencedRelation: 'enrollments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_instructor_id_fkey'
            columns: ['instructor_id']
            referencedRelation: 'profiles'
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
          instructions: string | null
          passing_score: number
          attempts_allowed: number
          time_limit_minutes: number | null
          shuffle_questions: boolean
          reveal_answers: boolean
          max_warnings: number
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
          instructions?: string | null
          passing_score?: number
          attempts_allowed?: number
          time_limit_minutes?: number | null
          shuffle_questions?: boolean
          reveal_answers?: boolean
          max_warnings?: number
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
          instructions?: string | null
          passing_score?: number
          attempts_allowed?: number
          time_limit_minutes?: number | null
          shuffle_questions?: boolean
          reveal_answers?: boolean
          max_warnings?: number
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
          /**
           * The shuffle, written once at start.
           *
           * Question ids in the order this attempt was served. Held on the attempt
           * rather than computed in the browser because a browser-computed order is
           * recomputed on every render, so a refresh would renumber the quiz under
           * the student. Ids, not positions and not copies of the question, so
           * grading by id is unaffected.
           */
          question_order: string[] | null
          /** Map of question_id to the option ids this attempt was served. */
          option_order: unknown | null
          /**
           * Focus-loss warnings, counted server-side.
           *
           * A column rather than browser state, so a reload cannot reset it. The
           * only writer is `record_quiz_warning`, which stops at the limit.
           */
          warning_count: number
          /** When this attempt ran out of time, or null. Read by the grading path. */
          expires_at: string | null
          /** student_submit, time_expired, warnings_exhausted, or null while open. */
          ended_via: string | null
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
          question_order?: string[] | null
          option_order?: unknown | null
          warning_count?: number
          expires_at?: string | null
          ended_via?: string | null
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
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'activity_logs_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_name: string
          id: number
          properties: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name: string
          id?: never
          properties?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name?: string
          id?: never
          properties?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'analytics_events_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string
          body: string
          course_id: string | null
          created_at: string
          id: string
          kind: string
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'announcements_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'announcements_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          course_id: string
          feedback: string | null
          file_path: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          status: Database['public']['Enums']['submission_status']
          student_id: string
          submission_text: string | null
          submitted_at: string
        }
        Insert: {
          assignment_id: string
          course_id: string
          feedback?: string | null
          file_path?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          status?: Database['public']['Enums']['submission_status']
          student_id: string
          submission_text?: string | null
          submitted_at?: string
        }
        Update: {
          assignment_id?: string
          course_id?: string
          feedback?: string | null
          file_path?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          status?: Database['public']['Enums']['submission_status']
          student_id?: string
          submission_text?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assignment_submissions_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'assignments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignment_submissions_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignment_submissions_graded_by_fkey'
            columns: ['graded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignment_submissions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      assignments: {
        Row: {
          course_id: string
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          instructions: string | null
          max_points: number
          module_id: string | null
          status: Database['public']['Enums']['assignment_status']
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          max_points?: number
          module_id?: string | null
          status?: Database['public']['Enums']['assignment_status']
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          max_points?: number
          module_id?: string | null
          status?: Database['public']['Enums']['assignment_status']
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assignments_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'modules'
            referencedColumns: ['id']
          },
        ]
      }
      certificates: {
        Row: {
          certificate_number: string
          course_id: string
          enrollment_id: string | null
          final_percentage: number
          id: string
          issued_at: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          certificate_number: string
          course_id: string
          enrollment_id?: string | null
          final_percentage: number
          id?: string
          issued_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          certificate_number?: string
          course_id?: string
          enrollment_id?: string | null
          final_percentage?: number
          id?: string
          issued_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'certificates_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'certificates_enrollment_id_fkey'
            columns: ['enrollment_id']
            isOneToOne: false
            referencedRelation: 'enrollments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'certificates_revoked_by_fkey'
            columns: ['revoked_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'certificates_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      conversation_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_participants_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_participants_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string | null
          subject: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string | null
          subject: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversations_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      course_requirements: {
        Row: {
          course_id: string
          created_at: string
          requirement_type: Database['public']['Enums']['requirement_type']
          threshold: number | null
        }
        Insert: {
          course_id: string
          created_at?: string
          requirement_type: Database['public']['Enums']['requirement_type']
          threshold?: number | null
        }
        Update: {
          course_id?: string
          created_at?: string
          requirement_type?: Database['public']['Enums']['requirement_type']
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'course_requirements_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: Database['public']['Enums']['notification_type']
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: Database['public']['Enums']['notification_type']
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: Database['public']['Enums']['notification_type']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      payment_events: {
        Row: {
          event_id: string
          event_type: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          livemode: boolean | null
          payload: Json
          payment_id: string | null
          processed_at: string | null
          processing_status: Database['public']['Enums']['payment_event_status']
          provider: string
          received_at: string
          reported_amount_centavos: number | null
          reported_currency: string | null
          resource_id: string | null
          signature_verified: boolean
        }
        Insert: {
          event_id: string
          event_type?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          livemode?: boolean | null
          payload: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_status?: Database['public']['Enums']['payment_event_status']
          provider?: string
          received_at?: string
          reported_amount_centavos?: number | null
          reported_currency?: string | null
          resource_id?: string | null
          signature_verified?: boolean
        }
        Update: {
          event_id?: string
          event_type?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          livemode?: boolean | null
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_status?: Database['public']['Enums']['payment_event_status']
          provider?: string
          received_at?: string
          reported_amount_centavos?: number | null
          reported_currency?: string | null
          resource_id?: string | null
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'payment_events_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: false
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
        ]
      }

      payment_receipts: {
        Row: {
          id: string
          /**
           * UNIQUE. This constraint is the deduplication mechanism for the whole receipt
           * feature: PayMongo redelivers a webhook until it gets a 200, and a second email
           * to a paying student is a real failure. No browser role holds any privilege on
           * this table - service_role only.
           */
          payment_id: string
          /** The address the receipt went to, recorded so a support question is answerable. */
          recipient: string
          status: Database['public']['Enums']['payment_receipt_status']
          sent_at: string | null
          /** Why a send failed, kept because a receipt stuck in 'failed' is invisible otherwise. */
          failure_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          recipient: string
          status?: Database['public']['Enums']['payment_receipt_status']
          sent_at?: string | null
          failure_reason?: string | null
          created_at?: string
        }
        Update: {
          recipient?: string
          status?: Database['public']['Enums']['payment_receipt_status']
          sent_at?: string | null
          failure_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'payment_receipts_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: true
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
        ]
      }

      platform_settings: {
        Row: {
          /** Pinned to 1: this table holds exactly one row. */
          id: number
          /** Percentage, not a fraction. 20.00 means the platform keeps 20%. */
          platform_fee_pct: number
          updated_at: string
          /** The administrator who last changed the rate. Null on the seeded row. */
          updated_by: string | null
        }
        Insert: {
          id?: number
          platform_fee_pct: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          platform_fee_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'platform_settings_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }

    Views: {
      /**
       * What each instructor has earned from settled sales, summed from the split stored
       * on each payment.
       *
       * Never re-applies the current platform fee, so changing the rate does not restate
       * history. Created `security_invoker` in the database, so the payments read policy
       * still applies to whoever queries it.
       */
      instructor_earnings: {
        Row: {
          instructor_id: string
          full_name: string
          sales_count: number
          gross_centavos: number
          earnings_centavos: number
          platform_fee_centavos: number
          first_sale_at: string | null
          last_sale_at: string | null
        }
        Relationships: []
      }
      /**
       * The platform's retained revenue, summed from the fee stored on each settled
       * payment rather than recomputed from the configured rate.
       */
      platform_revenue: {
        Row: {
          platform_fee_centavos: number
          gross_centavos: number
          instructor_share_centavos: number
          settled_count: number
          first_sale_at: string | null
          last_sale_at: string | null
        }
        Relationships: []
      }
    }

    Functions: {
      current_role: {
        Args: Record<never, never>
        Returns: Database['public']['Enums']['user_role']
      }
      is_admin: { Args: Record<never, never>; Returns: boolean }
      is_instructor_of: { Args: { course_id: string }; Returns: boolean }
      is_enrolled_in: { Args: { course_id: string }; Returns: boolean }
      /**
       * Marks one of the caller's own threads read, stamping `last_read_at` with the
       * server's clock.
       *
       * It exists so the browser never chooses that timestamp: it is compared against
       * `conversation_messages.created_at`, which the database writes, so a client-written
       * value compares a browser clock against a server one.
       */
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: boolean }
      /**
       * The people the signed-in user can start a conversation with.
       *
       * A student's instructors and an instructor's students, limited to enrolments that
       * grant access, with the course each relationship comes from. Returns an id and a
       * name only: `profiles select` does not let a student read an instructor's row, and
       * this is narrower than widening that would be.
       */
      messageable_people: {
        Args: Record<never, never>
        Returns: { person_id: string; person_name: string | null; via: string | null }[]
      }
      /**
       * Creates a conversation and adds both participants in one statement.
       *
       * The client cannot do this itself: `participants insert` proves the caller created
       * the conversation by reading that row, and `conversations select` admits only
       * participants - so the creator cannot read their own brand-new conversation.
       */
      start_conversation: { Args: { p_recipient_id: string; p_subject: string }; Returns: string }
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
      reorder_quiz_questions: {
        Args: { p_quiz_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      reorder_quiz_options: {
        Args: { p_question_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      /**
       * Replace a question's options and text answers in one transaction.
       *
       * SECURITY DEFINER because the intermediate state of a delete-then-insert
       * is not one the child-table policies describe; the function checks
       * `can_edit_course_content` on the owning course itself.
       */
      replace_quiz_question_answers: {
        Args: { p_question_id: string; p_options: unknown; p_text_answers: unknown }
        Returns: undefined
      }
      /**
       * The student's view of their own attempt: questions in the frozen order,
       * options in the frozen order, and never `is_correct`. SECURITY DEFINER
       * because the caller holds no SELECT on `quiz_options.is_correct`.
       */
      get_attempt_questions: { Args: { p_attempt_id: string }; Returns: unknown }
      /** Saved selections for an open attempt. Never includes correctness. */
      get_attempt_answers: { Args: { p_attempt_id: string }; Returns: unknown }
      /** Stores one choice while the attempt is open. Never writes correctness. */
      save_attempt_answer: {
        Args: {
          p_attempt_id: string
          p_question_id: string
          p_option_id?: string | null
          p_text?: string | null
        }
        Returns: undefined
      }
      /** Increments the warning count and reports whether the attempt has ended. */
      record_quiz_warning: {
        Args: { p_attempt_id: string; p_reason?: string | null }
        Returns: unknown
      }
      /** Everything the pre-quiz screen needs, and nothing more. */
      quiz_briefing: { Args: { p_quiz_id: string }; Returns: unknown }
      can_view_profile: { Args: { target_profile: string }; Returns: boolean }
      announcement_byline: {
        Args: { p_announcement_ids: string[] }
        Returns: { author_name: string; author_role: string; id: string }[]
      }
      certificate_signatories: {
        Args: { p_certificate_id: string }
        Returns: {
          adminName: string | null
          certificateId: string
          certificateNumber: string
          courseTitle: string
          finalPercentage: number
          instructors: Json
          issuedAt: string
          revokeReason: string | null
          revokedAt: string | null
          studentName: string
        }
      }
      course_completion_gaps: {
        Args: { p_enrollment_id: string }
        Returns: {
          detail: string
          requirement: Database['public']['Enums']['requirement_type']
        }[]
      }
      course_id_from_object_name: {
        Args: { object_name: string }
        Returns: string
      }
      fail_payment: {
        Args: {
          in_cancelled?: boolean
          in_event_id: string
          in_failure_code: string
          in_failure_message: string
          in_payment_id: string
          in_provider_payment_id: string
        }
        Returns: string
      }
      issue_certificate: { Args: { p_course_id: string }; Returns: string }
      notify: {
        Args: {
          p_body?: string
          p_link?: string
          p_title: string
          p_type: Database['public']['Enums']['notification_type']
          p_user_id: string
        }
        Returns: string
      }
      notify_course: {
        Args: {
          p_body?: string
          p_course_id: string
          p_link?: string
          p_title: string
          p_type: Database['public']['Enums']['notification_type']
        }
        Returns: number
      }
      record_activity: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type?: string
          p_metadata?: Json
        }
        Returns: number
      }
      record_event: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_event_name: string
          p_properties?: Json
        }
        Returns: number
      }
      record_payment_event: {
        Args: {
          in_event_id: string
          in_event_type: string
          in_payload: Json
          in_resource_id: string
          in_signature_verified: boolean
        }
        Returns: {
          id: string
          is_new: boolean
          payment_id: string
        }[]
      }
      conversation_inbox: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          subject: string
          with_id: string | null
          with_name: string | null
          last_message_at: string
          last_message_preview: string | null
          unread_count: number
        }[]
      }
      refresh_enrollment_completion: {
        Args: { p_enrollment_id: string }
        Returns: boolean
      }
      set_user_role: {
        Args: {
          new_role: Database['public']['Enums']['user_role']
          target_id: string
        }
        Returns: undefined
      }
      settle_payment: {
        Args: {
          in_amount_centavos: number
          in_currency: string
          in_event_id: string
          in_payment_id: string
          in_provider_payment_id: string
        }
        Returns: string
      }

      /**
       * Computes the marketplace split for one sale: the single payee
       * (`courses.created_by`), the platform fee and the instructor share.
       *
       * Callers pass a gross amount and receive the four snapshot columns. There is no
       * parameter to pass a fee through, which is what makes "the client cannot choose
       * the platform's cut" a property of the signature rather than a promise.
       */
      /**
       * What actually happened to the calling student's payment on a course.
       *
       * Read by the checkout page when PayMongo returns the learner. There is no
       * student id argument on purpose: the function is scoped to `auth.uid()`, so a
       * caller cannot ask about anybody else's payment.
       *
       * `settled` is the only column the page treats as proof of payment. It is
       * computed on the server from the payment row the webhook wrote, which is why it
       * cannot be forged from a query string.
       */
      payment_status_for: {
        Args: { p_course_id: string }
        Returns: {
          course_id: string
          course_slug: string
          course_title: string
          price_centavos: number
          enrollment_status: Database['public']['Enums']['enrollment_status']
          payment_id: string | null
          payment_status: Database['public']['Enums']['payment_status'] | null
          reference_number: string | null
          amount_centavos: number | null
          paid_at: string | null
          settled: boolean
        }[]
      }

      price_a_payment: {
        Args: { in_course_id: string; in_gross_centavos: number }
        Returns: {
          instructor_id: string
          platform_fee_pct: number
          platform_fee_centavos: number
          instructor_share_centavos: number
        }[]
      }

      /**
       * Claims the right to send the receipt for one payment.
       *
       * `already_claimed: false` is returned only to the first caller, which is the one
       * that should send. A redelivered webhook gets `true` and sends nothing.
       */
      claim_payment_receipt: {
        Args: { in_payment_id: string; in_recipient: string }
        Returns: {
          payment_id: string
          status: Database['public']['Enums']['payment_receipt_status']
          already_claimed: boolean
        }[]
      }

      /** Records that the receipt was accepted by the mail server. Idempotent. */
      mark_payment_receipt_sent: { Args: { in_payment_id: string }; Returns: undefined }

      /** Records that a receipt could not be sent, with the reason. */
      mark_payment_receipt_failed: {
        Args: { in_payment_id: string; in_reason: string }
        Returns: undefined
      }

      /**
       * Sets the platform fee and records who set it. Does not touch existing payments:
       * each one carries the rate it was priced at, so changing this is prospective only.
       */
      admin_set_platform_fee: {
        Args: { in_platform_fee_pct: number }
        Returns: {
          id: number
          platform_fee_pct: number
          updated_at: string
          updated_by: string | null
        }[]
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
      payment_receipt_status: PaymentReceiptStatus

      quiz_status: QuizStatus
      question_type: QuestionType
      attempt_status: AttemptStatus
      assignment_status: AssignmentStatus
      submission_status: SubmissionStatus
      requirement_type: RequirementType
      notification_type: NotificationType
      payment_event_status: PaymentEventStatus
    }

    CompositeTypes: Record<never, never>
  }
}

/** Convenience alias for a single table's row shape. */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
