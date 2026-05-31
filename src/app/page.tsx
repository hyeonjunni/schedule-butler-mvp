"use client";

import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  ListTodo,
  MessageCircle,
  Send,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatKoreanDateTime, fromLocalDateInputValue, toLocalDateInputValue } from "@/lib/time";
import type {
  AppState,
  EventCandidate,
  ExtractionDraft,
  ExtractionPayload,
  InputType,
  StoredChecklistItem,
  StoredTodo
} from "@/lib/types";

const emptyState: AppState = {
  drafts: [],
  events: [],
  todos: [],
  checklistItems: [],
  notifications: []
};

const sampleText = `김시현: 날짜 잡으시져
김시현: 내일 1시부터 4시까지 안돼요 전 나머지는 다 가능
조현준: 토요일은 3~4시부터 가능할거같아요
김시현: 그럼 4시부터 괜찮으시면 하시져
배민: 저는 애매해서 저녁 7시에 가능이요. 빨리 가능하면 말할게
조현준: 주 토요일 저녁 7시는 안돼요
김시현: 그럼 그냥 안되는시간 다 보내주세요
조현준: 토요일 7- 일요일 8-9
나: 토 2-4, 6- 일요일은 회의가있긴한데 시간이 미정이라 여기서 먼저 정하면 될것같습니다
배민: 토요일 7시 전까지 안됨 일요일 하루종일 가능`;

type Tab = "input" | "drafts" | "calendar" | "todos" | "alerts";

type EventForm = {
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  description: string;
  todos: string;
  checklist: string;
};

