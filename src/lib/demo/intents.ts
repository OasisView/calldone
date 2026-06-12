// Intent definitions for the scripted demo brain. Each intent declares the
// clarifying questions ("slots") the agent asks, plus templates for the call
// script, the simulated transcript, and the resulting appointment.

export interface SlotDef {
  /** Key the answer is stored under, e.g. "pharmacyName". */
  key: string
  /** The clarifying question the agent asks. */
  question: string
}

export interface IntentDef {
  id: string
  /** Lower-cased keywords; first intent with a match wins. */
  keywords: string[]
  /** Friendly acknowledgement once the intent is recognized. */
  acknowledgement: string
  /** Asked in order; one per turn. {userName} is always asked last. */
  slots: SlotDef[]
  /** One-line purpose, e.g. 'Refill {medicationName} at {pharmacyName}'. */
  purposeTemplate: string
  /** The slot whose answer names the business being called. */
  targetSlot: string
  /** Full call script. Must keep both disclosure lines (see conversation.ts). */
  scriptTemplate: string
}

/** Asked once at the end of every intent so the disclosure line is personal. */
export const USER_NAME_SLOT: SlotDef = {
  key: "userName",
  question: "Almost done — who am I calling on behalf of? Just your first name is fine.",
}

export const DISCLOSURE_AI = "Hi, this is an AI assistant calling on behalf of {userName}."
export const DISCLOSURE_RECORDING = "Just so you know, this call may be recorded."

export const INTENTS: IntentDef[] = [
  {
    id: "pharmacy-refill",
    keywords: [
      "refill", "prescription", "pharmacy", "medication", "medicine", "meds", "rx",
    ],
    acknowledgement: "Got it — a prescription refill. I can definitely handle that call.",
    slots: [
      { key: "pharmacyName", question: "Which pharmacy should I call?" },
      { key: "medicationName", question: "What's the medication called? A close guess is fine." },
    ],
    purposeTemplate: "Refill {medicationName} at {pharmacyName}",
    targetSlot: "pharmacyName",
    scriptTemplate: [
      DISCLOSURE_AI,
      DISCLOSURE_RECORDING,
      "",
      "I'm calling to request a refill of {medicationName} for {userName}.",
      "Could you check whether the prescription has refills remaining and get it started?",
      "If it needs the prescriber's approval, please begin that process and let me know the expected timing.",
      "Finally, could you tell me when it will be ready for pickup?",
      "",
      "Thank you so much for your help!",
    ].join("\n"),
  },
  {
    id: "appointment-booking",
    keywords: [
      "appointment", "doctor", "dentist", "dermatologist", "checkup", "check-up",
      "schedule", "book a visit", "salon", "haircut", "barber", "vet",
    ],
    acknowledgement: "Sure — let's get that appointment booked.",
    slots: [
      { key: "businessName", question: "Who should I call to book it? The office or business name works." },
      { key: "serviceType", question: "What kind of appointment is it? For example, a cleaning, a checkup, a haircut…" },
      { key: "preferredTime", question: "When works best for you? Mornings, afternoons, a specific day?" },
    ],
    purposeTemplate: "Book {serviceType} at {businessName}",
    targetSlot: "businessName",
    scriptTemplate: [
      DISCLOSURE_AI,
      DISCLOSURE_RECORDING,
      "",
      "I'd like to book {serviceType} for {userName}.",
      "Their availability is: {preferredTime}. Could you offer the closest open slot?",
      "Once we settle on a time, please put it under the name {userName}.",
      "Could you also let me know if there's anything they should bring or do beforehand?",
      "",
      "Thanks very much — looking forward to the confirmation.",
    ].join("\n"),
  },
  {
    id: "restaurant-reservation",
    keywords: [
      "reservation", "table", "restaurant", "dinner", "lunch", "brunch", "reserve",
    ],
    acknowledgement: "Nice — a reservation. Consider it handled.",
    slots: [
      { key: "restaurantName", question: "Which restaurant should I call?" },
      { key: "partySize", question: "How many people will be joining?" },
      { key: "preferredTime", question: "What day and time would you like?" },
    ],
    purposeTemplate: "Reserve a table for {partySize} at {restaurantName}",
    targetSlot: "restaurantName",
    scriptTemplate: [
      DISCLOSURE_AI,
      DISCLOSURE_RECORDING,
      "",
      "I'd like to make a reservation for {partySize}, under the name {userName}.",
      "The preferred time is {preferredTime} — if that's unavailable, the closest alternative works.",
      "Could you confirm whether you can seat us then, and mention any reservation policies we should know about?",
      "",
      "Thank you — please confirm the final time and we're all set.",
    ].join("\n"),
  },
  {
    // Fallback when nothing matches: a generic errand call.
    id: "general-errand",
    keywords: [],
    acknowledgement: "Okay — I can make that call for you.",
    slots: [
      { key: "businessName", question: "Who should I call? A business or person's name works." },
      { key: "goal", question: "And what's the one thing you'd like to come away with from the call?" },
    ],
    purposeTemplate: "Call {businessName}: {goal}",
    targetSlot: "businessName",
    scriptTemplate: [
      DISCLOSURE_AI,
      DISCLOSURE_RECORDING,
      "",
      "I'm calling on a quick matter for {userName}: {goal}.",
      "Could you help me with that, or point me to the right person if someone else handles it?",
      "If anything needs a follow-up from {userName} directly, let me know what they should do and by when.",
      "",
      "Thanks so much for your help!",
    ].join("\n"),
  },
]

export const FALLBACK_INTENT_ID = "general-errand"

export function classifyIntent(text: string): IntentDef {
  const lower = text.toLowerCase()
  const match = INTENTS.find(
    (intent) => intent.keywords.length > 0 && intent.keywords.some((k) => lower.includes(k))
  )
  return match ?? INTENTS.find((i) => i.id === FALLBACK_INTENT_ID)!
}

export function getIntent(intentId: string): IntentDef {
  return INTENTS.find((i) => i.id === intentId) ?? INTENTS.find((i) => i.id === FALLBACK_INTENT_ID)!
}

/** Replace every {slotKey} in a template with collected slot values. */
export function fillTemplate(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => slots[key] ?? `[${key}]`)
}
