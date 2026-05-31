import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Pool, type PoolClient } from "pg";
import { nowIso, subtractMinutes } from "./time";
import type {
  AppState,
  ExtractionDraft,
  ExtractionPayload,
  InputType,
  RawInput,
  StoredChecklistItem,
  StoredEvent,
  StoredNotification,
  StoredTodo
} from "./types";

type Snapshot = AppState & {
  rawInputs: RawInput[];
};

const localPath = path.join(process.cwd(), ".data", "schedule-butler.json");
let pool: Pool | null = null;
let schemaReady = false;

const emptySnapshot = (): Snapshot => ({
  rawInputs: [],
  drafts: [],
  events: [],
  todos: [],
  checklistItems: [],
  notifications: []
});

export async function createRawInput(inputType: InputType, content: string) {
  if (usePostgres()) return createRawInputPg(inputType, content);
  const snapshot = await readLocal();
  const rawInput: RawInput = {
    id: crypto.randomUUID(),
    input_type: inputType,
    content,
    created_at: nowIso()
  };
  snapshot.rawInputs.unshift(rawInput);
  await writeLocal(snapshot);
  return rawInput;
}

export async function createDraft(rawInputId: string, payload: ExtractionPayload) {
  if (usePostgres()) return createDraftPg(rawInputId, payload);
  const snapshot = await readLocal();
  const draft: ExtractionDraft = {
    id: crypto.randomUUID(),
    raw_input_id: rawInputId,
    classification: payload.classification,
    status: "pending",
    payload,
    assistant_message: payload.assistant_message,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  snapshot.drafts.unshift(draft);
  await writeLocal(snapshot);
  return draft;
}

export async function getAppState(): Promise<AppState> {
  if (usePostgres()) return getAppStatePg();
  const snapshot = await readLocal();
  return {
    drafts: snapshot.drafts,
    events: snapshot.events,
    todos: snapshot.todos,
    checklistItems: snapshot.checklistItems,
    notifications: snapshot.notifications
  };
}

export async function approveDraft(draftId: string, payload: ExtractionPayload) {
  if (usePostgres()) return approveDraftPg(draftId, payload);
  const snapshot = await readLocal();
  const draft = snapshot.drafts.find((item) => item.id === draftId);
  if (!draft) throw new Error("Draft not found");

  draft.status = "approved";
  draft.payload = payload;
  draft.classification = payload.classification;
  draft.assistant_message = payload.assistant_message;
  draft.updated_at = nowIso();

  const event = buildEvent(draftId, payload);
  if (event) {
    snapshot.events.unshift(event);
    snapshot.todos.unshift(...buildTodos(payload, event.id));
    snapshot.checklistItems.unshift(...buildChecklist(payload, event.id));
    snapshot.notifications.unshift(...buildNotifications(event, payload));
  } else {
    snapshot.todos.unshift(...buildTodos(payload, null));
    snapshot.notifications.unshift(...buildFollowUpNotifications(payload));
  }

  await writeLocal(snapshot);
  return { draft, event };
}

export async function rejectDraft(draftId: string) {
  if (usePostgres()) return rejectDraftPg(draftId);
  const snapshot = await readLocal();
  const draft = snapshot.drafts.find((item) => item.id === draftId);
  if (!draft) throw new Error("Draft not found");
  draft.status = "rejected";
  draft.updated_at = nowIso();
  await writeLocal(snapshot);
  return draft;
}

export async function toggleItem(kind: "todo" | "checklist", id: string, completed: boolean) {
  if (usePostgres()) return toggleItemPg(kind, id, completed);
  const snapshot = await readLocal();
  const collection = kind === "todo" ? snapshot.todos : snapshot.checklistItems;
  const item = collection.find((entry) => entry.id === id);
  if (!item) throw new Error("Item not found");
  item.completed = completed;
  await writeLocal(snapshot);
  return item;
}

function buildEvent(draftId: string, payload: ExtractionPayload): StoredEvent | null {
  const candidate = payload.events[0];
  if (!candidate || !candidate.title) return null;
  if (payload.classification === "negotiating_event" && !candidate.start_at) return null;

  return {
    id: crypto.randomUUID(),
    draft_id: draftId,
    title: candidate.title,
    start_at: candidate.start_at,
    end_at: candidate.end_at,
    location: candidate.location,
    description: candidate.description,
    created_at: nowIso()
  };
}

function buildTodos(payload: ExtractionPayload, eventId: string | null): StoredTodo[] {
  return payload.todos.map((todo) => ({
    id: crypto.randomUUID(),
    event_id: eventId,
    text: todo.text,
    completed: false,
    created_at: nowIso()
  }));
}

function buildChecklist(payload: ExtractionPayload, eventId: string | null): StoredChecklistItem[] {
  return payload.checklist.map((text) => ({
    id: crypto.randomUUID(),
    event_id: eventId,
    text,
    completed: false,
    created_at: nowIso()
  }));
}

function buildNotifications(
  event: StoredEvent,
  payload: ExtractionPayload
): StoredNotification[] {
  const notifications: StoredNotification[] = [];
  if (event.start_at) {
    notifications.push({
      id: crypto.randomUUID(),
      event_id: event.id,
      notify_at: subtractMinutes(event.start_at, 30),
      message: `${event.title} 30분 전입니다.`,
      kind: "event_30_min",
      status: "scheduled",
      created_at: nowIso()
    });
    if (event.location || payload.checklist.length) {
      notifications.push({
        id: crypto.randomUUID(),
        event_id: event.id,
        notify_at: subtractMinutes(event.start_at, 60),
        message: `${event.title} 출발 전 체크리스트를 확인하세요.`,
        kind: "departure_checklist",
        status: "scheduled",
        created_at: nowIso()
      });
    }
  }
  return notifications;
}

function buildFollowUpNotifications(payload: ExtractionPayload): StoredNotification[] {
  const suggestion = payload.suggestions[0];
  if (!suggestion) return [];
  return [
    {
      id: crypto.randomUUID(),
      event_id: null,
      notify_at: null,
      message: suggestion.message,
      kind: "follow_up",
      status: "scheduled",
      created_at: nowIso()
    }
  ];
}

async function readLocal() {
  try {
    const file = await readFile(localPath, "utf8");
    return JSON.parse(file) as Snapshot;
  } catch {
    const snapshot = emptySnapshot();
    await writeLocal(snapshot);
    return snapshot;
  }
}

async function writeLocal(snapshot: Snapshot) {
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, JSON.stringify(snapshot, null, 2), "utf8");
}

