export type Classification =
  | "confirmed_event"
  | "negotiating_event"
  | "needs_more_info"
  | "todo_only"
  | "not_schedule_related";

export type DraftStatus = "pending" | "approved" | "rejected";

export type InputType = "kakao" | "email" | "stt" | "memo";

export type TimeWindow = {
  start_at: string | null;
  end_at: string | null;
  text: string;
};

export type TimeConstraint = {
  person: string;
  available: TimeWindow[];
  unavailable: TimeWindow[];
};

export type EventCandidate = {
  title: string;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  description: string | null;
  source_confidence: number;
};

export type SuggestionType =
  | "register_event"
  | "propose_time"
  | "ask_follow_up"
  | "create_todo";

export type Suggestion = {
  type: SuggestionType;
  message: string;
  candidate_start_at: string | null;
  candidate_end_at: string | null;
  risk: string | null;
};

export type TodoCandidate = {
  text: string;
  due_at: string | null;
  source_confidence: number;
};

export type ExtractionPayload = {
  classification: Classification;
  confidence: number;
  title: string;
  assistant_message: string;
  raw_summary: string;
  events: EventCandidate[];
  todos: TodoCandidate[];
  checklist: string[];
  participants: string[];
  time_constraints: TimeConstraint[];
  suggestions: Suggestion[];
  missing_fields: string[];
};

export type RawInput = {
  id: string;
  input_type: InputType;
  content: string;
  created_at: string;
};

export type ExtractionDraft = {
  id: string;
  raw_input_id: string;
  classification: Classification;
  status: DraftStatus;
  payload: ExtractionPayload;
  assistant_message: string;
  created_at: string;
  updated_at: string;
};

export type StoredEvent = {
  id: string;
  draft_id: string | null;
  title: string;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  description: string | null;
  created_at: string;
};

export type StoredTodo = {
  id: string;
  event_id: string | null;
  text: string;
  completed: boolean;
  created_at: string;
};

export type StoredChecklistItem = {
  id: string;
  event_id: string | null;
  text: string;
  completed: boolean;
  created_at: string;
};

export type StoredNotification = {
  id: string;
  event_id: string | null;
  notify_at: string | null;
  message: string;
  kind: "event_30_min" | "departure_checklist" | "follow_up";
  status: "scheduled" | "shown" | "cancelled";
  created_at: string;
};

export type AppState = {
  drafts: ExtractionDraft[];
  events: StoredEvent[];
  todos: StoredTodo[];
  checklistItems: StoredChecklistItem[];
  notifications: StoredNotification[];
};
