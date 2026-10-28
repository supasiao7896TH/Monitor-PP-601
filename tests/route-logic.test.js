import { describe, it, expect } from 'vitest';
import { resolveTab, TABS, DEFAULT_TAB } from '../src/modules/route-logic.js';

describe('route-logic (PC Desktop First)', () => {
  it('defaults to "report" tab for PC Dashboard experience', () => {
    expect(DEFAULT_TAB).toBe('report');
  });

  it('resolves empty or root hashes to default tab', () => {
    expect(resolveTab('')).toBe('report');
    expect(resolveTab('#')).toBe('report');
    expect(resolveTab('#/')).toBe('report');
    expect(resolveTab(null)).toBe('report');
    expect(resolveTab(undefined)).toBe('report');
  });

  it('resolves valid known tab ids', () => {
    expect(resolveTab('#/report')).toBe('report');
    expect(resolveTab('#/record')).toBe('record');
    expect(resolveTab('#/history')).toBe('history');
    expect(resolveTab('#/settings')).toBe('settings');
  });

  it('handles query parameters safely', () => {
    expect(resolveTab('#/report?shift=2026-10-28-D')).toBe('report');
    expect(resolveTab('#/history?pump=A&from=1000')).toBe('history');
  });

  it('falls back to default tab when unknown hash is provided', () => {
    expect(resolveTab('#/unknown-page')).toBe('report');
    expect(resolveTab('#/admin')).toBe('report');
  });

  it('contains 4 core tabs with report as first navigation item for desktop', () => {
    expect(TABS.map((t) => t.id)).toEqual(['report', 'record', 'history', 'settings']);
  });
});
