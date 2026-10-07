// 수동 입력 팩터 (Node 18+). 무료 API가 없는 팩터(D램 현물가, AI서버 발주 등)를 직접 확인한 값으로 넣는다.
//   node umbrella/manual.mjs set 14 --value 57.86 --avg 28 --std 8.5 --prefix '$' --note 'DRAMeXchange DDR5 16Gb'
//   node umbrella/manual.mjs set 31 --current '+40% 급증' --avg '+15%' --z 3.8 --note 'Dell/SMCI 실적'
//   node umbrella/manual.mjs list | rm <id>
// 값은 data/manual.json에 저장되고, fetch-data.mjs가 자동 수집 값보다 우선해 병합한다.
// asOf로부터 ttlDays(기본 7일)가 지나면 무시한다 (낡은 값이 TRIGGER로 남는 것 방지).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBacktest } from './notify.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
export const MANUAL_PATH = join(DIR, 'data', 'manual.json');
const OFF_IDS = new Set([10, 17, 18, 20, 30]);  // 백테스트 C급 OFF
const DEFAULT_TTL = 7;
const DAY = 86400000;

const statusOf = z => Math.abs(z) >= 3 ? 'TRIGGER' : Math.abs(z) >= 1.5 ? `주의 ${z > 0 ? '+' : ''}${z.toFixed(1)}σ` : '정상';

export function loadManual(path = MANUAL_PATH) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { factors: {} };
}

// 입력값 검증 + 표시 문자열/Z-Score 계산 → manual.json 항목
export function buildEntry(o, now = new Date()) {
  const num = k => (o[k] === undefined ? undefined : Number(o[k]));
  let current, avg, z = num('z');
  if (o.value !== undefined) {
    const [v, a, sd] = [num('value'), num('avg'), num('std')];
    if (![v, a].every(Number.isFinite)) throw new Error('--value, --avg는 숫자여야 합니다');
    const fmt = x => `${o.prefix ?? ''}${x.toLocaleString('en-US', { maximumFractionDigits: 2 })}${o.suffix ?? ''}`;
    current = fmt(v); avg = fmt(a) + ' 1Y';
    if (z === undefined) {
      if (!(sd > 0)) throw new Error('--std(0보다 큰 표준편차) 또는 --z가 필요합니다');
      z = (v - a) / sd;
    }
  } else {
    current = o.current; avg = o.avg ?? '-';
    if (!current) throw new Error('--value 또는 --current가 필요합니다');
  }
  if (!Number.isFinite(z)) throw new Error('Z-Score를 계산할 수 없습니다 (--z 또는 --std 필요)');
  const ttl = num('ttl') ?? DEFAULT_TTL;
  if (!(ttl > 0)) throw new Error('--ttl은 0보다 커야 합니다');
  return { current: String(current), avg: String(avg), z: +z.toFixed(2), note: o.note ?? '', asOf: now.toISOString(), ttlDays: ttl };
}

// out.factors에 수동 값을 덮어쓴다. 만료된 값은 무시하고 out.errors에 남긴다.
export function applyManual(out, manual, now = new Date()) {
  for (const [id, m] of Object.entries(manual?.factors ?? {})) {
    const age = (now - new Date(m.asOf)) / DAY;
    if (!(age <= (m.ttlDays ?? DEFAULT_TTL))) {
      out.errors.push(`manual.${id}: ${Math.floor(age)}일 지난 값이라 무시 (ttl ${m.ttlDays ?? DEFAULT_TTL}일)`);
      continue;
    }
    out.factors[id] = { current: m.current, avg: m.avg, z: m.z, status: statusOf(m.z),
      source: `수동 입력 ${m.asOf.slice(0, 10)}${m.note ? ' · ' + m.note : ''}`, manual: true };
  }
  return out;
}

function parseArgs(argv) {
  const o = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { o[argv[i].slice(2)] = argv[i + 1]; i++; } else pos.push(argv[i]);
  }
  return { o, pos };
}

function cli(argv) {
  const [cmd, ...rest] = argv; const { o, pos } = parseArgs(rest);
  const meta = loadBacktest(), m = loadManual();
  if (cmd === 'list') {
    for (const [id, v] of Object.entries(m.factors))
      console.log(`${id} ${meta[id]?.name ?? '?'}  ${v.current} (z ${v.z})  ${v.asOf.slice(0, 10)} ttl ${v.ttlDays}일  ${v.note}`);
    return;
  }
  const id = Number(pos[0]);
  if (!meta[id]) throw new Error(`알 수 없는 팩터 id: ${pos[0]} (백테스트 CSV 기준 1~40)`);
  if (cmd === 'rm') { delete m.factors[id]; }
  else if (cmd === 'set') {
    if (OFF_IDS.has(id)) throw new Error(`${meta[id].name}(${id})은 백테스트 C급 OFF 팩터라 스캔에서 제외됩니다`);
    m.factors[id] = buildEntry(o);
  } else throw new Error('사용법: set <id> ... | rm <id> | list');
  mkdirSync(dirname(MANUAL_PATH), { recursive: true });
  writeFileSync(MANUAL_PATH, JSON.stringify(m, null, 2) + '\n');
  console.log(cmd === 'rm' ? `삭제: ${meta[id].name}` : `저장: ${meta[id].name} → ${m.factors[id].current} (z ${m.factors[id].z}, ${statusOf(m.factors[id].z)})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { cli(process.argv.slice(2)); } catch (e) { console.error('오류:', e.message); process.exit(1); }
}
