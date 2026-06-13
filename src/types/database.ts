// src/types/database.ts
// ============================================================================
// DB row types for the 9 Calldone product tables, derived from the frozen DDL
// (docs/contracts/db.md §3). Field names are snake_case and mirror the SQL
// columns verbatim; nullability matches the column definitions. Generated from
// the frozen schema per R14 — never hand-maintained as a second mirror.
//
// For each table: <Name> (full Row), <Name>Insert (server-defaulted/optional
// columns optional), <Name>Update (all columns optional).
// ============================================================================

import type { AppointmentDetails } from "@/types/api";

// ---------------------------------------------------------------- shared ---

/** profiles.communication_style — jsonb object (db.md §3.1; NOT NULL default '{}'). */
export type CommunicationStyle = Record<string, unknown>;

/** brainstorm_sessions.transcript — jsonb array of conversation turns (db.md §3.3).
 *  audio_url stays null in Phases 1-4 (audio is never stored). */
export interface BrainstormTranscriptEntry {
  role: "user" | "assistant";
  text: string;
  audio_url?: string | null;
}

/** anonymous_events.metadata — jsonb object, no PII (db.md §3.9). */
export type AnonymousEventMetadata = Record<string, unknown>;

// -------------------------------------------------------------- profiles ---
// db.md §3.1 — one row per auth.users row (incl. anonymous), trigger-created.

export interface Profile {
  id: string; //                            uuid PK, FK → auth.users(id)
  display_name: string | null; //           null or <= 120 chars
  phone_number: string | null; //           null or E.164
  phone_verified_at: string | null; //      timestamptz; never client-writable (R9)
  time_zone: string | null; //              null or <= 64 chars
  communication_style: CommunicationStyle; // jsonb object, NOT NULL default '{}'
  style_summary: string | null; //          null or <= 4000 chars; service-role-only write (P5)
  created_at: string; //                     timestamptz
  updated_at: string; //                     timestamptz
}

