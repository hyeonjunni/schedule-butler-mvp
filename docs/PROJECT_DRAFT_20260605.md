# Schedule Butler MVP 프로젝트 드래프트

제출 마감: 2026년 6월 5일 금요일  
문서 목적: 프로젝트 설계 방향 정리 및 1차 MVP 구현 범위 설명  
GitHub 저장소: <https://github.com/hyeonjunni/schedule-butler-mvp>

## 1. 프로젝트 개요

Schedule Butler MVP는 정제되지 않은 카카오톡 대화, 이메일 원문, 통화 STT 텍스트, 일반 메모에서 일정과 TODO를 추론하고, 사용자의 승인을 받은 내용만 가상 캘린더에 등록하는 iPhone UI 스타일 웹 프로젝트이다.

이 프로젝트의 핵심은 “자동 캘린더 등록기”가 아니라 “승인형 스케줄 비서”이다. AI가 원문을 분석해 일정 후보, 참석자, 가능한 시간, 불가능한 시간, TODO, 준비물 체크리스트를 구조화하되, DB에 저장하거나 일정으로 확정하기 전에는 반드시 사용자에게 확인을 받는다.

특히 회의 일정처럼 시간이 아직 정해지지 않은 경우에는 바로 일정을 만들지 않는다. 참석자들이 보낸 가능한 시간과 불가능한 시간을 모아 공통 가능한 시간대를 계산하고, “이 시간은 어떤가요?” 또는 “이렇게 다시 물어볼까요?” 형태의 제안 메시지를 먼저 만든다.

## 2. 문제 정의

실제 일정은 캘린더 앱에 바로 입력될 만큼 정리된 형태로 전달되지 않는 경우가 많다. 사람들은 카카오톡 단체방, 이메일, 통화 녹취록, 회의 메모에서 다음과 같이 비정형적으로 약속을 잡는다.

- “내일 1시부터 4시까지는 안 되고 나머지는 가능해요.”
- “토요일은 3~4시부터 가능할 것 같아요.”
- “토요일 저녁 7시는 안 돼요.”
- “일요일은 하루 종일 가능합니다.”
- “그럼 토요일 4시부터 괜찮으면 하시죠.”

이런 대화에서는 날짜, 시간, 참석자, 장소, 준비물, TODO가 여러 메시지에 흩어져 있다. 또한 일정이 확정된 것인지, 아직 시간 조율 중인지, 정보가 부족한지 판단해야 한다.

기존 캘린더 앱은 사용자가 직접 제목, 날짜, 시간, 장소를 입력해야 한다. 반대로 AI가 모든 것을 자동으로 등록하면 오등록 위험이 크다. 따라서 본 프로젝트는 AI 추론과 사용자 승인 사이에 안전한 확인 과정을 둔다.

## 3. 프로젝트 목표

1차 MVP의 목표는 다음과 같다.

1. 사용자가 정제되지 않은 원문을 그대로 입력할 수 있다.
2. AI가 일정, TODO, 체크리스트, 참석자, 시간 제약을 구조화한다.
3. 일정 상태를 `confirmed_event`, `negotiating_event`, `needs_more_info`, `todo_only`, `not_schedule_related`로 분류한다.
4. 등록 전에는 메신저 형태의 승인 대화가 반드시 나온다.
5. 승인 이후에만 DB와 가상 캘린더에 저장한다.
6. 일정 30분 전 알림과 출발 전 체크리스트 알림 데이터를 생성한다.
7. 오늘 일정, 이번 주 일정, TODO 리스트, 알림 목록을 iPhone 스타일 웹 UI에서 확인할 수 있다.

## 4. 핵심 사용자 시나리오

### 시나리오 A: 확정 일정 등록

사용자가 “내일 오후 3시에 강남역에서 팀 회의하자” 같은 문장을 붙여넣으면, AI는 날짜, 시간, 장소, 제목이 충분하다고 판단한다. 앱은 바로 저장하지 않고 “내일 오후 3시 강남역 팀 회의로 등록할까요?”라고 묻는다.

사용자는 제목, 시간, 장소, 체크리스트를 수정한 뒤 승인할 수 있다. 승인 후에만 일정, TODO, 체크리스트, 알림이 저장된다.

### 시나리오 B: 회의 시간 조율

카카오톡 대화에서 여러 사람이 가능한 시간과 불가능한 시간을 보낸 경우, 앱은 이를 `negotiating_event`로 분류한다.

예시 원문:

