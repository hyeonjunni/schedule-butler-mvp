# Claude Guide

먼저 [AGENTS.md](AGENTS.md)를 읽고 그 지침을 따르세요.

이 프로젝트의 핵심은 "정제되지 않은 원문에서 일정을 추론하되, 사용자 승인 전에는 저장하지 않는 것"입니다.

Claude가 맡기 좋은 작업:

- Next.js 앱 골격 생성
- iPhone 스타일 모바일 UI 구현
- OpenAI API route 구현
- Prisma schema 작성
- 시간 조율 대화 샘플 테스트 작성

주의:

- `.env` 또는 실제 key/password를 커밋하지 마세요.
- 미확정 일정은 `Event`로 저장하지 말고 `ExtractionDraft` 또는 승인 대기 상태로 두세요.
- 회의 시간 조율 대화는 공통 가능 시간 계산과 충돌 설명이 핵심입니다.
