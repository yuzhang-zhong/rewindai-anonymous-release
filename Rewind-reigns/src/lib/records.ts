import type { CounterfactualReflection, GameRecord, GameState, Language } from "../types";

const storageKey = "mirror-campus-records-v1";
const sensitiveRecordKeyPatterns = [
  "api_key",
  "apikey",
  "authorization",
  "bearer",
  "generationguidance",
  "groundingcontext",
  "password",
  "secret",
  "token",
  "trace_token"
];

function redactCredentialLikeText(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_/\-+=]{8,}/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/\b(api[_-]?key|token|secret|password|authorization|bearer)\b\s*[:=]\s*['"]?[^'"\s,;]+/gi, "$1=[redacted]");
}

function sanitizeStoredValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStoredValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveRecordKeyPatterns.some((pattern) => key.toLowerCase().includes(pattern)))
        .map(([key, item]) => [key, sanitizeStoredValue(item)])
    );
  }

  if (typeof value === "string") {
    return redactCredentialLikeText(value);
  }

  return value;
}

function sanitizeStoredRecords(value: unknown): GameRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return sanitizeStoredValue(value) as GameRecord[];
}

function readRawRecords(): GameRecord[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return sanitizeStoredRecords(parsed);
  } catch {
    return [];
  }
}

function writeRawRecords(records: GameRecord[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(sanitizeStoredRecords(records).slice(0, 20)));
}

export function loadRecords() {
  return readRawRecords().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function upsertRecord(state: GameState, language: Language) {
  const now = new Date().toISOString();
  const records = readRawRecords();
  const existing = records.find((record) => record.sessionId === state.sessionId);
  const nextRecord: GameRecord = {
    sessionId: state.sessionId,
    rulerName: state.rulerName,
    language,
    startedAt: existing?.startedAt ?? state.initialSnapshot.initializedAt,
    updatedAt: now,
    initialSnapshot: state.initialSnapshot,
    finalState: {
      meters: state.meters,
      yearsInPower: state.yearsInPower,
      year: state.year,
      ended: state.ended,
      ending: state.ending,
      endingZh: state.endingZh
    },
    history: state.history,
    reflection: existing?.reflection,
    selfReflection: existing?.selfReflection,
    generalReflection: existing?.generalReflection
  };

  const sanitizedRecord = sanitizeStoredRecords([nextRecord])[0];
  writeRawRecords([sanitizedRecord, ...records.filter((record) => record.sessionId !== state.sessionId)]);
  return sanitizedRecord;
}

export function updateRecordReflection(sessionId: string, reflection: CounterfactualReflection) {
  const records = readRawRecords();
  const existing = records.find((record) => record.sessionId === sessionId);
  if (!existing) {
    return null;
  }

  const nextRecord: GameRecord = {
    ...existing,
    updatedAt: reflection.updated_at,
    reflection
  };
  const sanitizedRecord = sanitizeStoredRecords([nextRecord])[0];
  writeRawRecords([sanitizedRecord, ...records.filter((record) => record.sessionId !== sessionId)]);
  return sanitizedRecord;
}

export function updateRecordSelfReflection(sessionId: string, text: string) {
  const records = readRawRecords();
  const existing = records.find((record) => record.sessionId === sessionId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const nextRecord: GameRecord = {
    ...existing,
    updatedAt: now,
    selfReflection: {
      text,
      created_at: existing.selfReflection?.created_at ?? now,
      updated_at: now
    }
  };
  const sanitizedRecord = sanitizeStoredRecords([nextRecord])[0];
  writeRawRecords([sanitizedRecord, ...records.filter((record) => record.sessionId !== sessionId)]);
  return sanitizedRecord;
}

export function updateRecordGeneralReflection(sessionId: string, text: string, source: string) {
  const records = readRawRecords();
  const existing = records.find((record) => record.sessionId === sessionId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const nextRecord: GameRecord = {
    ...existing,
    updatedAt: now,
    generalReflection: {
      text,
      source,
      created_at: existing.generalReflection?.created_at ?? now,
      updated_at: now
    }
  };
  const sanitizedRecord = sanitizeStoredRecords([nextRecord])[0];
  writeRawRecords([sanitizedRecord, ...records.filter((record) => record.sessionId !== sessionId)]);
  return sanitizedRecord;
}
