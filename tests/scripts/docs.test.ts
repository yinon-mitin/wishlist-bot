import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { slug, validateDocs } from '../../scripts/validate-docs.mjs';

const SECTIONS = ['Overview', 'Features', 'Quick start', 'Security model', 'Credits and license'];
const readme = (extra = '', sections = SECTIONS) => `# Title\n\n${sections.map((s) => `## ${s}\n\ntext\n`).join('\n')}\n${extra}\n`;

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'docs-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe('slug', () => {
  it('follows GitHub anchors', () => {
    expect(slug('Quick start')).toBe('quick-start');
    expect(slug('Credits and license')).toBe('credits-and-license');
    expect(slug('What it looks like')).toBe('what-it-looks-like');
    expect(slug('Q&A: `make up`?')).toBe('qa-make-up');
  });
});

describe('validate-docs', () => {
  it('passes a complete README with working links', () => {
    const root = repo({
      'README.md': readme('[install](docs/INSTALL.md#first-run) [top](#top) ![b](assets/banner.svg) <a id="top"></a>'),
      'docs/INSTALL.md': '# Install\n\n## First run\n',
      'assets/banner.svg': '<svg/>',
    });
    expect(validateDocs(root)).toEqual([]);
  });

  it('requires the main README sections', () => {
    const problems = validateDocs(repo({ 'README.md': readme('', ['Overview', 'Features']) }));
    expect(problems.join('\n')).toMatch(/Quick start/);
    expect(problems.join('\n')).toMatch(/Security model/);
    expect(problems.join('\n')).toMatch(/Credits and license/);
  });

  it('reports a missing README', () => {
    expect(validateDocs(repo({}))[0]).toMatch(/README\.md/);
  });

  it('flags a link to a file that does not exist', () => {
    expect(validateDocs(repo({ 'README.md': readme('[x](docs/NOPE.md)') })).join()).toMatch(/docs\/NOPE\.md/);
  });

  it('flags an anchor that does not exist, in the same file and in another one', () => {
    const root = repo({ 'README.md': readme('[a](#nowhere) [b](docs/A.md#missing)'), 'docs/A.md': '# A\n' });
    const text = validateDocs(root).join('\n');
    expect(text).toMatch(/#nowhere/);
    expect(text).toMatch(/#missing/);
  });

  it('checks docs/*.md too, resolving links relative to the file', () => {
    const root = repo({ 'README.md': readme(), 'docs/A.md': '[up](../README.md#overview) [bad](B.md)' });
    const text = validateDocs(root).join('\n');
    expect(text).toMatch(/B\.md/);
    expect(text).not.toMatch(/README\.md#overview/);
  });

  it('ignores external links and links inside code fences', () => {
    const root = repo({ 'README.md': readme('[e](https://example.com/x) [m](mailto:a@b.c)\n\n```md\n[no](missing.md)\n```') });
    expect(validateDocs(root)).toEqual([]);
  });

  it('checks HTML src and href attributes', () => {
    const root = repo({ 'README.md': readme('<img src="assets/missing.svg">') });
    expect(validateDocs(root).join()).toMatch(/assets\/missing\.svg/);
  });
});