```text
김시현: 내일 1시부터 4시까지 안돼요. 나머지는 다 가능
조현준: 토요일은 3~4시부터 가능할거같아요
배민: 토요일 저녁 7시는 안돼요. 일요일 하루종일 가능
나: 토 2-4, 6- 일요일은 회의가 있긴한데 시간이 미정이라 여기서 먼저 정하면 될것같습니다
```

처리 결과:

- 참석자별 가능한 시간과 불가능한 시간을 추출한다.
- 가능한 시간의 공통집합을 계산한다.
- 충돌되는 조건을 제외한다.
- 후보 시간이 있으면 2~3개를 제안한다.
- 후보가 불명확하면 상대에게 보낼 추가 질문 초안을 만든다.

이 단계에서는 아직 확정 일정이 아니므로 `Event`를 만들지 않는다. 사용자가 후보를 선택하고 승인했을 때만 일정으로 저장한다.

### 시나리오 C: TODO 및 준비물 정리

사용자가 “금요일 발표 전까지 발표자료 최종본, 데모 샘플, HDMI, 충전기 챙기기” 같은 문장을 입력하면 앱은 일정이 아니라 작업 중심 내용으로 판단할 수 있다. 이 경우 `todo_only`로 분류하고 TODO와 체크리스트를 저장한다.

체크리스트는 원문에 나온 항목을 우선 포함하고, 문맥에 따라 추가 추천한다. 예를 들어 야외 활동이면 썬크림, 물, 날씨 확인을 추천하고, 발표나 데모이면 발표자료 최종본, 노트북 충전기, HDMI/어댑터를 추천한다.

## 5. 1차 MVP 구현 범위

포함 범위:

- iPhone 스타일 모바일 웹 UI
- 카카오톡, 이메일, STT, 메모 원문 입력
- OpenAI GPT API 기반 일정/TODO 후보 추출
- OpenAI 실패 또는 API key 미설정 시 휴리스틱 fallback
- 확정 일정, 시간 조율 일정, 정보 부족 일정, TODO 전용 입력 분류
- 참석자별 가능/불가능 시간 표시
- 회의 시간 공통 후보 계산
- 등록 전 승인/수정/취소 플로우
- 후보 시간 선택 및 답장 초안 복사
- 승인 후 일정, TODO, 체크리스트, 알림 저장
- 오늘 일정, 이번 주 일정, TODO, 알림 화면
- 승인된 일정의 `.ics` 캘린더 파일 다운로드
- 앱이 열려 있을 때 브라우저 Notification API 기반 알림 표시

제외 범위:

- 실제 카카오톡 자동 수집
- 실제 이메일 계정 연동
- 실제 iOS push notification
- Apple Calendar/Google Calendar 양방향 연동
- 음성 파일 직접 STT 변환
- 이미지 OCR 자동 처리
- 복잡한 반복 일정
- 위치 기반 실제 이동 시간 계산

위 제외 범위는 기능 자체가 불필요해서가 아니라, 3일 MVP 안에서 안정적으로 시연하기 어렵고 개인정보/권한/플랫폼 제약이 큰 영역이기 때문에 후속 고도화로 분리한다.

## 6. 시스템 설계 방향

### Frontend

프론트엔드는 Next.js App Router 기반의 모바일 우선 웹앱으로 구성한다. 첫 화면은 랜딩 페이지가 아니라 바로 사용할 수 있는 iPhone 스타일 도구 화면이다.

주요 탭은 입력, 승인, 캘린더, TODO, 알림으로 나눈다. AI 분석 결과는 일반 JSON 결과 화면이 아니라 메신저 대화처럼 보여준다. 사용자는 일정 후보를 읽고, 필요한 항목을 수정한 뒤 승인하거나 취소할 수 있다.

### Backend/API

백엔드는 Next.js API Route를 사용한다. 핵심 API는 `/api/extract`와 `/api/approve`이다.

- `/api/extract`: 원문 입력을 저장하고 AI 또는 fallback 로직으로 일정 후보를 만든다.
- `/api/approve`: 사용자가 승인한 draft만 실제 Event, Todo, Checklist, Notification으로 저장한다.

`confirmed_event`가 아닌 draft는 GPT가 실수로 이벤트 후보를 반환하더라도 저장 단계에서 Event로 만들지 않는다.

### AI Provider

현재 1차 구현은 OpenAI Chat Completions API를 사용한다. 모델은 `.env`의 `AI_MODEL` 값을 우선 사용하고, 없으면 `gpt-4.1-mini`를 기본값으로 한다.

AI 호출은 JSON contract를 강제한다. 자연어 설명은 `assistant_message`에만 넣고, 앱이 사용하는 구조화 정보는 정해진 필드로 반환하게 한다.

