// UMBRELLA v8.2 실데이터 수집기 (Node 18+, 의존성 없음)
//   node umbrella/fetch-data.mjs  →  umbrella/data/factors.json
// 브라우저는 Yahoo/FRED의 CORS를 막으므로 서버(또는 GitHub Actions)에서 수집하고,
// 대시보드는 같은 출처의 data/factors.json만 읽는다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notify } from './notify.mjs';
import { applyManual, loadManual } from './manual.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (UMBRELLA-v8.2)' };
const LB_PER_TONNE = 2204.62;

export const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
export const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
export const zscore = (series) => {
  const s = std(series);
  return s === 0 ? 0 : (series[series.length - 1] - mean(series)) / s;
};
export const statusOf = z => Math.abs(z) >= 3 ? 'TRIGGER' : Math.abs(z) >= 1.5 ? `주의 ${z > 0 ? '+' : ''}${z.toFixed(1)}σ` : '정상';

export async function yahooCloses(symbol, fetchFn = fetch) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  const res = await fetchFn(url, { headers: UA });
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
  const closes = (await res.json())?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  const clean = (closes || []).filter(x => typeof x === 'number' && isFinite(x));
  if (clean.length < 30) throw new Error(`Yahoo ${symbol}: 데이터 부족 (${clean.length})`);
  return clean;
}

export async function fredValues(id, n = 52, fetchFn = fetch) {
  const res = await fetchFn(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: UA });
  if (!res.ok) throw new Error(`FRED ${id} HTTP ${res.status}`);
  const vals = (await res.text()).trim().split('\n').slice(1)
    .map(l => parseFloat(l.split(',')[1])).filter(x => isFinite(x));
  if (vals.length < 10) throw new Error(`FRED ${id}: 데이터 부족 (${vals.length})`);
  return vals.slice(-n);
}

// 무료 공개 API가 없는 팩터(D램 현물가, AI서버 발주)는 관련 종목 바스켓을 프록시로 쓴다.
// 1년 전=100으로 정규화한 균등가중 지수의 Z-Score. 거래소 휴장일이 달라 최근 N일 기준으로 맞춘다.
export async function basketIndex(symbols, fetchFn = fetch) {
  const all = await Promise.all(symbols.map(s => yahooCloses(s, fetchFn)));
  const n = Math.min(...all.map(a => a.length));
  const norm = all.map(a => a.slice(-n).map(x => (x / a[a.length - n]) * 100));
  return Array.from({ length: n }, (_, i) => mean(norm.map(a => a[i])));
}

const entry = (series, fmt, avgFmt, source) => {
  const z = zscore(series);
  return { current: fmt(series[series.length - 1]), avg: avgFmt(mean(series)), z: +z.toFixed(2), status: statusOf(z), source };
};

// id는 v6/v7/v8 팩터 번호와 동일
const jobs = {
  8: async f => {   // 구리 가격 (COMEX HG=F, $/lb → $/t)
    const s = (await yahooCloses('HG=F', f)).map(x => x * LB_PER_TONNE);
    return entry(s, v => `$${Math.round(v).toLocaleString('en-US')}/t`, v => `$${Math.round(v).toLocaleString('en-US')}/t 1Y`, 'Yahoo Finance HG=F');
  },
  11: async f => {  // 원/달러
    const s = await yahooCloses('KRW=X', f);
    return entry(s, v => `${Math.round(v).toLocaleString('en-US')}원`, v => `${Math.round(v).toLocaleString('en-US')}원 1Y`, 'Yahoo Finance KRW=X');
  },
  14: async f => {  // D램 현물가 → 메모리 바스켓 프록시 (MU, SK하이닉스, 삼성전자)
    const s = await basketIndex(['MU', '000660.KS', '005930.KS'], f);
    return { ...entry(s, v => `메모리 바스켓 ${v.toFixed(0)}`, v => `${v.toFixed(0)} 1Y`, 'Yahoo MU+000660.KS+005930.KS (프록시)'), proxy: true };
  },
  31: async f => {  // AI서버 발주 → AI서버 바스켓 프록시 (NVDA, SMCI, DELL)
    const s = await basketIndex(['NVDA', 'SMCI', 'DELL'], f);
    return { ...entry(s, v => `AI서버 바스켓 ${v.toFixed(0)}`, v => `${v.toFixed(0)} 1Y`, 'Yahoo NVDA+SMCI+DELL (프록시)'), proxy: true };
  },
  25: async f => {  // 미국 원유 재고 (FRED WCESTUS1, 천 배럴)
    const s = (await fredValues('WCESTUS1', 52, f)).map(x => x / 1000);
    return entry(s, v => `${v.toFixed(1)}M 배럴`, v => `${v.toFixed(1)}M 52주`, 'FRED WCESTUS1 (EIA)');
  },
};
// DXY는 백테스트 C급 OFF → 스캔 제외, 참고 카드용으로만 수집
const refJobs = {
  dxy: async f => { const s = await yahooCloses('DX-Y.NYB', f); return { value: +s[s.length - 1].toFixed(2), z: +zscore(s).toFixed(2), source: 'Yahoo Finance DX-Y.NYB' }; },
};

export async function collect(fetchFn = fetch) {
  const out = { updated: new Date().toISOString(), factors: {}, ref: {}, errors: [] };
  const run = async (bucket, key, job) => {
    try { out[bucket][key] = await job(fetchFn); }
    catch (e) { out.errors.push(`${bucket}.${key}: ${e.message}`); }
  };
  await Promise.all([
    ...Object.entries(jobs).map(([id, j]) => run('factors', id, j)),
    ...Object.entries(refJobs).map(([k, j]) => run('ref', k, j)),
  ]);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = await collect();
  applyManual(out, loadManual());  // 수동 입력 값이 자동 수집 값보다 우선
  console.log(`factors ${Object.keys(out.factors).length}/${Object.keys(jobs).length}(자동)+수동, errors ${out.errors.length}`);
  out.errors.forEach(e => console.error(' -', e));
  if (!Object.keys(out.factors).length) process.exit(1);  // 전부 실패하면 기존 factors.json을 덮어쓰지 않는다
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'data');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'factors.json'), JSON.stringify(out, null, 2) + '\n');
  await notify(out);
}
