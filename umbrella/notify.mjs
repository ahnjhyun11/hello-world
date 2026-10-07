// 텔레그램 알림 (Node 18+). 토큰은 환경변수/GitHub Secrets로만 받고 저장·출력하지 않는다.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// 새로 TRIGGER가 된 LIVE 팩터만 보낸다. 이미 TRIGGER였던 팩터는 해제될 때까지 재발송하지 않는다
// (상태: data/alert-state.json).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const V8_KELLY = { 8: 8, 25: 9 };  // 대시보드 v8.2에서 쓰는 Kelly (그 외는 백테스트 CSV)

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}

export function loadBacktest(path = join(DIR, 'UMBRELLA-V7-Backtest-40.csv')) {
  const [head, ...rows] = readFileSync(path, 'utf8').replace(/^﻿/, '').trim().split('\n');
  const keys = splitCsv(head.trim());
  const meta = {};
  for (const r of rows) {
    const o = Object.fromEntries(splitCsv(r.trim()).map((v, i) => [keys[i], v]));
    meta[+o.id] = { name: o.name, stocks: o.stocks, ret5: +o.avg_return_5d, win: Math.round(+o.win_rate * 100),
      kelly: V8_KELLY[+o.id] ?? Math.round(+o.kelly * 100) };
  }
  return meta;
}

// prev: 지난 상태 {id: 'TRIGGER'|'OK'}, out: collect() 결과 → {alerts, next}
export function pickAlerts(prev, out, meta) {
  const alerts = [], next = {};
  for (const [id, f] of Object.entries(out.factors)) {
    const on = f.status === 'TRIGGER';
    next[id] = on ? 'TRIGGER' : 'OK';
    if (on && prev[id] !== 'TRIGGER' && meta[id]) alerts.push({ id: +id, ...f, ...meta[id] });
  }
  // 이번에 수집 실패한 팩터는 이전 상태 유지 (실패 때문에 재발송되는 것 방지)
  for (const id of Object.keys(prev)) if (!(id in next)) next[id] = prev[id];
  return { alerts, next };
}

export function buildMessage(a, when = new Date()) {
  return [
    '🚨 [UMBRELLA TRIGGER v8 REAL]',
    `팩터: ${a.name} ${a.current}`,
    `Z-Score: ${a.z}σ (평균 ${a.avg})`,
    `출처: ${a.source}`,
    `영향: ${a.stocks}`,
    `액션: BUY Kelly ${a.kelly}%`,
    `예상: 5일 +${a.ret5}% 승률 ${a.win}%`,
    `시간: ${when.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST`,
  ].join('\n');
}

export async function sendTelegram(token, chatId, text, fetchFn = fetch) {
  const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);  // 토큰이 담긴 URL은 출력하지 않는다
}

export async function notify(out, { fetchFn = fetch, env = process.env, dir = DIR } = {}) {
  const statePath = join(dir, 'data', 'alert-state.json');
  const prev = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const { alerts, next } = pickAlerts(prev, out, loadBacktest(join(dir, 'UMBRELLA-V7-Backtest-40.csv')));
  const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    alerts.forEach(a => console.log('[DRY-RUN, 토큰 없음]\n' + buildMessage(a)));
    console.log(`telegram: 토큰 미설정 — 알림 ${alerts.length}건 미발송, 상태 미저장`);
    return { sent: 0, dryRun: alerts.length };
  }
  let sent = 0;
  for (const a of alerts) {
    try { await sendTelegram(token, chat, buildMessage(a), fetchFn); sent++; }
    catch (e) { console.error(`telegram: ${a.name} 발송 실패 — ${e.message}`); next[a.id] = prev[a.id] ?? 'OK'; }  // 다음 스캔에서 재시도
  }
  writeFileSync(statePath, JSON.stringify(next, null, 2) + '\n');
  console.log(`telegram: ${sent}/${alerts.length}건 발송`);
  return { sent };
}
