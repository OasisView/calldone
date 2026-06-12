// The scripted demo "brain": a deterministic state machine that classifies the
// user's first message into an intent, asks one clarifying question per turn,
// and then renders the final call script. Runs entirely in the browser. The
// paid upgrade swaps this module for the gemini-conversation edge function;
// the surface (nextTurn) is shaped to make that swap painless.

import {
  classifyIntent,
  fillTemplate,
  getIntent,
  USER_NAME_SLOT,
  type IntentDef,
} from "./intents"

export interface ConversationState {
  intentId: string | null
  slots: Record<string, string>
  /** Index into [intent.slots..., USER_NAME_SLOT]; the question we last asked. */
  askedSlotIndex: number
  done: boolean
}

export interface FinalizedScript {
  intentId: string
  scriptText: string
  callPurpose: string
  targetName: string
  slots: Record<string, string>
}

export interface TurnResult {
  state: ConversationState
  /** The agent's next utterance (TTS-ready plain text). */
  reply: string
  /** Present exactly once, on the turn the script is finalized. */
  finalized?: FinalizedScript
}

export const INITIAL_STATE: ConversationState = {
  intentId: null,
  slots: {},
  askedSlotIndex: -1,
  done: false,
}

export const GREETING =
  "Hi! I'm Calldone. Tell me what you need handled — a prescription refill, " +
  "an appointment, a reservation — and I'll make the call for you."

const MAX_SLOT_ANSWER_CHARS = 120

function slotList(intent: IntentDef) {
  return [...intent.slots, USER_NAME_SLOT]
}

function cleanAnswer(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, MAX_SLOT_ANSWER_CHARS)
}

/** The two disclosure lines are a hard invariant: every finalized script must
 *  open with them, even if a template is edited carelessly later. */
export function ensureDisclosures(scriptText: string, userName: string): string {
  const aiLine = `Hi, this is an AI assistant calling on behalf of ${userName}.`
  const recLine = "Just so you know, this call may be recorded."
  let out = scriptText
  if (!/AI assistant calling on behalf of/i.test(out)) out = `${aiLine}\n${out}`
  if (!/call may be recorded/i.test(out)) {
    const lines = out.split("\n")
    lines.splice(1, 0, recLine)
    out = lines.join("\n")
  }
  return out
}

export function nextTurn(state: ConversationState, userText: string): TurnResult {
  const text = cleanAnswer(userText)
  if (state.done) {
    return {
      state,
      reply: "This brainstorm is wrapped up — review your script, or start a new call from the dashboard.",
    }
  }
  if (!text) {
    return { state, reply: "Sorry, I didn't catch that — could you say it again?" }
  }

  // First user turn: classify the intent, acknowledge, ask the first question.
  if (state.intentId === null) {
    const intent = classifyIntent(text)
    const slots: Record<string, string> = { request: text }
    const first = slotList(intent)[0]
    return {
      state: { intentId: intent.id, slots, askedSlotIndex: 0, done: false },
      reply: `${intent.acknowledgement} ${first.question}`,
    }
  }

  // Subsequent turns: store the answer to the question we asked, ask the next.
  const intent = getIntent(state.intentId)
  const questions = slotList(intent)
  const answered = questions[state.askedSlotIndex]
  const slots = { ...state.slots, [answered.key]: text }

  const nextIndex = state.askedSlotIndex + 1
  if (nextIndex < questions.length) {
    return {
      state: { ...state, slots, askedSlotIndex: nextIndex },
      reply: questions[nextIndex].question,
    }
  }

  // All slots filled — finalize the script.
  const userName = slots[USER_NAME_SLOT.key] ?? "the caller"
  const scriptText = ensureDisclosures(fillTemplate(intent.scriptTemplate, slots), userName)
  const finalized: FinalizedScript = {
    intentId: intent.id,
    scriptText,
    callPurpose: fillTemplate(intent.purposeTemplate, slots),
    targetName: slots[intent.targetSlot] ?? "the business",
    slots,
  }
  return {
    state: { ...state, slots, askedSlotIndex: nextIndex, done: true },
    reply:
      `Done — I've drafted your call script, ${userName}. ` +
      "Give it a quick read, tweak anything you like, and hit “Call now” when you're ready.",
    finalized,
  }
}
