# UMBRELLA v8.2 Real Data Engine + Telegram

| 항목 | 내용 |
|---|---|
| 버전 | v8.2 Real Data Engine + Telegram |
| 엔진 | 35개 팩터 (백테스트 C급 5개 OFF) — 실연동 9 + API 미연동 26, 16종목 글로벌 헤지 |
| 포트폴리오 | 2000만원 50:50, 백테스트 100→345 +245% 연 23.8% |
| S급 5개 | 비트코인 반감기 20%, AI서버 18%, CoWoS 17%, 폴란드 국방 16%, 칠레 구리 15% |
| 현재 TRIGGER 4개 + 만성 1 | 호르무즈 Z3.2, AI서버 Z3.8, 폴란드 Z3.1, D램 Z3.5 (+ CoWoS 만성 병목, Z 0.3) |
| Real Data | 구리 $14,505, D램 $57.86, 원유 426.4M, CoWoS 100% (DXY 98.82는 C급 OFF라 참고용) |

## 파일

- `UMBRELLA-V8-Real-Data-Engine.html` — v8.2 실시간 Z-Score 대시보드 + 텔레그램 알림 연동
- `UMBRELLA-V7-Backtest.html` / `UMBRELLA-V7-Backtest-40.csv` — 40개 팩터 5년 백테스트
- `UMBRELLA-V6-Factor-Manager.html` — 팩터 ON/OFF·3σ·영향종목 편집기
- `UMBRELLA-V8-2-Bots.csv` — 스캔/리포트/알람 봇 스케줄

## 현재 한계
- 35개 중 LIVE는 3개뿐이고 나머지는 샘플 또는 `데이터 미연동`입니다.

## 실데이터 연동 (v8.2)
- `fetch-data.mjs` (Node 18+, 의존성 없음): Yahoo Finance·FRED에서 수집해 1년 평균/표준편차로 Z-Score 계산 → `data/factors.json`
  - LIVE 3개: 구리(HG=F), 원/달러(KRW=X), 미국 원유 재고(FRED WCESTUS1) + DXY 참고값
  - D램·CoWoS·AI서버·폴란드·호르무즈·칠레 파업·비트코인 반감기 등은 무료 API가 없어 **샘플 유지** (🟢 표시 없음)
- 브라우저는 Yahoo/FRED CORS가 막혀 있어 대시보드는 같은 출처의 `data/factors.json`만 읽습니다. 실패하면 샘플로 폴백합니다.
- `.github/workflows/umbrella-data.yml`: 4시간마다 수집 후 `factors.json` 커밋 (기본 브랜치에 병합돼야 스케줄 동작)
- 로컬 실행: `node umbrella/fetch-data.mjs && python3 -m http.server -d umbrella`

## 텔레그램 알림 (서버 측)
- `notify.mjs`: `fetch-data.mjs` 실행 끝에 호출됩니다. **새로 TRIGGER가 된 LIVE 팩터만** 발송하고, 해제 전까지 재발송하지 않습니다 (`data/alert-state.json`). 발송 실패는 다음 스캔에서 재시도합니다.
- 설정: 저장소 Settings → Secrets and variables → Actions에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 등록. 토큰은 코드/로그/커밋에 남지 않습니다.
- 로컬 테스트: `TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node umbrella/fetch-data.mjs` (토큰이 없으면 메시지만 출력하고 보내지 않음)
- 샘플 값(D램, AI서버 등)은 알림 대상이 아닙니다. LIVE 팩터가 늘어나면 자동으로 포함됩니다.
- 대시보드의 토큰 입력칸은 브라우저 테스트용이며 4시간 스캔과는 별개입니다.
