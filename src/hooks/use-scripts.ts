import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"

import { getScript, listScripts, updateScript } from "@/lib/demo/store"
import type { DemoScript } from "@/lib/demo/types"

const KEYS = {
  all: ["demo-scripts"] as const,
  detail: (id: string) => ["demo-scripts", id] as const,
}

export function useScripts(): UseQueryResult<DemoScript[]> {
  return useQuery({ queryKey: KEYS.all, queryFn: () => listScripts() })
}

export function useScript(scriptId: string): UseQueryResult<DemoScript | null> {
  return useQuery({
    queryKey: KEYS.detail(scriptId),
    queryFn: () => getScript(scriptId),
  })
}

export function useUpdateScript(): UseMutationResult<
  DemoScript | null,
  Error,
  { scriptId: string; scriptText: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ scriptId, scriptText }) => updateScript(scriptId, { scriptText }),
    onSuccess: (_, { scriptId }) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all })
      void queryClient.invalidateQueries({ queryKey: KEYS.detail(scriptId) })
    },
  })
}
