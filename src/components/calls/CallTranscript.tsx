// src/components/calls/CallTranscript.tsx — renders call_logs.transcript. The
// transcript is plain "speaker: text" lines; it is rendered as TEXT NODES only
// (no dangerouslySetInnerHTML anywhere in this workstream — security.md §10).
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface CallTranscriptProps {
  transcript: string | null
  summary?: string | null
}

interface TranscriptLine {
  speaker: string | null
  text: string
}

/** Split "speaker: text" lines; lines without a colon render as plain text. */
function parseLines(transcript: string): TranscriptLine[] {
  return transcript
    .split("\n")
    .map((raw) => raw.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const idx = line.indexOf(":")
      if (idx > 0 && idx < 40) {
        return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
      }
      return { speaker: null, text: line }
    })
}

export function CallTranscript({ transcript, summary }: CallTranscriptProps) {
  const hasTranscript = Boolean(transcript && transcript.trim().length > 0)
  const lines = hasTranscript ? parseLines(transcript as string) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transcript</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{summary}</p>
        ) : null}

        {hasTranscript ? (
          <div className="space-y-2">
            {lines.map((line, i) => (
              <p key={i} className="text-sm">
                {line.speaker ? (
                  <span className="font-medium text-foreground">{line.speaker}: </span>
                ) : null}
                {/* Rendered as a text node — never as HTML. */}
                <span className="text-muted-foreground">{line.text}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No transcript is available for this call.</p>
        )}
      </CardContent>
    </Card>
  )
}
