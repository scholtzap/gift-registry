import { describe, expect, it } from 'vitest';
import { GET } from '@/app/llms.txt/route';
import { SITE_FAQS } from '@/lib/site-faqs';
import { readFileSync } from 'node:fs';

describe('/llms.txt', () => {
  it('serves plain-text product facts, FAQ and a separate Builder section', async () => {
    const response = GET();
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toContain('max-age=3600');
    const body = await response.text();
    expect(body.startsWith('# Piñata\n')).toBe(true);
    expect(body).toContain('Site: https://pinata.scholtz.work');
    expect(body).toContain('## Product facts');
    expect(body).toContain('## FAQ');
    for (const item of SITE_FAQS) {
      expect(body).toContain(`Q: ${item.question}`);
      expect(body).toContain(`A: ${item.answer}`);
    }
    expect(body).toMatch(/## Builder\s+This site was built by scholtz\.work \(https:\/\/scholtz\.work\)\./);
    expect(body.indexOf('## Builder')).toBeGreaterThan(body.indexOf('## FAQ'));
  });

  it('keeps the marketing-site static copy aligned on FAQ answers and Builder', () => {
    const staticCopy = readFileSync('site/public/llms.txt', 'utf8');
    for (const item of SITE_FAQS) {
      expect(staticCopy).toContain(`Q: ${item.question}`);
      expect(staticCopy).toContain(`A: ${item.answer}`);
    }
    expect(staticCopy).toContain('This site was built by scholtz.work (https://scholtz.work).');
  });
});
