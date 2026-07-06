// supabase/functions/_shared/kb.ts
// Loads an org's PUBLISHED knowledge pack as prompt text (api.md §4). The pack
// is untrusted org-authored content: prompts.ts wraps it in data-not-instruction
// delimiters. Budget: LIMITS.KB_PACK_MAX_CHARS (defensive truncation here even
// though publish-time enforcement exists app-side).
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIMITS } from "./api-types.ts";

export interface KnowledgeEntryRow {
  question: string;
  answer: string;
  position: number;
}

/** Returns the org's published pack rendered as Q/A text, or null when no pack
 *  is published. Entries are ordered by position. */
export async function loadPublishedPack(
  admin: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data: pack, error: packErr } = await admin
    .from("knowledge_packs")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "published")
    .maybeSingle();
  if (packErr || !pack) return null;

  const { data: entries, error: entErr } = await admin
    .from("knowledge_entries")
    .select("question, answer, position")
    .eq("pack_id", (pack as { id: string }).id);
  if (entErr || !entries || (entries as KnowledgeEntryRow[]).length === 0) return null;

  const sorted = [...(entries as KnowledgeEntryRow[])].sort((a, b) => a.position - b.position);
  let out = "";
  for (const e of sorted) {
    const block = `Q: ${e.question}\nA: ${e.answer}\n\n`;
    if (out.length + block.length > LIMITS.KB_PACK_MAX_CHARS) break;
    out += block;
  }
  return out.trimEnd() || null;
}
