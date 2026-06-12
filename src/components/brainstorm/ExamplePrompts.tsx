import { Button } from "@/components/ui/button"

const EXAMPLES = [
  "Refill my blood pressure medication at Walgreens",
  "Book me a dental cleaning next week",
  "Reserve a table for four on Friday night",
]

export function ExamplePrompts({ onPick }: { onPick(text: string): void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {EXAMPLES.map((example) => (
        <Button
          key={example}
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full text-xs"
          onClick={() => onPick(example)}
        >
          {example}
        </Button>
      ))}
    </div>
  )
}
