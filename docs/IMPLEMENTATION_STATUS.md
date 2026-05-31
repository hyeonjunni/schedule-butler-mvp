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
- 일정 리스트 화면
- TODO/체크리스트 화면
- 알림 화면

### 알림

- 일정 30분 전 알림 데이터 생성
- 장소 또는 체크리스트가 있으면 출발 전 체크리스트 알림 데이터 생성
- 브라우저 Notification 권한 요청 버튼

### 문맥 기반 체크리스트

- 원문에 나온 준비물을 우선 포함합니다.
- 회의, 발표, 면접, 통화, 야외 활동, 운동, 식사, 여행, 병원, 수업, 촬영, 날씨 맥락을 규칙 기반으로 감지합니다.
- 야외 활동이면 `썬크림`, `물`, `날씨 확인` 같은 준비물을 자동 추천합니다.
- OpenAI 응답에도 deterministic fallback 추천을 후처리로 덧붙입니다.

## 부분 구현

### 회의 시간 공통집합 계산

현재 상태:

- AI가 추출한 `time_constraints`를 표시합니다.
- 휴리스틱 fallback은 한국어 요일/시간 표현 일부를 정규화합니다.
- 가장 빠른 가능 시간 후보를 제안합니다.
- 같은 날짜의 불가능 조건이 있으면 충돌 risk를 표시합니다.

남은 작업:

- 여러 참석자의 시간 창을 실제 interval intersection으로 계산
- 불가능 시간 차집합 처리
- "토 2-4, 6-"처럼 끝 시간이 없는 표현의 정책 정교화
- 오전/오후가 생략된 시간의 신뢰도 표시
- 후보가 여러 개일 때 우선순위와 대안 표시

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

남은 작업:

- 페이지가 열려 있을 때 due notification 표시
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

1. Issue #8: interval intersection 기반 시간 조율 엔진 구현
2. Issue #6: 샘플 원문 fixture와 기대 classification 테스트 추가
3. Issue #3: 원격 PostgreSQL provisioning 문서 또는 스크립트 추가
4. Issue #5: due notification polling 및 browser notification 표시
5. Issue #2: OpenAI Responses API 전환 여부 검토와 schema validation 강화

추가 고도화 후보:

- 날씨 API를 붙여 비/폭염/추위에 따른 체크리스트를 실제 날짜/장소 기준으로 추천
- 일정 타입별 checklist rule을 DB나 config로 분리
- 추천 항목과 원문에서 직접 나온 항목을 UI에서 구분

## 검증된 명령

```bash
npm run typecheck
npm run build
```

둘 다 통과했습니다.
