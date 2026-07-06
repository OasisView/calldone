// supabase/functions/_shared/gemini.ts
// Gemini REST client incl. tool-call plumbing (api.md §4). Model
// gemini-2.5-flash. The AGENT_TOOLS function declarations (api-types.ts names;
// arg shapes validated again by zod in schemas.ts before any DB write) are
// frozen here. Core client salvaged from the Checkpoint-2 ws/edge build.
import { withRetry } from "./retry.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// --------------------------------------------------------------- tool decls ---
// Gemini-format declarations for the api-types AGENT_TOOLS. The brain executes
// capture_intake/book_appointment itself; request_transfer/take_voicemail/
// end_call surface as provider control actions via the adapter.

export const AGENT_TOOL_DECLS = [
  {
    name: "capture_intake",
    description:
      "Save or update the caller's intake record. Call as soon as you know what they need; " +
      "update again when new fields arrive. callback_consent MUST reflect an explicit yes/no " +
      "answer to the consent question — never assume.",
    parameters: {
      type: "OBJECT",
      properties: {
        caller_name: { type: "STRING", nullable: true },
        need: { type: "STRING", description: "What the caller needs, in one or two sentences." },
        callback_number: {
          type: "STRING",
          nullable: true,
          description: "E.164, e.g. +12125551234. Null if not provided.",
        },
        callback_consent: {
          type: "BOOLEAN",
          description: "True ONLY if the caller explicitly agreed to a callback.",
        },
        preferred_time: { type: "STRING", nullable: true },
      },
      required: ["need", "callback_consent"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment ONLY when the caller and you have agreed on an explicit date and time.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        start_iso: { type: "STRING", description: "ISO 8601 WITH timezone offset." },
        end_iso: { type: "STRING", nullable: true, description: "ISO 8601 or null (30 min default)." },
        location: { type: "STRING", nullable: true },
      },
      required: ["title", "start_iso", "end_iso", "location"],
    },
  },
  {
    name: "request_transfer",
    description: "Transfer the caller to a staff member (they asked for a person, or policy requires it).",
    parameters: {
      type: "OBJECT",
      properties: { reason: { type: "STRING", nullable: true } },
    },
  },
  {
    name: "take_voicemail",
    description: "Switch to taking a voicemail message (no staff available or transfer failed).",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "end_call",
    description: "End the call after goodbyes are complete.",
    parameters: { type: "OBJECT", properties: {} },
  },
] as const;

// ------------------------------------------------------------- wire types ---

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GeminiGenerateArgs {
  systemInstruction: string;
  contents: GeminiContent[];
  tools?: readonly GeminiFunctionDeclaration[];
  toolMode?: "AUTO" | "ANY" | "NONE";
  signal?: AbortSignal;
}

export interface GeminiResult {
  text: string | null;
  /** ALL functionCall parts in order (Gemini may emit several per turn). */
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>;
  raw: unknown;
}

/** Marks a definitive upstream failure (after retries) so callers can map it. */
export class GeminiUpstreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GeminiUpstreamError";
  }
}

function apiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("missing GEMINI_API_KEY");
  return key;
}

/** generateContent with retry (3 attempts; 5xx/network retry, 4xx fatal). The
 *  fetch impl is injectable for tests. */
export async function geminiGenerate(
  args: GeminiGenerateArgs,
  fetchImpl: typeof fetch = fetch,
): Promise<GeminiResult> {
  const body = {
    systemInstruction: { parts: [{ text: args.systemInstruction }] },
    contents: args.contents,
    ...(args.tools && args.tools.length > 0
      ? {
        tools: [{ functionDeclarations: args.tools }],
        toolConfig: { functionCallingConfig: { mode: args.toolMode ?? "AUTO" } },
      }
      : {}),
  };

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey()}`;

  const json = await withRetry(
    async () => {
      const resp = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: args.signal,
      });
      if (resp.status >= 500) {
        throw new GeminiUpstreamError(`gemini ${resp.status}`, resp.status);
      }
      if (!resp.ok) {
        const err = new GeminiUpstreamError(`gemini ${resp.status}`, resp.status);
        (err as { fatal?: boolean }).fatal = true;
        throw err;
      }
      return await resp.json();
    },
    { attempts: 3, shouldRetry: (e) => !(e as { fatal?: boolean })?.fatal },
  );

  const candidate = (json as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  })?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  let text: string | null = null;
  const functionCalls: GeminiResult["functionCalls"] = [];
  for (const part of parts) {
    if (part.functionCall) {
      functionCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
    }
    if (typeof part.text === "string" && text === null) text = part.text;
  }

  return { text, functionCalls, raw: json };
}
