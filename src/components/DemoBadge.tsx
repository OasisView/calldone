import { Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function DemoBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-full outline-none">
          <Badge variant="secondary" className="gap-1 cursor-default select-none">
            <Info className="h-3 w-3" aria-hidden />
            Demo mode
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        Everything runs locally in your browser. No real phone call is placed,
        no data leaves your device, and nothing costs money.
      </TooltipContent>
    </Tooltip>
  )
}
