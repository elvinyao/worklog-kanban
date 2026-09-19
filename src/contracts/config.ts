export interface SiteConfig {
  mode: 'dummy' | 'production';
  boardOrigin: string;
  jiraBaseUrl: string;
  mattermostBaseUrl: string;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object');
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) throw new Error('Invalid fields');
}
export function canonicalBase(value: unknown, originOnly = false): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value) || /[\\%?#@]/.test(value)) throw new Error('Invalid site URL');
  const raw = /^(https?):\/\/([^/]+)(.*)$/i.exec(value);
  if (!raw) throw new Error('Invalid site URL');
  const authority = raw[2]!;
  const host = authority.split(':')[0]!.toLowerCase();
  if (!/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(host)) throw new Error('Invalid hostname');
  if (/^[0-9.]+$/.test(host)) {
    if (!/^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(host) || host.split('.').some(p => Number(p) > 255)) throw new Error('Invalid address');
  } else if (!/[a-z]/.test(host.split('.').at(-1)!)) throw new Error('Invalid hostname');
  const url = new URL(value);
  if (url.hostname !== host || url.port === '0' || authority.endsWith(':')) throw new Error('Invalid host or port');
  const path = raw[3]!;
  if (!/^(?:\/[A-Za-z0-9_-]+)*\/?$/.test(path) || (originOnly && path !== '' && path !== '/')) throw new Error('Invalid context path');
  return url.origin + path.replace(/\/$/, '');
}

export function validateConfig(value: unknown): SiteConfig {
  const v = record(value);
  exact(v, ['mode', 'boardOrigin', 'jiraBaseUrl', 'mattermostBaseUrl']);
  if (v.mode !== 'dummy' && v.mode !== 'production') throw new Error('Invalid mode');
  const config: SiteConfig = {mode: v.mode, boardOrigin: canonicalBase(v.boardOrigin, true), jiraBaseUrl: canonicalBase(v.jiraBaseUrl), mattermostBaseUrl: canonicalBase(v.mattermostBaseUrl)};
  if (config.mode === 'dummy' && new Set([config.boardOrigin, config.jiraBaseUrl, config.mattermostBaseUrl].map(v => new URL(v).hostname)).size !== 3) throw new Error('Dummy services require distinct hostnames');
  return config;
}
