// Shared types for the browser-local demo engine. Field names deliberately
// mirror the future Supabase schema (docs/contracts/db.md) so the paid
// upgrade is a hook-swap, not a refactor.

export interface BrainstormMessage {
  role: "user" | "assistant"
  text: string
}

export interface DemoScript {
  id: string
  intentId: string
  scriptText: string
  callPurpose: string
  /** Display name of the business/person the call targets, e.g. "Walgreens". */
  targetName: string
  /** Clarifying-question answers collected during the brainstorm; used to
   *  render the simulated call transcript. */
  slots: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface TranscriptLine {
  speaker: "agent" | "human"
  text: string
}

export interface Appointment {
  title: string
  /** ISO 8601 with offset. */
  startIso: string
  /** null => assume 30 minutes when building the .ics. */
  endIso: string | null
  location: string | null
  notes: string | null
}

export type CallStatus = "in_progress" | "completed"

export interface DemoCallLog {
  id: string
  scriptId: string
  status: CallStatus
  phoneNumber: string | null
  transcript: TranscriptLine[]
  appointment: Appointment | null
  createdAt: string
  completedAt: string | null
}