function usePostgres() {
  return Boolean(getDatabaseUrl());
}

async function getPool() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
    });
  }
  if (!schemaReady) {
    await ensureSchema(pool);
    schemaReady = true;
  }
  return pool;
}

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value || !value.startsWith("postgres")) return null;
  if (/USER|PASSWORD|HOST/.test(value)) return null;
  return value;
}

async function ensureSchema(pgPool: Pool) {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS raw_inputs (
      id TEXT PRIMARY KEY,
      input_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS extraction_drafts (
      id TEXT PRIMARY KEY,
      raw_input_id TEXT REFERENCES raw_inputs(id),
      classification TEXT NOT NULL,
      status TEXT NOT NULL,
      payload JSONB NOT NULL,
      assistant_message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      draft_id TEXT REFERENCES extraction_drafts(id),
      title TEXT NOT NULL,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      location TEXT,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      event_id TEXT REFERENCES events(id),
      text TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      event_id TEXT REFERENCES events(id),
      text TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      event_id TEXT REFERENCES events(id),
      notify_at TIMESTAMPTZ,
      message TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
}

async function createRawInputPg(inputType: InputType, content: string) {
  const pgPool = await getPool();
  const rawInput: RawInput = {
    id: crypto.randomUUID(),
    input_type: inputType,
    content,
    created_at: nowIso()
  };
  await pgPool.query(
    "INSERT INTO raw_inputs (id, input_type, content, created_at) VALUES ($1, $2, $3, $4)",
    [rawInput.id, rawInput.input_type, rawInput.content, rawInput.created_at]
  );
  return rawInput;
}

async function createDraftPg(rawInputId: string, payload: ExtractionPayload) {
  const pgPool = await getPool();
  const draft: ExtractionDraft = {
    id: crypto.randomUUID(),
    raw_input_id: rawInputId,
    classification: payload.classification,
    status: "pending",
    payload,
    assistant_message: payload.assistant_message,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  await pgPool.query(
    `INSERT INTO extraction_drafts
      (id, raw_input_id, classification, status, payload, assistant_message, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      draft.id,
      draft.raw_input_id,
      draft.classification,
      draft.status,
      JSON.stringify(draft.payload),
      draft.assistant_message,
      draft.created_at,
      draft.updated_at
    ]
  );
  return draft;
}

async function getAppStatePg(): Promise<AppState> {
  const pgPool = await getPool();
  const [drafts, events, todos, checklistItems, notifications] = await Promise.all([
    pgPool.query("SELECT * FROM extraction_drafts ORDER BY created_at DESC LIMIT 20"),
    pgPool.query("SELECT * FROM events ORDER BY start_at NULLS LAST, created_at DESC LIMIT 50"),
    pgPool.query("SELECT * FROM todos ORDER BY created_at DESC LIMIT 100"),
    pgPool.query("SELECT * FROM checklist_items ORDER BY created_at DESC LIMIT 100"),
    pgPool.query("SELECT * FROM notifications ORDER BY notify_at NULLS LAST, created_at DESC LIMIT 100")
  ]);
  return {
    drafts: drafts.rows.map(mapDraftRow),
    events: events.rows.map(mapEventRow),
    todos: todos.rows.map(mapTodoRow),
    checklistItems: checklistItems.rows.map(mapChecklistRow),
    notifications: notifications.rows.map(mapNotificationRow)
  };
}

async function approveDraftPg(draftId: string, payload: ExtractionPayload) {
  const pgPool = await getPool();
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const updated = nowIso();
    const draftResult = await client.query(
      `UPDATE extraction_drafts
       SET status = 'approved', payload = $2, classification = $3, assistant_message = $4, updated_at = $5
       WHERE id = $1
       RETURNING *`,
      [draftId, JSON.stringify(payload), payload.classification, payload.assistant_message, updated]
    );
    if (!draftResult.rows[0]) throw new Error("Draft not found");

    const event = buildEvent(draftId, payload);
    if (event) {
      await insertEvent(client, event);
      for (const todo of buildTodos(payload, event.id)) await insertTodo(client, todo);
      for (const item of buildChecklist(payload, event.id)) await insertChecklist(client, item);
      for (const notification of buildNotifications(event, payload)) {
        await insertNotification(client, notification);
      }
    } else {
      for (const todo of buildTodos(payload, null)) await insertTodo(client, todo);
      for (const notification of buildFollowUpNotifications(payload)) {
        await insertNotification(client, notification);
      }
    }

    await client.query("COMMIT");
    return { draft: mapDraftRow(draftResult.rows[0]), event };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function rejectDraftPg(draftId: string) {
  const pgPool = await getPool();
  const result = await pgPool.query(
    "UPDATE extraction_drafts SET status = 'rejected', updated_at = $2 WHERE id = $1 RETURNING *",
    [draftId, nowIso()]
  );
  if (!result.rows[0]) throw new Error("Draft not found");
  return mapDraftRow(result.rows[0]);
}

async function toggleItemPg(kind: "todo" | "checklist", id: string, completed: boolean) {
  const pgPool = await getPool();
  const table = kind === "todo" ? "todos" : "checklist_items";
  const result = await pgPool.query(
    `UPDATE ${table} SET completed = $2 WHERE id = $1 RETURNING *`,
    [id, completed]
  );
  if (!result.rows[0]) throw new Error("Item not found");
  return kind === "todo" ? mapTodoRow(result.rows[0]) : mapChecklistRow(result.rows[0]);
}

async function insertEvent(client: PoolClient, event: StoredEvent) {
  await client.query(
    `INSERT INTO events (id, draft_id, title, start_at, end_at, location, description, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event.id,
      event.draft_id,
      event.title,
      event.start_at,
      event.end_at,
      event.location,
      event.description,
      event.created_at
    ]
  );
}

async function insertTodo(client: PoolClient, todo: StoredTodo) {
  await client.query(
    "INSERT INTO todos (id, event_id, text, completed, created_at) VALUES ($1, $2, $3, $4, $5)",
    [todo.id, todo.event_id, todo.text, todo.completed, todo.created_at]
  );
}

async function insertChecklist(client: PoolClient, item: StoredChecklistItem) {
  await client.query(
    `INSERT INTO checklist_items (id, event_id, text, completed, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [item.id, item.event_id, item.text, item.completed, item.created_at]
  );
}

async function insertNotification(client: PoolClient, notification: StoredNotification) {
  await client.query(
    `INSERT INTO notifications (id, event_id, notify_at, message, kind, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      notification.id,
      notification.event_id,
      notification.notify_at,
      notification.message,
      notification.kind,
      notification.status,
      notification.created_at
    ]
  );
}

function mapDraftRow(row: Record<string, unknown>): ExtractionDraft {
  return {
    id: String(row.id),
    raw_input_id: String(row.raw_input_id),
    classification: row.classification as ExtractionDraft["classification"],
    status: row.status as ExtractionDraft["status"],
    payload: row.payload as ExtractionPayload,
    assistant_message: String(row.assistant_message),
    created_at: dateString(row.created_at),
    updated_at: dateString(row.updated_at)
  };
}

function mapEventRow(row: Record<string, unknown>): StoredEvent {
  return {
    id: String(row.id),
    draft_id: nullable(row.draft_id),
    title: String(row.title),
    start_at: nullableDate(row.start_at),
    end_at: nullableDate(row.end_at),
    location: nullable(row.location),
    description: nullable(row.description),
    created_at: dateString(row.created_at)
  };
}

function mapTodoRow(row: Record<string, unknown>): StoredTodo {
  return {
    id: String(row.id),
    event_id: nullable(row.event_id),
    text: String(row.text),
    completed: Boolean(row.completed),
    created_at: dateString(row.created_at)
  };
}

function mapChecklistRow(row: Record<string, unknown>): StoredChecklistItem {
  return {
    id: String(row.id),
    event_id: nullable(row.event_id),
    text: String(row.text),
    completed: Boolean(row.completed),
    created_at: dateString(row.created_at)
  };
}

function mapNotificationRow(row: Record<string, unknown>): StoredNotification {
  return {
    id: String(row.id),
    event_id: nullable(row.event_id),
    notify_at: nullableDate(row.notify_at),
    message: String(row.message),
    kind: row.kind as StoredNotification["kind"],
    status: row.status as StoredNotification["status"],
    created_at: dateString(row.created_at)
  };
}

function nullable(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nullableDate(value: unknown) {
  if (value === null || value === undefined) return null;
  return dateString(value);
}

function dateString(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
