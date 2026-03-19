# 미션보드 🏃

카카오톡 단톡방 친구들과 함께하는 월간 운동 미션 보드

## 기능

- **닉네임 + 방 코드**로 간편 입장 (같은 코드 = 같은 방)
- **월간 미션 등록** — 미션 제목, 설명(URL 등), 이벤트 날짜
- **함께하기 / 빠지기** — 참여 토글
- **미션 수정/삭제** — 미션오너만 가능
- **월별 네비게이션** — 화살표로 월 이동
- **D-day 자동 계산** — 지난 미션은 자동으로 흐리게 표시

## 기술 스택

- **Backend**: Node.js + Express
- **Database**: JSON 파일 (네이티브 모듈 불필요, 어디서든 바로 실행)
- **Frontend**: Vanilla HTML/CSS/JS (SPA)

## 로컬 실행

```bash
npm install
npm start
# http://localhost:3000
```

## Railway 배포

1. GitHub에 코드 푸시
2. [Railway](https://railway.app)에서 **New Project → Deploy from GitHub**
3. 레포 연결하면 자동 감지 + 배포
4. (선택) 영구 데이터를 위해 Railway Volume 연결:
   - Service → Settings → Volumes → Mount
   - Mount path: `/data`
   - 환경변수 추가: `DATA_DIR=/data`

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | 서버 포트 | `3000` |
| `DB_PATH` | SQLite 파일 경로 | `./data.db` |
