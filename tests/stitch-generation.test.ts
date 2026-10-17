import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFolders = [
  'route_v3_compact_preview',
  'route_active_journey_guidance',
  'report_stage_1_upload_evidence',
  'report_stage_2_ai_scan_confirm',
  'report_stage_3_successfully_reported',
  'my_reports_simple_list',
];

type GeneratedPage = {
  roots: Record<'html' | 'body', Record<string, string>>;
  scripts: string[];
  stylesheets: string[];
  ids: string[];
};

// Parse generated elements, rather than matching a particular line in prepare.py.
const inspectGeneratedDOM = `
from html.parser import HTMLParser
from pathlib import Path
import json, sys

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.result = dict(roots={}, scripts=[], stylesheets=[], ids=[])
    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag in ('html', 'body'):
            self.result['roots'][tag] = attributes
        if tag == 'script' and 'src' in attributes:
            self.result['scripts'].append(attributes['src'])
        if tag == 'link' and attributes.get('rel') == 'stylesheet':
            self.result['stylesheets'].append(attributes.get('href'))
        if 'id' in attributes:
            self.result['ids'].append(attributes['id'])

pages = {}
for path in sorted(Path(sys.argv[1]).glob('*.html')):
    page = Page()
    page.feed(path.read_text())
    pages[path.stem] = page.result
print(json.dumps(pages))
`;

test('generated Stitch page roots allow responsive width and growing report content', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'accessloop-stitch-generation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts/stitch'), { recursive: true });
  await mkdir(join(root, 'public/stitch'), { recursive: true });
  await copyFile(join(projectRoot, 'scripts/stitch/prepare.py'), join(root, 'scripts/stitch/prepare.py'));
  for (const folder of sourceFolders) {
    const target = join(root, 'docs/design/stitch/source', folder);
    await mkdir(target, { recursive: true });
    await copyFile(join(projectRoot, 'docs/design/stitch/source', folder, 'code.html'), join(target, 'code.html'));
  }

  execFileSync('python3', [join(root, 'scripts/stitch/prepare.py')], { cwd: root });
  const output = join(root, 'public/stitch');
  const pages = JSON.parse(execFileSync('python3', ['-c', inspectGeneratedDOM, output], { encoding: 'utf8' })) as Record<string, GeneratedPage>;
  assert.equal((await readdir(output)).filter((path) => path.endsWith('.html')).length, 8);

  for (const [name, page] of Object.entries(pages)) {
    assert.ok(page.roots.html, `${name}: document root exists`);
    assert.ok(page.roots.body, `${name}: document body exists`);
    for (const tag of ['html', 'body'] as const) {
      const style = Object.fromEntries((page.roots[tag].style ?? '').split(';').filter((part) => part.trim()).map((part) => {
        const separator = part.indexOf(':');
        return [part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim().toLowerCase()];
      }));
      assert.ok([undefined, 'auto', '100%', '100vw'].includes(style.width), `${name}: ${tag} must fit a mobile viewport, got width ${style.width}`);
      assert.ok([undefined, 'auto'].includes(style.height), `${name}: ${tag} must grow with report content, got height ${style.height}`);
      const overflow = (style.overflow ?? 'visible').split(/\s+/);
      const verticalOverflow = style['overflow-y'] ?? overflow[1] ?? overflow[0];
      assert.ok(!['hidden', 'clip'].includes(verticalOverflow), `${name}: ${tag} must not clip vertical content`);
    }
    assert.deepEqual(page.scripts, ['app.js'], `${name}: demo interactions remain loaded`);
    assert.ok(page.stylesheets.includes('app.css'), `${name}: responsive demo styles remain loaded`);
  }
  assert.ok(pages['report-confirm'].ids.includes('submit-report-btn'), 'confirmation retains its submit action');
});
