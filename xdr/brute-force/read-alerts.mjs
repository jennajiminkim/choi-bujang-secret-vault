import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Allowlisted fields only. Never print raw Wazuh full_log or data objects.
export function safeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?-----END [\s\S]*?PRIVATE KEY-----/g, '[REDACTED]')
    .replace(/\b(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+)\b/gi, '[REDACTED]')
    .replace(/(?:password|passwd|pwd|token|secret|api[_-]?key|비밀번호|토큰|비밀키)\s*[=:：]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '[REDACTED]')
    .replace(/[\r\n\t]/g, ' ')
    .slice(0, 500);
}

export function extractAlerts(alerts) {
  if (!Array.isArray(alerts)) throw new Error('경보 배열이 아닙니다.');
  return alerts.map(alert => ({
    timestamp: safeText(alert?.timestamp),
    sourceIp: safeText(alert?.data?.srcip),
    account: safeText(alert?.data?.srcuser),
    level: Number.isFinite(Number(alert?.rule?.level)) ? Number(alert.rule.level) : null,
    description: safeText(alert?.rule?.description),
  }));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const fixture = JSON.parse(await readFile(new URL('../fixtures/brute-force.json', import.meta.url), 'utf8'));
    for (const row of extractAlerts(fixture.alerts)) console.log(JSON.stringify(row));
  } catch {
    console.error('경보 읽기 오류: 파일과 경보 배열 형식을 확인하세요.');
    process.exitCode = 1;
  }
}
