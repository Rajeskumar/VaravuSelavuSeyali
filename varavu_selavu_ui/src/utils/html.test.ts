import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('neutralizes the audit payload', () => {
    expect(escapeHtml('ZZTEST <b>bold</b> <img src=x onerror=alert(1)>')).toBe(
      'ZZTEST &lt;b&gt;bold&lt;/b&gt; &lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('escapes script tags', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes quotes so text cannot break out of an attribute', () => {
    expect(escapeHtml('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
    expect(escapeHtml("' onmouseover='alert(1)")).toBe('&#39; onmouseover=&#39;alert(1)');
  });

  it('escapes ampersands first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('Costco groceries 42.50')).toBe('Costco groceries 42.50');
  });
});
