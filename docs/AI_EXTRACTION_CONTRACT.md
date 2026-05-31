# AI Extraction Contract

AI 응답은 앱이 파싱할 수 있는 JSON으로 제한합니다. 자연어 설명은 `assistant_message`에만 넣습니다.

## Top Level

```json
{
  "classification": "confirmed_event",
  "confidence": 0.86,
  "title": "팀 회의",
  "assistant_message": "내일 오후 3시 팀 회의로 등록할까요?",
  "raw_summary": "내일 오후 3시에 팀 회의를 하자는 내용",
  "events": [],
  "todos": [],
  "checklist": [],
  "participants": [],
  "time_constraints": [],
  "suggestions": [],
  "missing_fields": []
}
```

## `classification`

허용값:

- `confirmed_event`
- `negotiating_event`
- `needs_more_info`
- `todo_only`
- `not_schedule_related`

## `events`

확정 일정 후보입니다. 사용자 승인 전에는 DB의 `Event`로 저장하지 않습니다.

```json
{
  "title": "팀 회의",
  "start_at": "2026-06-01T15:00:00+09:00",
  "end_at": null,
  "location": "강남역",
  "description": "원문에서 추론된 회의",
  "source_confidence": 0.84
}
```

## `time_constraints`

회의 시간 조율용 제약입니다.

```json
{
  "person": "김시현",
  "available": [
    {
      "start_at": "2026-06-06T16:00:00+09:00",
      "end_at": null,
      "text": "토요일 4시부터 괜찮으시면 하시져"
    }
  ],
  "unavailable": [
    {
      "start_at": "2026-06-01T13:00:00+09:00",
      "end_at": "2026-06-01T16:00:00+09:00",
      "text": "내일 1시부터 4시까지 안돼요"
    }
  ]
}
```

## `suggestions`

사용자가 승인하거나 상대에게 보낼 수 있는 제안입니다.

```json
{
  "type": "propose_time",
  "message": "토요일 16시 이후가 가장 가까운 후보로 보입니다. 이 시간으로 물어볼까요?",
  "candidate_start_at": "2026-06-06T16:00:00+09:00",
  "candidate_end_at": null,
  "risk": "배민님의 토요일 19시 이전 불가 조건과 충돌 가능성이 있습니다."
}
```

허용 `type`:

- `register_event`
- `propose_time`
- `ask_follow_up`
- `create_todo`

## 승인 액션

Frontend는 AI 결과를 아래 액션 중 하나로 처리합니다.

- `approve`: 승인 후 저장
- `edit`: 사용자가 수정 후 저장
- `reject`: 폐기
- `ask_more`: 추가 질문 메시지 초안 생성

## 핵심 제약

- `classification`이 `negotiating_event` 또는 `needs_more_info`이면 바로 `Event`를 만들지 않습니다.
- 날짜가 상대 표현이면 서버 기준 날짜와 타임존 `Asia/Seoul`을 사용해 정규화합니다.
- 신뢰도가 낮은 필드는 `missing_fields` 또는 `risk`에 명시합니다.