const tabs: Array<{ id: Tab; label: string; icon: typeof MessageCircle }> = [
  { id: "input", label: "입력", icon: MessageCircle },
  { id: "drafts", label: "승인", icon: Sparkles },
  { id: "calendar", label: "일정", icon: CalendarDays },
  { id: "todos", label: "TODO", icon: ListTodo },
  { id: "alerts", label: "알림", icon: Bell }
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("input");
  const [content, setContent] = useState(sampleText);
  const [inputType, setInputType] = useState<InputType>("kakao");
  const [state, setState] = useState<AppState>(emptyState);
  const [currentDraft, setCurrentDraft] = useState<ExtractionDraft | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void refreshState();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void showDueNotifications(state.notifications);
    }, 30 * 1000);
    void showDueNotifications(state.notifications);
    return () => window.clearInterval(timer);
  }, [state.notifications]);

  useEffect(() => {
    if (!currentDraft) return;
    setEventForm(formFromPayload(currentDraft.payload));
  }, [currentDraft]);

  const pendingDrafts = useMemo(
    () => state.drafts.filter((draft) => draft.status === "pending"),
    [state.drafts]
  );
  const todayEvents = useMemo(() => state.events.slice(0, 8), [state.events]);

  async function refreshState() {
    const response = await fetch("/api/state");
    if (!response.ok) return;
    setState((await response.json()) as AppState);
  }

  async function analyze() {
    if (!content.trim()) return;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, inputType })
      });
      if (!response.ok) throw new Error("extract failed");
      const data = (await response.json()) as { draft: ExtractionDraft };
      setCurrentDraft(data.draft);
      setTab("drafts");
      await refreshState();
    } catch {
      setNotice("분석에 실패했습니다. 원문을 조금 줄여서 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function approve(mode: "event" | "draft") {
    if (!currentDraft) return;
    const payload = mode === "event" ? payloadFromForm(currentDraft.payload, eventForm) : currentDraft.payload;
    setLoading(true);
    try {
      const response = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: currentDraft.id, action: "approve", payload })
      });
      if (!response.ok) throw new Error("approve failed");
      setNotice(mode === "event" ? "승인된 일정이 저장됐습니다." : "제안 초안이 저장됐습니다.");
      setCurrentDraft(null);
      await refreshState();
      setTab(mode === "event" ? "calendar" : "alerts");
    } catch {
      setNotice("승인 저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function rejectDraft() {
    if (!currentDraft) return;
    setLoading(true);
    try {
      await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: currentDraft.id, action: "reject" })
      });
      setCurrentDraft(null);
      setNotice("후보를 취소했습니다.");
      await refreshState();
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(kind: "todo" | "checklist", id: string, completed: boolean) {
    await fetch("/api/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, completed })
    });
    await refreshState();
  }

  async function requestNotification() {
    if (!("Notification" in window)) {
      setNotice("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotice(permission === "granted" ? "브라우저 알림 권한이 켜졌습니다." : "알림 권한이 허용되지 않았습니다.");
  }

  async function showDueNotifications(notifications: AppState["notifications"]) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = Date.now();
    const due = notifications.filter((notification) => {
      if (notification.status !== "scheduled" || !notification.notify_at) return false;
      const notifyAt = new Date(notification.notify_at).getTime();
      return !Number.isNaN(notifyAt) && notifyAt <= now;
    });
    if (!due.length) return;

    await Promise.all(
      due.map(async (notification) => {
        new Notification("Schedule Butler", { body: notification.message });
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: notification.id, status: "shown" })
        });
      })
    );
    await refreshState();
  }

  return (
    <main className="shell">
      <section className="phone">
        <div className="statusBar">
          <span>9:41</span>
          <span className="statusDots">● ● ●</span>
        </div>
        <header className="topBar">
          <div>
            <p className="eyebrow">Schedule Butler</p>
            <h1>승인형 일정 비서</h1>
          </div>
          <div className="dbBadge">
            <Database size={16} />
            DB
          </div>
        </header>

        <nav className="tabBar" aria-label="주요 화면">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "tab active" : "tab"}
                onClick={() => setTab(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {notice ? <div className="notice">{notice}</div> : null}

        <div className="screen">
          {tab === "input" ? (
            <InputPanel
              content={content}
              inputType={inputType}
              loading={loading}
              setContent={setContent}
              setInputType={setInputType}
              analyze={analyze}
            />
          ) : null}

          {tab === "drafts" ? (
            <DraftPanel
              currentDraft={currentDraft}
              pendingDrafts={pendingDrafts}
              eventForm={eventForm}
              loading={loading}
              setCurrentDraft={setCurrentDraft}
              setEventForm={setEventForm}
              approve={approve}
              rejectDraft={rejectDraft}
            />
          ) : null}

          {tab === "calendar" ? <CalendarPanel events={todayEvents} checklist={state.checklistItems} /> : null}

          {tab === "todos" ? (
            <TodoPanel todos={state.todos} checklist={state.checklistItems} toggleItem={toggleItem} />
          ) : null}

          {tab === "alerts" ? (
            <AlertPanel notifications={state.notifications} requestNotification={requestNotification} />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function InputPanel({
  content,
  inputType,
  loading,
  setContent,
  setInputType,
  analyze
}: {
  content: string;
  inputType: InputType;
  loading: boolean;
  setContent: (value: string) => void;
  setInputType: (value: InputType) => void;
  analyze: () => void;
}) {
  return (
    <div className="stack">
      <div className="segmented">
        {(["kakao", "email", "stt", "memo"] as InputType[]).map((type) => (
          <button
            key={type}
            type="button"
            className={inputType === type ? "selected" : ""}
            onClick={() => setInputType(type)}
          >
            {typeLabel(type)}
          </button>
        ))}
      </div>
      <textarea
        className="rawInput"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label="원문 입력"
      />
      <button className="primaryButton" type="button" onClick={analyze} disabled={loading}>
        <Sparkles size={18} />
        {loading ? "분석 중" : "분석하기"}
      </button>
    </div>
  );
}

function DraftPanel({
  currentDraft,
  pendingDrafts,
  eventForm,
  loading,
  setCurrentDraft,
  setEventForm,
  approve,
  rejectDraft
}: {
  currentDraft: ExtractionDraft | null;
  pendingDrafts: ExtractionDraft[];
  eventForm: EventForm;
  loading: boolean;
  setCurrentDraft: (draft: ExtractionDraft) => void;
  setEventForm: (form: EventForm) => void;
  approve: (mode: "event" | "draft") => void;
  rejectDraft: () => void;
}) {
  const draft = currentDraft ?? pendingDrafts[0] ?? null;
  const canSaveEvent = Boolean(eventForm.title.trim() && eventForm.startAt.trim());

  useEffect(() => {
    if (!currentDraft && pendingDrafts[0]) setCurrentDraft(pendingDrafts[0]);
  }, [currentDraft, pendingDrafts, setCurrentDraft]);

  if (!draft) {
    return <EmptyState icon={Sparkles} title="승인 대기 없음" text="분석된 후보가 여기에 표시됩니다." />;
  }

  return (
    <div className="stack">
      <div className="chat">
        <div className="bubble assistant">
          <span className="bubbleName">AI</span>
          <p>{draft.assistant_message}</p>
        </div>
        <div className="metaRow">
          <span className={`pill ${draft.classification}`}>{classificationLabel(draft.classification)}</span>
          <span>{Math.round(draft.payload.confidence * 100)}%</span>
        </div>
      </div>

      <section className="panel">
        <h2>{draft.payload.title}</h2>
        <p className="summary">{draft.payload.raw_summary || "요약 없음"}</p>
        {draft.payload.missing_fields.length ? (
          <div className="warning">
            <AlertTriangle size={16} />
            {draft.payload.missing_fields.join(", ")}
          </div>
        ) : null}
      </section>

      {draft.payload.time_constraints.length ? <Constraints constraints={draft.payload.time_constraints} /> : null}
      {draft.payload.suggestions.length ? <Suggestions payload={draft.payload} /> : null}

      <section className="panel">
        <h2>등록 내용</h2>
        <div className="formGrid">
          <label>
            제목
            <input
              value={eventForm.title}
              onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })}
            />
          </label>
          <label>
            시작
            <input
              type="datetime-local"
              value={eventForm.startAt}
              onChange={(event) => setEventForm({ ...eventForm, startAt: event.target.value })}
            />
          </label>
          <label>
            종료
            <input
              type="datetime-local"
              value={eventForm.endAt}
              onChange={(event) => setEventForm({ ...eventForm, endAt: event.target.value })}
            />
          </label>
          <label>
            장소
            <input
              value={eventForm.location}
              onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })}
            />
          </label>
          <label>
            TODO
            <textarea
              value={eventForm.todos}
              onChange={(event) => setEventForm({ ...eventForm, todos: event.target.value })}
            />
          </label>
          <label>
            체크리스트
            <textarea
              value={eventForm.checklist}
              onChange={(event) => setEventForm({ ...eventForm, checklist: event.target.value })}
            />
          </label>
        </div>
      </section>

      <div className="actionRow">
        <button className="secondaryButton danger" type="button" onClick={rejectDraft} disabled={loading}>
          <X size={18} />
          취소
        </button>
        <button className="secondaryButton" type="button" onClick={() => approve("draft")} disabled={loading}>
          <Send size={18} />
          초안 저장
        </button>
        <button
          className="primaryButton compact"
          type="button"
          onClick={() => approve("event")}
          disabled={loading || !canSaveEvent}
        >
          <Check size={18} />
          일정 등록
        </button>
      </div>
    </div>
  );
}

