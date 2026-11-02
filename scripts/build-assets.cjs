'use strict';
// Source CSS/JS is retained. Only generated, content-addressed copies are served.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const CleanCSS = require('clean-css');
const terser = require('terser');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public/build');
async function build() {
  fs.mkdirSync(out, { recursive: true });
  const manifest = {};
  const save = (source, body) => {
    const ext = path.extname(source);
    const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
    const file = path.basename(source, ext) + '.' + hash + ext;
    fs.writeFileSync(path.join(out, file), body);
    manifest[source] = '/build/' + file;
  };
  const tailwind = execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'),
    '-c', 'tailwind.config.cjs', '-i', 'assets/tailwind.css', '--minify'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  save('/css/tailwind.css', tailwind);
  for (const kind of ['css', 'js']) {
    for (const file of fs.readdirSync(path.join(root, 'public', kind)).sort()) {
      if (!file.endsWith('.' + kind)) continue;
      const source = fs.readFileSync(path.join(root, 'public', kind, file), 'utf8');
      let body;
      if (kind === 'css') {
        // Level 0 removes whitespace/comments without restructuring rules/keyframes.
        const result = new CleanCSS({ level: 0, rebase: false }).minify(source);
        if (result.errors.length) throw new Error(result.errors.join('\n'));
        body = result.styles;
      } else {
        // No compression or renaming: preserve animation code and runtime semantics.
        body = (await terser.minify(source, { compress: false, mangle: false, format: { comments: false } })).code;
      }
      save('/' + kind + '/' + file, body);
    }
  }
  fs.writeFileSync(path.join(root, 'config/asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built ${Object.keys(manifest).length} local, versioned assets.`);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
