# Implementation Status

마지막 업데이트: 2026-05-31

## 구현 완료

### 앱 골격

- Next.js App Router 기반 모바일 웹앱
- iPhone 스타일 단일 화면 UI
- 입력, 승인, 일정, TODO, 알림 탭
- 프로덕션 빌드 통과

### 원문 입력

- 카톡, 이메일, STT, 메모 타입 선택
- 정제되지 않은 원문 텍스트 붙여넣기
- 샘플 카톡 시간 조율 대화 기본 입력

### AI 추출

- `/api/extract`
- OpenAI Chat Completions API 호출
- JSON contract 기반 응답 파싱
- `OPENAI_API_KEY` 또는 `CHATGPT_API_KEY` 사용
- 로컬 개발 편의를 위한 bare `.env` key fallback
- OpenAI 실패 시 휴리스틱 fallback
- invalid classification, 숫자 범위, 배열 타입, suggestion type, ISO 날짜 필드 schema normalization
- `confirmed_event`라도 유효한 시작 시간이 없으면 `needs_more_info`로 낮추는 안전장치
- `confirmed_event`가 아닌 draft는 실수로 events를 포함해도 DB `Event`로 저장하지 않는 저장소 안전장치

### 일정 상태 분류

지원:

- `confirmed_event`
- `negotiating_event`
- `needs_more_info`
- `todo_only`
- `not_schedule_related`

### 승인 플로우

- AI 결과를 메신저형 승인 카드로 표시
- 확정 일정은 등록 전 편집 가능
- 시간 조율 일정은 참석자별 가능/불가능 시간과 제안 메시지 표시
- 시간 후보를 선택하면 등록 폼의 시작/종료 시간이 자동 반영됨
- 시간 후보 또는 추가 질문을 메신저 답장 초안으로 복사 가능
- 승인, 초안 저장, 취소 지원
- 승인 전에는 `Event` 저장 안 함

### 저장소

- `DATABASE_URL`이 PostgreSQL이면 Postgres 사용
- `DATABASE_URL`이 없거나 예시 placeholder면 `.data/schedule-butler.json` 사용
- 앱 시작 시 Postgres 테이블 자동 생성

저장 엔티티:

- `raw_inputs`
- `extraction_drafts`
- `events`
- `todos`
- `checklist_items`
- `notifications`

### 화면

- 승인 대기 화면
- 오늘/이번 주 전환이 가능한 가상 캘린더 화면
- TODO/체크리스트 화면
- 알림 화면

### 알림

- 일정 30분 전 알림 데이터 생성
- 장소 또는 체크리스트가 있으면 출발 전 체크리스트 알림 데이터 생성
- 브라우저 Notification 권한 요청 버튼
- 앱이 열려 있으면 30초마다 due notification을 확인합니다.
- due notification은 브라우저 알림 또는 앱 내부 notice로 표시한 뒤 `shown` 상태로 저장합니다.
- 알림 탭에서 예약 알림을 수동 확인하거나 취소할 수 있습니다.

### 문맥 기반 체크리스트

- 원문에 나온 준비물을 우선 포함합니다.
- 회의, 발표, 면접, 통화, 야외 활동, 운동, 식사, 여행, 병원, 수업, 촬영, 날씨 맥락을 규칙 기반으로 감지합니다.
- 야외 활동이면 `썬크림`, `물`, `날씨 확인` 같은 준비물을 자동 추천합니다.
- OpenAI 응답에도 deterministic fallback 추천을 후처리로 덧붙입니다.

### 회귀 테스트

- Vitest 기반 `npm run test` 스크립트
- 샘플 원문 classification fixture
- 시간 조율 interval intersection 테스트
- AI 응답 normalize/schema 방어 테스트

## 부분 구현

### 회의 시간 공통집합 계산

현재 상태:

