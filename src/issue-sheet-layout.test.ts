import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const match = new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')} \\{([^}]*)\\}`).exec(css);
  if (match?.[1] === undefined) throw new Error(`Missing top-level rule for ${selector}`);
  return match[1];
}

// Tests run without a layout engine, so pin the stylesheet contract instead. In short
// panes the header and linked-card panel used to clip below a non-scrolling sheet: the
// "Open on <workspace>" click then landed outside the dialog and only closed it.
describe('issue sheet layout', () => {
  it('scrolls the whole sheet once the tab region reaches its minimum height', () => {
    expect(rule('.issue-sheet')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.detail-tabs-root')).toMatch(/min-height:\s*16rem/);
  });
});
