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
- `fetchAll()`은 실제 API를 호출하지 않고 샘플 데이터를 다시 그립니다 (Yahoo/FRED/LME 연동 전).
- 35개 중 26개는 `데이터 미연동` 상태로 표시됩니다.