/** INSERT is trigger-only (no client INSERT); shape kept for service-role/tests. */
export interface ProfileInsert {
  id: string;
  display_name?: string | null;
  phone_number?: string | null;
  phone_verified_at?: string | null;
  time_zone?: string | null;
  communication_style?: CommunicationStyle;
  style_summary?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileUpdate {
  id?: string;
  display_name?: string | null;
  phone_number?: string | null;
  phone_verified_at?: string | null;
  time_zone?: string | null;
  communication_style?: CommunicationStyle;
  style_summary?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ------------------------------------------------------------ user_facts ---
// db.md §3.2 — RAG memory; upsert by (user_id, key). Anon may not write (R8).

export interface UserFact {
  id: string; //          uuid PK
  user_id: string; //     uuid FK → profiles(id)
  key: string; //         1-100 chars
  value: string; //       1-2000 chars
  source: string; //      'onboarding' | 'brainstorm' | 'manual'; default 'manual'
  confidence: number; //  real, 0-1; default 1.0
  created_at: string; //  timestamptz
  updated_at: string; //  timestamptz
}

export interface UserFactInsert {
  id?: string;
  user_id: string;
  key: string;
  value: string;
  source?: string;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
}

export interface UserFactUpdate {
  id?: string;
  user_id?: string;
  key?: string;
  value?: string;
  source?: string;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
}

// --------------------------------------------------- brainstorm_sessions ---
// db.md §3.3 — transcript is a jsonb array; resulting_script_id closes the
// circular ref to call_scripts (ON DELETE SET NULL).

export interface BrainstormSession {
  id: string; //                          uuid PK
  user_id: string; //                     uuid FK → profiles(id)
  transcript: BrainstormTranscriptEntry[]; // jsonb array, NOT NULL default '[]'
  resulting_script_id: string | null; //  uuid FK → call_scripts(id)
  created_at: string; //                  timestamptz
  updated_at: string; //                  timestamptz
}

export interface BrainstormSessionInsert {
  id?: string;
  user_id: string;
  transcript?: BrainstormTranscriptEntry[];
  resulting_script_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BrainstormSessionUpdate {
  id?: string;
  user_id?: string;
  transcript?: BrainstormTranscriptEntry[];
  resulting_script_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ----------------------------------------------------------- call_scripts ---
// db.md §3.4

export interface CallScript {
  id: string; //                       uuid PK
  user_id: string; //                  uuid FK → profiles(id)
  script_text: string; //              1-20000 chars
  call_purpose: string | null; //      null or <= 500 chars
  source: string; //                   'brainstorm' | 'manual_edit' | 'duplicated'; default 'brainstorm'
  brainstorm_session_id: string | null; // uuid FK → brainstorm_sessions(id)
  is_favorite: boolean; //             default false
  created_at: string; //               timestamptz
  updated_at: string; //               timestamptz
}

export interface CallScriptInsert {
  id?: string;
  user_id: string;
  script_text: string;
  call_purpose?: string | null;
  source?: string;
  brainstorm_session_id?: string | null;
  is_favorite?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CallScriptUpdate {
  id?: string;
  user_id?: string;
  script_text?: string;
  call_purpose?: string | null;
  source?: string;
  brainstorm_session_id?: string | null;
  is_favorite?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ------------------------------------------------------ script_edit_events ---
// db.md §3.5 — append-only style-learning signal; SELECT + INSERT only, anon
// may not write (R8). No updated_at, no update trigger.

export interface ScriptEditEvent {
  id: string; //             uuid PK
  user_id: string; //        uuid FK → profiles(id)
  script_id: string; //      uuid FK → call_scripts(id)
  original_text: string; //  <= 20000 chars
  edited_text: string; //    <= 20000 chars
  created_at: string; //     timestamptz
}

export interface ScriptEditEventInsert {
  id?: string;
  user_id: string;
  script_id: string;
  original_text: string;
  edited_text: string;
  created_at?: string;
}

export interface ScriptEditEventUpdate {
  id?: string;
  user_id?: string;
  script_id?: string;
  original_text?: string;
  edited_text?: string;
  created_at?: string;
}

// -------------------------------------------------------------- call_logs ---
// db.md §3.6 — INSERT by make-call (service role); UPDATE by call-webhook.
// All client writes are service-role-only (R5). appointment_details reuses the
// AppointmentDetails type from @/types/api.

export interface CallLog {
  id: string; //                          uuid PK
  user_id: string; //                     uuid FK → profiles(id)
  script_id: string | null; //            uuid FK → call_scripts(id)
  bland_call_id: string | null; //        null or <= 128 chars
  is_demo: boolean; //                    default true (R5)
  phone_number_called: string | null; //  null or E.164
  status: string; //                      CallStatus enum; default 'initiated'
  transcript: string | null; //           nullable
  duration_seconds: number | null; //     integer, null or >= 0
  appointment_details: AppointmentDetails | null; // jsonb object or null
  confirmation_detected: boolean | null; // null = extraction not yet run
  error_reason: string | null; //         nullable
  created_at: string; //                  timestamptz
  updated_at: string; //                  timestamptz
}

export interface CallLogInsert {
  id?: string;
  user_id: string;
  script_id?: string | null;
  bland_call_id?: string | null;
  is_demo?: boolean;
  phone_number_called?: string | null;
  status?: string;
  transcript?: string | null;
  duration_seconds?: number | null;
  appointment_details?: AppointmentDetails | null;
  confirmation_detected?: boolean | null;
  error_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CallLogUpdate {
  id?: string;
  user_id?: string;
  script_id?: string | null;
  bland_call_id?: string | null;
  is_demo?: boolean;
  phone_number_called?: string | null;
  status?: string;
  transcript?: string | null;
  duration_seconds?: number | null;
  appointment_details?: AppointmentDetails | null;
  confirmation_detected?: boolean | null;
  error_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

// --------------------------------------------------------- scheduled_calls ---
// db.md §3.7 — P6 feature; schema frozen now, SELECT-only client access (R10).

export interface ScheduledCall {
  id: string; //              uuid PK
  user_id: string; //         uuid FK → profiles(id)
  script_id: string; //       uuid FK → call_scripts(id)
  scheduled_for: string; //   timestamptz
  phone_number: string; //    E.164
  status: string; //          'pending' | 'placed' | 'failed' | 'cancelled'; default 'pending'
  call_log_id: string | null; // uuid FK → call_logs(id)
  attempt_count: number; //   integer, 0-10; default 0
  last_error: string | null; // nullable
  created_at: string; //      timestamptz
  updated_at: string; //      timestamptz
}

export interface ScheduledCallInsert {
  id?: string;
  user_id: string;
  script_id: string;
  scheduled_for: string;
  phone_number: string;
  status?: string;
  call_log_id?: string | null;
  attempt_count?: number;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduledCallUpdate {
  id?: string;
  user_id?: string;
  script_id?: string;
  scheduled_for?: string;
  phone_number?: string;
  status?: string;
  call_log_id?: string | null;
  attempt_count?: number;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------- script_feedback ---
// db.md §3.8 — one row per (user, script); 1 = thumbs down, 5 = thumbs up.
// Anon may not write (R8). No updated_at, no update trigger.

export interface ScriptFeedback {
  id: string; //          uuid PK
  user_id: string; //     uuid FK → profiles(id)
  script_id: string; //   uuid FK → call_scripts(id)
  rating: number; //      smallint, 1-5
  note: string | null; // null or <= 2000 chars
  created_at: string; //  timestamptz
}

export interface ScriptFeedbackInsert {
  id?: string;
  user_id: string;
  script_id: string;
  rating: number;
  note?: string | null;
  created_at?: string;
}

export interface ScriptFeedbackUpdate {
  id?: string;
  user_id?: string;
  script_id?: string;
  rating?: number;
  note?: string | null;
  created_at?: string;
}

// --------------------------------------------------------- anonymous_events ---
// db.md §3.9 — aggregate analytics, no PII. Service-role only (zero client
// access). id is bigint identity → number.

export interface AnonymousEvent {
  id: number; //         bigint PK, generated always as identity
  event_type: string; // 1-100 chars
  metadata: AnonymousEventMetadata; // jsonb object, NOT NULL default '{}'
  created_at: string; // timestamptz
}

export interface AnonymousEventInsert {
  id?: number;
  event_type: string;
  metadata?: AnonymousEventMetadata;
  created_at?: string;
}

export interface AnonymousEventUpdate {
  id?: number;
  event_type?: string;
  metadata?: AnonymousEventMetadata;
  created_at?: string;
}