### Storage

저장소는 PostgreSQL을 우선으로 설계한다. `DATABASE_URL`이 있으면 PostgreSQL에 저장하고, 로컬 개발 환경에서 DB가 없거나 placeholder 값이면 `.data/schedule-butler.json` 파일 저장소로 fallback한다.

저장 엔티티:

- `RawInput`: 사용자가 입력한 원문
- `ExtractionDraft`: AI가 만든 승인 대기 초안
- `Event`: 승인된 확정 일정
- `Todo`: 승인된 작업 항목
- `ChecklistItem`: 일정 또는 TODO에 연결된 준비물
- `Notification`: 일정 전 알림 및 체크리스트 알림

### Notification

1차 MVP에서는 앱 내부 알림 목록과 브라우저 Notification API를 사용한다. 일정 30분 전 알림과 장소/준비물이 있는 일정의 출발 전 체크리스트 알림을 생성한다.

현재 알림은 앱이 열려 있을 때 due notification을 확인하고 표시하는 방식이다. 실제 iOS 백그라운드 push notification은 후속 범위로 둔다.

## 7. GPT 프롬프트 구조 및 처리 파이프라인

GPT API 요청은 다음 구조로 보낸다.

```ts
{
  model: process.env.AI_MODEL || "gpt-4.1-mini",
  temperature: 0.1,
  response_format: { type: "json_object" },
  messages: [
    {
      role: "system",
      content: buildSystemPrompt()
    },
    {
      role: "user",
      content: `입력 타입: ${inputType}
기준 날짜: ${getBaseDateKst()} Asia/Seoul

원문:
${rawText}`
    }
  ]
}
```

System Prompt의 핵심 규칙은 다음과 같다.

- JSON 객체 하나만 반환한다.
- 확정 일정은 `confirmed_event`로 분류한다.
- 시간 조율 중인 일정은 `negotiating_event`로 분류한다.
- 정보가 부족하면 `needs_more_info`로 분류한다.
- TODO만 있으면 `todo_only`로 분류한다.
- 일정 관련이 아니면 `not_schedule_related`로 분류한다.
- 상대 날짜 표현은 기준 날짜와 `Asia/Seoul` 기준으로 ISO 문자열화한다.
- 참석자별 가능/불가능 시간은 `time_constraints`에 넣는다.
- 미확정 회의는 `events`에 확정 일정으로 만들지 않고 `suggestions`에 제안 또는 질문을 넣는다.
- 체크리스트는 원문 준비물과 문맥 기반 추천 준비물을 함께 넣는다.

서버 처리 순서:

1. 사용자가 원문을 입력한다.
2. `/api/extract`가 원문을 `RawInput`으로 저장한다.
3. OpenAI API key가 있으면 GPT를 호출한다.
4. key가 없거나 GPT 호출에 실패하면 휴리스틱 fallback을 사용한다.
5. GPT JSON을 파싱한다.
6. `normalizeExtraction()`으로 classification, 날짜, suggestion type, 숫자 범위를 검증한다.
7. 시간 조율 대화면 deterministic interval intersection 로직으로 후보 시간을 보강한다.
8. 회의/발표/야외 활동 등 문맥 기반 체크리스트를 추가한다.
9. `ExtractionDraft`를 승인 대기 상태로 저장한다.
10. 사용자가 승인하면 `/api/approve`가 Event, Todo, Checklist, Notification을 생성한다.

## 8. 안전장치

AI가 생성한 결과를 그대로 신뢰하지 않기 위해 다음 안전장치를 둔다.

- 허용되지 않은 classification은 `needs_more_info`로 정리한다.
- 날짜 파싱이 불가능한 값은 `null` 처리한다.
- `confirmed_event`라도 유효한 시작 시간이 없으면 `needs_more_info`로 낮춘다.
- `negotiating_event`, `todo_only`, `not_schedule_related`는 저장 단계에서 Event를 만들지 않는다.
- 사용자가 승인하기 전에는 확정 일정이 DB에 등록되지 않는다.
- `.env`, API key, SSH password, DB password는 GitHub와 문서에 기록하지 않는다.

## 9. 현재 구현 현황

현재 GitHub main 브랜치 기준으로 다음 기능이 구현되어 있다.

