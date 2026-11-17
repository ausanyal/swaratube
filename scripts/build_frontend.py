"""
Builds frontend/dist from frontend/src/*.tsx:
- Uses Vite (`npm run build`) if node_modules/.bin/vite is installed.
- Otherwise packages all frontend/src TypeScript/TSX modules into frontend/dist
  with an ES-module React 18 + Babel TypeScript runtime loader so the exact TSX
  source runs cleanly in any modern browser without requiring global Node/npm.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT / "frontend"
SRC_DIR = FRONTEND_DIR / "src"
DIST_DIR = FRONTEND_DIR / "dist"
ASSETS_DIR = DIST_DIR / "assets"


def build_with_vite_if_available() -> bool:
    vite_bin = FRONTEND_DIR / "node_modules" / ".bin" / "vite"
    if not vite_bin.exists():
        return False
    proc = subprocess.run([str(vite_bin), "build"], cwd=str(FRONTEND_DIR))
    return proc.returncode == 0 and (DIST_DIR / "index.html").exists()


def build_portable_tsx_bundle() -> None:
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    # Copy CSS directly
    styles_src = SRC_DIR / "styles.css"
    shutil.copy2(styles_src, ASSETS_DIR / "styles.css")

    # Collect all .ts and .tsx files relative to /src/...
    modules: dict[str, str] = {}
    for path in sorted(SRC_DIR.rglob("*")):
        if path.is_file() and path.suffix in {".ts", ".tsx"}:
            rel = "/src/" + path.relative_to(SRC_DIR).as_posix()
            modules[rel] = path.read_text(encoding="utf-8")

    sources_js = "window.__SWARATUBE_SOURCES__ = " + json.dumps(modules, indent=2) + ";\n"
    (ASSETS_DIR / "sources.js").write_text(sources_js, encoding="utf-8")

    bootstrap_js = """import React from 'https://esm.sh/react@18.3.1';
import * as ReactDOMClient from 'https://esm.sh/react-dom@18.3.1/client';

function normalizePath(baseDir, relPath) {
  if (!relPath.startsWith('.')) return relPath;
  const stack = baseDir.split('/').filter(Boolean);
  for (const part of relPath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return '/' + stack.join('/');
}

function resolveModuleKey(fromFile, request, sources) {
  const baseDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
  const baseCandidate = normalizePath(baseDir, request);
  const candidates = [
    baseCandidate,
    baseCandidate + '.ts',
    baseCandidate + '.tsx',
    baseCandidate + '/index.ts',
    baseCandidate + '/index.tsx',
  ];
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(sources, c)) return c;
  }
  throw new Error(`Cannot resolve module "${request}" from "${fromFile}"`);
}

function boot() {
  const sources = window.__SWARATUBE_SOURCES__ || {};
  const cache = new Map();

  function evaluate(moduleKey) {
    if (cache.has(moduleKey)) {
      return cache.get(moduleKey).exports;
    }
    const code = sources[moduleKey];
    const mod = { exports: {} };
    cache.set(moduleKey, mod);

    const transformed = window.Babel.transform(code, {
      filename: moduleKey,
      presets: [
        ['typescript', { isTSX: moduleKey.endsWith('.tsx'), allExtensions: true }],
        ['react', { runtime: 'classic' }],
      ],
      plugins: ['transform-modules-commonjs'],
    }).code;

    const localRequire = (specifier) => {
      if (specifier === 'react') return React;
      if (specifier === 'react-dom/client') return ReactDOMClient;
      if (specifier.endsWith('.css')) return {};
      const targetKey = resolveModuleKey(moduleKey, specifier, sources);
      return evaluate(targetKey);
    };

    const fn = new Function('React', 'require', 'module', 'exports', transformed);
    fn(React, localRequire, mod, mod.exports);
    return mod.exports;
  }

  evaluate('/src/main.tsx');
}

boot();
"""
    (ASSETS_DIR / "bootstrap.js").write_text(bootstrap_js, encoding="utf-8")

    index_html = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark light" />
    <title>SwaraTube Studio — Learn Flute &amp; Piano from YouTube</title>
    <link rel="stylesheet" href="/assets/styles.css" />
    <script src="https://unpkg.com/@babel/standalone@7.26.9/babel.min.js"></script>
    <script src="/assets/sources.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/bootstrap.js"></script>
  </body>
</html>
"""
    (DIST_DIR / "index.html").write_text(index_html, encoding="utf-8")
    print(f"Built portable React+TSX bundle with {len(modules)} modules -> {DIST_DIR}")


if __name__ == "__main__":
    if not build_with_vite_if_available():
        build_portable_tsx_bundle()
