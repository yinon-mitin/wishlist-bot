// Checks the Markdown documents: required README sections, and that every relative link and anchor resolves.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_SECTIONS = ['Overview', 'Features', 'Quick start', 'Security model', 'Credits and license'];

/** GitHub-style heading anchor. */
export const slug = (heading) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

const stripFences = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');

function headingsAndIds(text) {
  const body = stripFences(text);
  const anchors = new Set();
  for (const m of body.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    anchors.add(slug(m[1].replace(/`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')));
  }
  for (const m of body.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(m[1]);
  return { anchors, headings: [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]) };
}

function linksIn(text) {
  const body = stripFences(text).replace(/`[^`\n]*`/g, '');
  const out = [];
  for (const m of body.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push(m[1]);
  for (const m of body.matchAll(/\b(?:src|href)="([^"]+)"/g)) out.push(m[1]);
  return out;
}

const isExternal = (target) => /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');

export function validateDocs(root) {
  const problems = [];
  const readmePath = join(root, 'README.md');
  if (!existsSync(readmePath)) return ['README.md is missing'];

  const files = [readmePath];
  const docsDir = join(root, 'docs');
  if (existsSync(docsDir)) for (const f of readdirSync(docsDir)) if (f.endsWith('.md')) files.push(join(docsDir, f));
  for (const f of ['SECURITY.md', 'CONTRIBUTING.md', 'CONTRIBUTORS.md']) if (existsSync(join(root, f))) files.push(join(root, f));

  const cache = new Map();
  const info = (path) => {
    if (!cache.has(path)) cache.set(path, headingsAndIds(readFileSync(path, 'utf8')));
    return cache.get(path);
  };

  const sections = info(readmePath).headings.map(slug);
  for (const s of REQUIRED_SECTIONS) {
    if (!sections.includes(slug(s))) problems.push(`README.md: missing section "${s}"`);
  }

  for (const file of files) {
    const rel = relative(root, file);
    for (const target of linksIn(readFileSync(file, 'utf8'))) {
      if (isExternal(target)) continue;
      const [pathPart, anchor] = target.split('#');
      const clean = (pathPart ?? '').split('?')[0];
      const targetPath = clean === '' ? file : resolve(dirname(file), decodeURI(clean));
      if (!existsSync(targetPath)) {
        problems.push(`${rel}: link to missing file "${target}"`);
        continue;
      }
      if (anchor && statSync(targetPath).isFile() && targetPath.endsWith('.md') && !info(targetPath).anchors.has(decodeURIComponent(anchor))) {
        problems.push(`${rel}: link to missing anchor "#${anchor}" in ${relative(root, targetPath) || rel}`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = validateDocs(process.cwd());
  for (const p of problems) console.error(p);
  console.log(problems.length ? `docs: ${problems.length} problem(s)` : 'docs: ok');
  process.exit(problems.length ? 1 : 0);
}
