// tests/disclosure.test.ts — R28 unit coverage for the disclosure helpers and
// the R26/R27 deterministic triggers in _shared/prompts.ts.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  containsDisclosure,
  disclosureGreeting,
  ensureDisclosure,
  looksSpanish,
  wantsHuman,
} from "../_shared/prompts.ts";
import { DISCLOSURE_REQUIRED_SUBSTRINGS } from "../_shared/api-types.ts";

Deno.test("disclosure: canonical greeting satisfies its own required substrings", () => {
  assert(containsDisclosure(disclosureGreeting("Harlem Food Pantry")));
});

Deno.test("disclosure: missing substrings → greeting is prepended", () => {
  const out = ensureDisclosure("How can I help?", "Harlem Food Pantry");
  for (const s of DISCLOSURE_REQUIRED_SUBSTRINGS) {
    assertStringIncludes(out.toLowerCase(), s.toLowerCase());
  }
  assertStringIncludes(out, "How can I help?");
});

Deno.test("disclosure: compliant text passes through unchanged", () => {
  const text = "Just so you know, I'm an AI and this call may be recorded. What do you need?";
  assertEquals(ensureDisclosure(text, "Org"), text);
});

Deno.test("disclosure: empty model text becomes the full greeting", () => {
  assertEquals(ensureDisclosure("", "Org"), disclosureGreeting("Org"));
});

Deno.test("escalation triggers: person/human/operator/DTMF fire; small talk doesn't (R26)", () => {
  assert(wantsHuman("can I speak to a person"));
  assert(wantsHuman("give me a HUMAN please"));
  assert(wantsHuman("operator"));
  assert(wantsHuman("0"));
  assert(!wantsHuman("my personal information changed"));
  assert(!wantsHuman("what are your hours"));
});

Deno.test("spanish detection: clear Spanish fires; English never does (R27)", () => {
  assert(looksSpanish("hola, necesito ayuda por favor"));
  assert(looksSpanish("¿Habla español?"));
  assert(!looksSpanish("hello I need help please"));
  assert(!looksSpanish("do you have a mission statement"));
  assert(!looksSpanish("I want to volunteer and help"));
});