- AI가 추출한 `time_constraints`를 표시합니다.
- 휴리스틱 fallback은 한국어 요일/시간 표현 일부를 정규화합니다.
- 여러 참석자의 가능 시간 창을 interval intersection으로 계산합니다.
- 불가능 시간 창을 후보에서 차감합니다.
- 공통 후보가 있으면 `propose_time`, 없으면 `ask_follow_up`을 제안합니다.
- OpenAI 응답이 suggestions를 누락해도 deterministic 제안을 보강합니다.
- "토 2-4, 6-"처럼 끝 시간이 없는 범위는 해당 KST 날짜 끝까지 열린 구간으로 계산합니다.
- "토요일 7시 전까지 안됨" 같은 deadline 이전 불가 표현을 차단 구간으로 계산합니다.
- "일요일 하루종일 가능" 같은 하루 전체 가능 표현을 계산합니다.
- 공통 시간이 길거나 여러 구간이면 최대 3개 후보를 우선순위대로 제안합니다.

남은 작업:

- 오전/오후가 생략된 시간의 신뢰도 표시
- 후보 우선순위 설명을 더 자연스러운 한국어 메시지로 다듬기

추천 담당 이슈:

- GitHub Issue #8 `Implement meeting-time negotiation logic`

### PostgreSQL 원격 배포

현재 상태:

- 앱은 `DATABASE_URL`만 있으면 PostgreSQL에 저장 가능합니다.
- 테이블은 앱이 자동 생성합니다.
- 원격 서버 작업 제한은 [docs/DEPLOYMENT_CONSTRAINTS.md](DEPLOYMENT_CONSTRAINTS.md)에 정리되어 있습니다.

남은 작업:

- 교수님 서버의 `/home/vrsoft/HSUniv/team1/` 안에서만 앱 배포
- 서버 내 Node.js/npm/PostgreSQL 사용 가능 여부 확인
- `.env`에 안전한 `DATABASE_URL` 설정
- SSH password 또는 DB password는 repo에 기록하지 않기
- 필요 시 SSH tunnel, 포트, 장기 실행 방식 확인

추천 신규 작업:

- `Provision remote PostgreSQL database`

### 브라우저 알림

현재 상태:

- 알림 데이터 생성
- 권한 요청 버튼 제공
- 페이지가 열려 있을 때 due notification 표시
- 표시 후 notification 상태를 `shown`으로 갱신

남은 작업:

- Service Worker 기반 background notification
- 실제 iOS Safari 제약 확인

추천 담당 이슈:

- GitHub Issue #5 `Add notification generation`

## 의도적으로 제외

1차 MVP에서 제외합니다.

- 실제 카카오톡 자동 수집
- 실제 이메일 계정 연동
- 실제 iOS push notification
- Apple Calendar/Google Calendar 양방향 연동
- 음성파일 직접 STT 변환
- 이미지 OCR 자동 처리
- 복잡한 반복 일정
- 위치 기반 출발 시간 계산

## 다음 에이전트가 바로 할 일

1. Issue #2: OpenAI Responses API 전환 여부 검토
2. Issue #3: 원격 PostgreSQL provisioning 문서 또는 스크립트 추가
3. Issue #8: 끝 시간이 없는 시간 표현, 오전/오후 생략 신뢰도, 복수 후보 우선순위 고도화
4. Issue #5: Service Worker 기반 background notification 검토
5. 테스트 fixture를 실제 GitHub 이슈별 샘플로 계속 확장

추가 고도화 후보:

- 날씨 API를 붙여 비/폭염/추위에 따른 체크리스트를 실제 날짜/장소 기준으로 추천
- 일정 타입별 checklist rule을 DB나 config로 분리
- 추천 항목과 원문에서 직접 나온 항목을 UI에서 구분

## 검증된 명령

```bash
npm run test
npm run typecheck
npm run build
```

모두 통과했습니다.

개발 서버가 `missing required error components` 상태가 되면 `npm run dev:clean`으로 `.next` 캐시를 비우고 다시 시작합니다.
