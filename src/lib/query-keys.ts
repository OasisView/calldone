export const queryKeys = {
  session: ["session"] as const,
  profile: (userId: string) => ["profile", userId] as const,
  scripts: {
    all: (userId: string) => ["scripts", userId] as const,
    detail: (scriptId: string) => ["scripts", "detail", scriptId] as const,
  },
  callLogs: {
    all: (userId: string) => ["call-logs", userId] as const,
    detail: (callLogId: string) => ["call-logs", "detail", callLogId] as const,
  },
  brainstorm: (sessionId: string) => ["brainstorm", sessionId] as const,
} as const