function Constraints({ constraints }: { constraints: ExtractionPayload["time_constraints"] }) {
  return (
    <section className="panel">
      <h2>시간 제약</h2>
      <div className="constraintList">
        {constraints.map((constraint) => (
          <div key={constraint.person} className="constraintItem">
            <strong>{constraint.person}</strong>
            <ConstraintLine label="가능" items={constraint.available} />
            <ConstraintLine label="불가" items={constraint.unavailable} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ConstraintLine({
  label,
  items
}: {
  label: string;
  items: ExtractionPayload["time_constraints"][number]["available"];
}) {
  if (!items.length) return null;
  return (
    <p>
      <span>{label}</span>
      {items.map((item) => item.text || formatKoreanDateTime(item.start_at)).join(" / ")}
    </p>
  );
}

function Suggestions({ payload }: { payload: ExtractionPayload }) {
  return (
    <section className="panel">
      <h2>제안</h2>
      <div className="suggestionList">
        {payload.suggestions.map((suggestion, index) => (
          <div key={`${suggestion.type}-${index}`} className="suggestion">
            <p>{suggestion.message}</p>
            {suggestion.candidate_start_at ? (
              <span>
                <Clock3 size={14} />
                {formatKoreanDateTime(suggestion.candidate_start_at)}
              </span>
            ) : null}
            {suggestion.risk ? <small>{suggestion.risk}</small> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CalendarPanel({
  events,
  checklist
}: {
  events: AppState["events"];
  checklist: StoredChecklistItem[];
}) {
  if (!events.length) {
    return <EmptyState icon={CalendarDays} title="등록된 일정 없음" text="승인된 일정이 캘린더에 표시됩니다." />;
  }

  return (
    <div className="stack">
      {events.map((event) => (
        <article key={event.id} className="eventCard">
          <div className="dateChip">
            <CalendarDays size={18} />
            {formatKoreanDateTime(event.start_at)}
          </div>
          <h2>{event.title}</h2>
          {event.location ? <p className="summary">{event.location}</p> : null}
          {event.description ? <p className="description">{event.description}</p> : null}
          <div className="miniList">
            {checklist
              .filter((item) => item.event_id === event.id)
              .slice(0, 4)
              .map((item) => (
                <span key={item.id}>{item.text}</span>
              ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function TodoPanel({
  todos,
  checklist,
  toggleItem
}: {
  todos: StoredTodo[];
  checklist: StoredChecklistItem[];
  toggleItem: (kind: "todo" | "checklist", id: string, completed: boolean) => void;
}) {
  const items = [
    ...todos.map((todo) => ({ ...todo, kind: "todo" as const })),
    ...checklist.map((item) => ({ ...item, kind: "checklist" as const }))
  ];

  if (!items.length) {
    return <EmptyState icon={ListTodo} title="TODO 없음" text="승인된 TODO와 체크리스트가 표시됩니다." />;
  }

  return (
    <div className="todoList">
      {items.map((item) => (
        <label key={`${item.kind}-${item.id}`} className="todoItem">
          <input
            type="checkbox"
            checked={item.completed}
            onChange={(event) => toggleItem(item.kind, item.id, event.target.checked)}
          />
          <span>{item.text}</span>
        </label>
      ))}
    </div>
  );
}

function AlertPanel({
  notifications,
  requestNotification
}: {
  notifications: AppState["notifications"];
  requestNotification: () => void;
}) {
  return (
    <div className="stack">
      <button className="secondaryButton full" type="button" onClick={requestNotification}>
        <Bell size={18} />
        브라우저 알림 권한
      </button>
      {notifications.length ? (
        notifications.map((notification) => (
          <article key={notification.id} className="alertItem">
            <span>{notification.kind === "follow_up" ? "확인" : "알림"}</span>
            <p>{notification.message}</p>
            <small>{notification.notify_at ? formatKoreanDateTime(notification.notify_at) : "시간 미정"}</small>
          </article>
        ))
      ) : (
        <EmptyState icon={Bell} title="알림 없음" text="등록된 알림이 여기에 쌓입니다." />
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text
}: {
  icon: typeof CalendarDays;
  title: string;
  text: string;
}) {
  return (
    <div className="emptyState">
      <Icon size={28} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function formFromPayload(payload: ExtractionPayload): EventForm {
  const suggestion = payload.suggestions.find((item) => item.candidate_start_at);
  const candidate = payload.events[0] ?? candidateEventFromSuggestion(payload, suggestion?.candidate_start_at ?? null);
  return {
    title: candidate?.title ?? payload.title,
    startAt: toLocalDateInputValue(candidate?.start_at ?? suggestion?.candidate_start_at ?? null),
    endAt: toLocalDateInputValue(candidate?.end_at ?? suggestion?.candidate_end_at ?? null),
    location: candidate?.location ?? "",
    description: candidate?.description ?? payload.raw_summary,
    todos: payload.todos.map((todo) => todo.text).join("\n"),
    checklist: payload.checklist.join("\n")
  };
}

function payloadFromForm(payload: ExtractionPayload, form: EventForm): ExtractionPayload {
  return {
    ...payload,
    classification: "confirmed_event",
    title: form.title.trim() || payload.title,
    assistant_message: `${form.title.trim() || payload.title} 일정으로 등록했습니다.`,
    events: [
      {
        title: form.title.trim() || payload.title,
        start_at: fromLocalDateInputValue(form.startAt),
        end_at: fromLocalDateInputValue(form.endAt),
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        source_confidence: payload.confidence
      }
    ],
    todos: splitLines(form.todos).map((text) => ({ text, due_at: null, source_confidence: 0.8 })),
    checklist: splitLines(form.checklist),
    missing_fields: []
  };
}

function candidateEventFromSuggestion(
  payload: ExtractionPayload,
  startAt: string | null
): EventCandidate | null {
  if (!startAt) return null;
  return {
    title: payload.title || "회의",
    start_at: startAt,
    end_at: null,
    location: null,
    description: payload.raw_summary,
    source_confidence: payload.confidence
  };
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function emptyEventForm(): EventForm {
  return {
    title: "",
    startAt: "",
    endAt: "",
    location: "",
    description: "",
    todos: "",
    checklist: ""
  };
}

function typeLabel(type: InputType) {
  return {
    kakao: "카톡",
    email: "이메일",
    stt: "STT",
    memo: "메모"
  }[type];
}

function classificationLabel(value: ExtractionPayload["classification"]) {
  return {
    confirmed_event: "확정 일정",
    negotiating_event: "시간 조율",
    needs_more_info: "정보 부족",
    todo_only: "TODO",
    not_schedule_related: "일정 아님"
  }[value];
}
