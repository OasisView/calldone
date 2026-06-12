// Canned, realistic call transcripts for the simulated demo call, plus the
// confirmed appointment each one produces. The appointment is always in the
// future (now + 3 days, 2:15 PM local) so the downloadable .ics is useful.

import { fillTemplate } from "./intents"
import type { Appointment, TranscriptLine } from "./types"

export function demoAppointmentDate(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setDate(d.getDate() + 3)
  d.setHours(14, 15, 0, 0)
  return d
}

function friendly(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

interface TranscriptTemplate {
  lines: TranscriptLine[]
  appointment: (slots: Record<string, string>, when: Date) => Appointment | null
}

const TEMPLATES: Record<string, TranscriptTemplate> = {
  "pharmacy-refill": {
    lines: [
      { speaker: "human", text: "Thank you for calling {pharmacyName}, how can I help you?" },
      { speaker: "agent", text: "Hi, this is an AI assistant calling on behalf of {userName}. Just so you know, this call may be recorded." },
      { speaker: "agent", text: "I'm calling to request a refill of {medicationName} for {userName}." },
      { speaker: "human", text: "Sure, one moment while I pull that up… okay, I see the prescription here." },
      { speaker: "human", text: "There's one refill remaining, so I can start that right away." },
      { speaker: "agent", text: "Wonderful. When will it be ready for pickup?" },
      { speaker: "human", text: "It should be ready by {whenFriendly}." },
      { speaker: "agent", text: "Perfect — {userName} will pick it up then. Could you confirm the pharmacy address for the calendar?" },
      { speaker: "human", text: "Of course, we're the {pharmacyName} location they usually use." },
      { speaker: "agent", text: "Great, thank you so much for your help. Have a wonderful day!" },
      { speaker: "human", text: "You too, goodbye!" },
    ],
    appointment: (slots, when) => ({
      title: `Pick up ${slots.medicationName ?? "prescription"} — ${slots.pharmacyName ?? "pharmacy"}`,
      startIso: when.toISOString(),
      endIso: null,
      location: slots.pharmacyName ?? null,
      notes: `Refill requested by Calldone for ${slots.userName ?? "you"}.`,
    }),
  },
  "appointment-booking": {
    lines: [
      { speaker: "human", text: "{businessName}, good afternoon!" },
      { speaker: "agent", text: "Hi, this is an AI assistant calling on behalf of {userName}. Just so you know, this call may be recorded." },
      { speaker: "agent", text: "I'd like to book {serviceType} for {userName}. Their availability is {preferredTime}." },
      { speaker: "human", text: "Let me check the schedule… we have an opening on {whenFriendly}. Would that work?" },
      { speaker: "agent", text: "That works well. Please book it under the name {userName}." },
      { speaker: "human", text: "Done! They're all set for {whenFriendly}." },
      { speaker: "agent", text: "Is there anything {userName} should bring or do beforehand?" },
      { speaker: "human", text: "Just arrive about ten minutes early — we'll take care of the rest." },
      { speaker: "agent", text: "Perfect, I've noted that. Thanks so much for your help!" },
      { speaker: "human", text: "Our pleasure. See them then!" },
    ],
    appointment: (slots, when) => ({
      title: `${slots.serviceType ?? "Appointment"} — ${slots.businessName ?? ""}`.trim(),
      startIso: when.toISOString(),
      endIso: null,
      location: slots.businessName ?? null,
      notes: `Booked by Calldone for ${slots.userName ?? "you"}. Arrive 10 minutes early.`,
    }),
  },
  "restaurant-reservation": {
    lines: [
      { speaker: "human", text: "Good evening, {restaurantName}!" },
      { speaker: "agent", text: "Hi, this is an AI assistant calling on behalf of {userName}. Just so you know, this call may be recorded." },
      { speaker: "agent", text: "I'd like to reserve a table for {partySize}, ideally {preferredTime}." },
      { speaker: "human", text: "Let me see what we have… we can seat {partySize} on {whenFriendly}." },
      { speaker: "agent", text: "That's great. Please put it under the name {userName}." },
      { speaker: "human", text: "Reserved! Table for {partySize} under {userName}, {whenFriendly}." },
      { speaker: "agent", text: "Any policies we should know about — grace period, dress code?" },
      { speaker: "human", text: "We hold tables for 15 minutes, and it's smart casual." },
      { speaker: "agent", text: "Noted. Thank you very much — see you then!" },
      { speaker: "human", text: "Thank you, we look forward to it!" },
    ],
    appointment: (slots, when) => ({
      title: `Dinner for ${slots.partySize ?? "2"} — ${slots.restaurantName ?? "restaurant"}`,
      startIso: when.toISOString(),
      endIso: null,
      location: slots.restaurantName ?? null,
      notes: `Reserved by Calldone under ${slots.userName ?? "your name"}. Held 15 min; smart casual.`,
    }),
  },
  "general-errand": {
    lines: [
      { speaker: "human", text: "Hello, {businessName} speaking." },
      { speaker: "agent", text: "Hi, this is an AI assistant calling on behalf of {userName}. Just so you know, this call may be recorded." },
      { speaker: "agent", text: "I'm calling about the following: {goal}." },
      { speaker: "human", text: "Okay, I can help with that. Give me just a second…" },
      { speaker: "human", text: "Alright, that's taken care of on our end." },
      { speaker: "agent", text: "Excellent. Is there anything {userName} needs to follow up on directly?" },
      { speaker: "human", text: "If anything else comes up we'll reach out, but you're all set — we can wrap up by {whenFriendly} at the latest." },
      { speaker: "agent", text: "Wonderful. Thanks very much for your help — have a great day!" },
      { speaker: "human", text: "You as well, goodbye!" },
    ],
    appointment: (slots, when) => ({
      title: `Follow-up: ${slots.goal ?? "errand"}`,
      startIso: when.toISOString(),
      endIso: null,
      location: slots.businessName ?? null,
      notes: `Handled by Calldone for ${slots.userName ?? "you"}.`,
    }),
  },
}

export function buildTranscript(
  intentId: string,
  slots: Record<string, string>,
  when: Date = demoAppointmentDate()
): TranscriptLine[] {
  const template = TEMPLATES[intentId] ?? TEMPLATES["general-errand"]
  const vars = { ...slots, whenFriendly: friendly(when) }
  return template.lines.map((line) => ({
    speaker: line.speaker,
    text: fillTemplate(line.text, vars),
  }))
}

export function buildAppointment(
  intentId: string,
  slots: Record<string, string>,
  when: Date = demoAppointmentDate()
): Appointment | null {
  const template = TEMPLATES[intentId] ?? TEMPLATES["general-errand"]
  return template.appointment(slots, when)
}
