// localStorage-backed store for demo scripts and call logs. Stands in for the
// future Supabase tables; hooks are the only consumers, so the paid upgrade
// swaps this module without touching components.

import type { DemoCallLog, DemoScript } from "./types"

const STORAGE_KEY = "calldone:demo:v1"

interface StoreShape {
  scripts: DemoScript[]
  callLogs: DemoCallLog[]
}

function emptyShape(): StoreShape {
  return { scripts: [], callLogs: [] }
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function load(): StoreShape {
  if (!hasStorage()) return emptyShape()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyShape()
    const parsed = JSON.parse(raw) as Partial<StoreShape>
    return {
      scripts: Array.isArray(parsed.scripts) ? parsed.scripts : [],
      callLogs: Array.isArray(parsed.callLogs) ? parsed.callLogs : [],
    }
  } catch {
    return emptyShape()
  }
}

function save(shape: StoreShape): void {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape))
  } catch {
    // Storage full or blocked (private mode) — the demo degrades to in-memory.
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// ------------------------------------------------------------- scripts ---

export function listScripts(): DemoScript[] {
  return load().scripts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getScript(id: string): DemoScript | null {
  return load().scripts.find((s) => s.id === id) ?? null
}

export function saveScript(
  input: Omit<DemoScript, "id" | "createdAt" | "updatedAt">
): DemoScript {
  const now = new Date().toISOString()
  const script: DemoScript = { ...input, id: newId(), createdAt: now, updatedAt: now }
  const shape = load()
  shape.scripts.push(script)
  save(shape)
  return script
}

export function updateScript(
  id: string,
  patch: Partial<Pick<DemoScript, "scriptText" | "callPurpose" | "targetName">>
): DemoScript | null {
  const shape = load()
  const script = shape.scripts.find((s) => s.id === id)
  if (!script) return null
  Object.assign(script, patch, { updatedAt: new Date().toISOString() })
  save(shape)
  return script
}

// ------------------------------------------------------------ call logs ---

export function listCallLogs(): DemoCallLog[] {
  return load().callLogs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getCallLog(id: string): DemoCallLog | null {
  return load().callLogs.find((c) => c.id === id) ?? null
}

export function createCallLog(
  input: Omit<DemoCallLog, "id" | "createdAt" | "completedAt" | "status">
): DemoCallLog {
  const log: DemoCallLog = {
    ...input,
    id: newId(),
    status: "in_progress",
    createdAt: new Date().toISOString(),
    completedAt: null,
  }
  const shape = load()
  shape.callLogs.push(log)
  save(shape)
  return log
}

export function completeCallLog(id: string): DemoCallLog | null {
  const shape = load()
  const log = shape.callLogs.find((c) => c.id === id)
  if (!log) return null
  log.status = "completed"
  log.completedAt = new Date().toISOString()
  save(shape)
  return log
}

/** Test helper / "reset demo" affordance. */
export function clearAll(): void {
  if (hasStorage()) window.localStorage.removeItem(STORAGE_KEY)
}
