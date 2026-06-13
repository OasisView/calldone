// src/components/calls/ScriptEditor.tsx — editable textarea for a script's text
// on ScriptReview. Presentational: it holds local draft state and calls onSave
// with the new text; persistence (incl. the !isAnonymous script_edit_events
// append, R8) lives in useUpdateScript. Dirty-tracking avoids a no-op save.
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface ScriptEditorProps {
  scriptText: string
  onSave: (scriptText: string) => void
  isSaving?: boolean
  saveError?: string | null
  disabled?: boolean
}

export function ScriptEditor({
  scriptText,
  onSave,
  isSaving,
  saveError,
  disabled,
}: ScriptEditorProps) {
  const [draft, setDraft] = useState(scriptText)

  // Re-sync when the underlying script changes (e.g. after a successful save
  // refetch or navigating to a different script).
  useEffect(() => {
    setDraft(scriptText)
  }, [scriptText])

  const dirty = draft.trim() !== scriptText.trim()

  return (
    <div className="space-y-2">
      <Label htmlFor="script-editor">Call script</Label>
      <Textarea
        id="script-editor"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled || isSaving}
        rows={12}
        className="font-mono text-sm"
        aria-invalid={Boolean(saveError)}
      />
      {saveError ? (
        <p className="text-sm text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || isSaving || disabled}
          onClick={() => onSave(draft)}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save changes
        </Button>
        {dirty && !isSaving ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDraft(scriptText)}
          >
            Discard
          </Button>
        ) : null}
      </div>
    </div>
  )
}