- Next.js App Router 기반 모바일 웹앱
- 입력, 승인, 캘린더, TODO, 알림 탭
- 카카오톡/이메일/STT/메모 입력 타입
- 금요일 시연용 샘플 프리셋
- OpenAI 기반 `/api/extract`
- AI 실패 시 휴리스틱 fallback
- JSON schema normalization
- 승인 전 Event 저장 방지
- 참석자별 시간 제약 표시
- 시간 후보 최대 3개 제안
- 후보 선택 시 등록 폼 시간 자동 반영
- 답장 초안 복사
- PostgreSQL 저장소와 로컬 JSON fallback
- 오늘/이번 주 캘린더 화면
- TODO/체크리스트 체크 처리
- `.ics` 파일 다운로드
- 일정 30분 전 알림 데이터 생성
- 앱이 열려 있을 때 due notification 표시 및 shown 처리
- Vitest 기반 회귀 테스트

검증된 명령:

```bash
npm run test
npm run typecheck
npm run build
```

## 10. 금요일 시연 계획

시연은 로컬 환경에서 먼저 검증한 뒤 진행한다. 교수님 서버 배포는 최종 확인 이후에만 시도한다.

시연 순서:

1. 회의 조율 샘플을 입력한다.
2. 참석자별 가능/불가능 시간이 추출되는 것을 보여준다.
3. 공통 후보 시간이 제안되는 것을 보여준다.
4. 후보를 선택하면 등록 폼에 시간이 들어가는 것을 보여준다.
5. 답장 초안 복사 기능을 보여준다.
6. 확정 일정 샘플을 입력한다.
7. 승인 전 편집 화면을 보여준다.
8. 승인 후 오늘/이번 주 캘린더, TODO, 체크리스트, 알림에 저장되는 것을 보여준다.
9. GPT 프롬프트 구조와 서버 검증 파이프라인을 설명한다.

핵심 발표 멘트:

> 이 앱은 카톡 원문을 바로 캘린더에 넣지 않고, AI가 먼저 일정 후보와 시간 조율 후보를 추론한 뒤 사용자에게 승인받는 구조입니다. GPT 응답은 JSON contract로 제한하고, 서버에서 다시 검증해서 확정되지 않은 일정은 Event로 저장하지 않습니다.

## 11. 서버 배포 계획

교수님 서버에는 로컬에서 검증된 최종본만 올린다. 서버 작업은 `/home/vrsoft/HSUniv/team1/` 안에서만 진행한다.

서버 배포 원칙:

- 서버 접속 정보와 비밀번호는 문서와 GitHub에 기록하지 않는다.
- `/home/vrsoft/HSUniv/team1/` 밖의 파일은 읽거나 수정하지 않는다.
- `sudo`, `apt`, `systemctl`, 전역 npm install 등 시스템 영향 작업은 하지 않는다.
- 앱 소스는 `/home/vrsoft/HSUniv/team1/schedule-butler-mvp` 아래에 배치한다.
- `.env`는 서버의 앱 폴더 안에서만 별도로 생성한다.
- Node.js/npm/PostgreSQL 사용 가능 여부와 포트는 서버 정책을 먼저 확인한다.

## 12. 향후 고도화 범위

시연 이후 개선할 수 있는 내용은 다음과 같다.

- Service Worker 기반 백그라운드 알림
- 실제 iOS Safari push notification 가능 범위 검토
- 원격 PostgreSQL provisioning 문서화
- 오전/오후가 생략된 시간 표현에 대한 신뢰도 표시
- 후보 시간 우선순위 설명을 더 자연스러운 한국어로 개선
- 날씨 API를 이용한 야외 일정 체크리스트 고도화
- 실제 이메일 또는 캘린더 연동
- 음성 STT와 이미지 OCR 입력 추가
- 로컬 LLM provider 교체 가능 구조 정리

## 13. 기대 효과

Schedule Butler MVP는 사용자가 직접 캘린더를 정리하는 부담을 줄이면서도, AI가 임의로 일정을 등록하는 위험을 줄인다. 특히 카카오톡 단체방처럼 여러 사람의 시간이 흩어져 있는 상황에서 공통 가능 시간을 계산하고, 사용자에게 보낼 답장 초안까지 만들어주는 점이 실용적인 차별점이다.

3일 MVP에서는 모든 플랫폼 연동을 완성하기보다, “비정형 원문 입력 → AI 추론 → 서버 검증 → 사용자 승인 → 가상 캘린더 저장 → 알림/체크리스트 생성”이라는 핵심 흐름을 안정적으로 시연하는 것을 목표로 한다.

## 참고 문서

- `README.md`
- `docs/MVP_SCOPE.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/AI_EXTRACTION_CONTRACT.md`
- `docs/PRESENTATION_PIPELINE.md`
- `docs/DEMO_SCRIPT.md`
- `docs/DEPLOYMENT_CONSTRAINTS.md`
- `docs/GITHUB_ISSUES.md`
