# Deployment Constraints

교수님 서버 배포 작업은 아래 제한을 반드시 지킵니다.

## 서버

- SSH target: `[server-host-redacted]`
- 접속 계정/비밀번호는 repo, issue, commit, 로그에 기록하지 않습니다.
- 비밀번호는 작업자가 직접 입력하거나 안전한 out-of-band 방식으로 전달받습니다.

## 허용 작업 경로

서버에서는 아래 경로 안에서만 읽기/쓰기/실행 작업을 합니다.

```text
/home/vrsoft/HSUniv/team1/
```

## 금지

- `/home/vrsoft/HSUniv/team1/` 밖의 파일 읽기, 수정, 삭제, 이동
- `/etc`, `/var`, `/usr`, `/home/vrsoft/HSUniv/`의 다른 팀 폴더 접근
- `sudo`, `apt`, `systemctl`, 전역 npm install 같은 시스템 영향 작업
- 다른 서비스 포트, nginx/apache 설정, DB 설정 변경
- 서버에 `.env` 값, SSH password, DB password를 평문 문서로 남기기
- 테스트가 끝난 뒤 서버 프로세스를 켜둔 채 방치하기

## 권장 배포 방식

1차 배포는 user-space 방식으로 합니다.

1. `/home/vrsoft/HSUniv/team1/schedule-butler-mvp` 아래에 앱 소스 배치
2. 해당 폴더 안에서만 `.env` 생성
3. 해당 폴더 안에서만 `npm install`, `npm run build`
4. 실행은 기존 서버 정책에 맞춰 별도 확인 후 진행
5. 서버 부하를 막기 위해 실행 테스트가 끝나면 항상 실행 중인 앱 프로세스를 종료

서버에 이미 Node.js/npm이 없거나 DB가 준비되어 있지 않으면, 시스템 설치를 시도하지 말고 사용자에게 확인합니다.

## 서버 실행 종료 원칙

- 테스트용 `npm run dev`, `npm run start`, `next dev`, `next start` 프로세스는 검증 직후 종료합니다.
- 장기 실행이 필요하면 먼저 사용자와 허용 방식, 포트, 종료 책임자를 확인합니다.
- 임시 실행 로그는 필요한 결과만 요약하고, 비밀번호나 `.env` 값을 남기지 않습니다.

## 배포 전 확인할 것

- 사용할 포트
- 서버 내 Node.js/npm 설치 여부
- PostgreSQL을 같은 서버에서 쓸지, 별도 DB를 쓸지
- 장기 실행 방식: 기존 supervisor, pm2, tmux, systemd 중 무엇을 허용하는지
- 외부 접속을 열어야 하는지, 내부 데모만 필요한지
