import fs from 'node:fs';
import path from 'node:path';
import { readJson, walkFiles } from './utils.mjs';

const LOCKFILE_MAP = [
  ['package-lock.json', 'npm', 'node'],
  ['yarn.lock', 'yarn', 'node'],
  ['pnpm-lock.yaml', 'pnpm', 'node'],
  ['bun.lockb', 'bun', 'node'],
  ['Cargo.lock', 'cargo', 'rust'],
  ['Cargo.toml', 'cargo', 'rust'],
  ['go.sum', 'go', 'go'],
  ['go.mod', 'go', 'go'],
  ['Gemfile.lock', 'bundler', 'ruby'],
  ['Gemfile', 'bundler', 'ruby'],
  ['composer.lock', 'composer', 'php'],
  ['composer.json', 'composer', 'php'],
  ['poetry.lock', 'poetry', 'python'],
  ['Pipfile.lock', 'pipenv', 'python'],
  ['pyproject.toml', 'poetry', 'python'],
  ['requirements.txt', 'pip', 'python'],
  ['Packages.resolved', 'spm', 'swift'],
  ['Package.swift', 'spm', 'swift'],
  ['pubspec.lock', 'pub', 'dart'],
  ['pubspec.yaml', 'pub', 'dart'],
  ['build.sbt', 'sbt', 'scala'],
  ['mix.lock', 'mix', 'elixir'],
  ['mix.exs', 'mix', 'elixir'],
  ['stack.yaml', 'stack', 'haskell'],
  ['build.gradle', 'gradle', 'java'],
  ['build.gradle.kts', 'gradle', 'java'],
  ['pom.xml', 'maven', 'java'],
  ['packages.config', 'nuget', 'csharp'],
];

const EXTENSION_LANGUAGE_MAP = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.sc': 'scala',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.cs': 'csharp',
  '.fs': 'fsharp',
  '.r': 'r',
  '.jl': 'julia',
  '.zig': 'zig',
  '.nim': 'nim',
  '.cr': 'crystal',
  '.dart': 'dart',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.erl': 'erlang',
  '.hrl': 'erlang',
  '.lua': 'lua',
  '.pl': 'perl',
  '.pm': 'perl',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
};

const FRAMEWORK_HEURISTICS = [
  // JavaScript / TypeScript frameworks
  ['next.config', '', 'next'],
  ['vite.config', '', 'vite'],
  ['nuxt.config', '', 'nuxt'],
  ['svelte.config', '', 'svelte'],
  ['astro.config', '', 'astro'],
  ['remix.config', '', 'remix'],
  ['angular.json', '', 'angular'],
  ['nx.json', '', 'nx'],
  ['turbo.json', '', 'turbo'],
  ['.eslintrc', '', 'eslint'],
  ['.prettierrc', '', 'prettier'],

  // Python frameworks
  ['manage.py', '', 'django'],
  ['settings.py', '', 'django'],
  ['app.py', 'flask', 'flask'],
  ['main.py', 'fastapi', 'fastapi'],
  ['main.py', 'fabric', 'fabric'],
  ['alembic.ini', '', 'alembic'],
  ['requirements.txt', 'django', 'django'],
  ['requirements.txt', 'flask', 'flask'],
  ['requirements.txt', 'fastapi', 'fastapi'],

  // Java / JVM frameworks
  ['pom.xml', 'spring', 'spring'],
  ['pom.xml', 'quarkus', 'quarkus'],
  ['pom.xml', 'micronaut', 'micronaut'],
  ['build.gradle', 'spring', 'spring'],
  ['build.gradle.kts', 'spring', 'spring'],

  // Ruby frameworks
  ['config/routes.rb', '', 'rails'],
  ['config/application.rb', '', 'rails'],
  ['app/controllers', '', 'rails'],

  // PHP frameworks
  ['artisan', '', 'laravel'],
  ['vendor/bin/sail', '', 'laravel'],
  ['routes/web.php', '', 'laravel'],

  // Go frameworks
  ['go.mod', 'gin', 'gin'],
  ['go.mod', 'echo', 'echo'],
  ['go.mod', 'fiber', 'fiber'],
  ['go.mod', 'chi', 'chi'],

  // Rust frameworks
  ['Cargo.toml', 'axum', 'axum'],
  ['Cargo.toml', 'actix', 'actix-web'],
  ['Cargo.toml', 'rocket', 'rocket'],
  ['Cargo.toml', 'tokio', 'tokio'],

  // C# / .NET
  ['.csproj', 'Microsoft.AspNetCore', 'aspnet'],
  ['Program.cs', 'WebApplication', 'aspnet'],
  ['Startup.cs', '', 'aspnet'],
  ['appsettings.json', '', 'dotnet'],

  // Elixir / Phoenix
  ['mix.exs', 'phoenix', 'phoenix'],
  ['lib/', 'phoenix', 'phoenix'],

  // Mobile
  ['pubspec.yaml', 'flutter', 'flutter'],
  ['build.gradle', 'kotlin', 'android'],
  ['build.gradle.kts', 'kotlin', 'android'],
  ['AndroidManifest.xml', '', 'android'],
  ['Info.plist', '', 'ios'],
  ['Podfile', '', 'ios'],
  ['project.pbxproj', '', 'ios'],

  // Infrastructure
  ['Dockerfile', '', 'docker'],
  ['docker-compose.yml', '', 'docker'],
  ['docker-compose.yaml', '', 'docker'],
  ['.github/workflows', '', 'github-actions'],
  ['Jenkinsfile', '', 'jenkins'],
  ['.gitlab-ci.yml', '', 'gitlab-ci'],
  ['k8s/', '', 'kubernetes'],
  ['helm/', '', 'helm'],
  ['Tiltfile', '', 'tilt'],
  ['skaffold.yaml', '', 'skaffold'],
  ['serverless.yml', '', 'serverless'],
  ['terraform/', '', 'terraform'],
  ['.terraform/', '', 'terraform'],

  // Database
  ['schema.prisma', '', 'prisma'],
  ['migrations/', '', 'database'],
  ['seed.ts', '', 'database'],
  ['seed.py', '', 'database'],

  // AI / LLM
  ['prompts/', '', 'ai'],
  ['agents/', '', 'ai'],
  ['mcp/', '', 'ai'],
  ['.cursor/skills', '', 'cursor'],
];

function checkLockfiles(target, stacks, packageManagers) {
  for (const [file, manager, language] of LOCKFILE_MAP) {
    if (fs.existsSync(path.join(target, file))) {
      if (manager) packageManagers.add(manager);
      if (language) stacks.add(language);
    }
  }
}

function readPackageSignals(target, stacks, packageManagers) {
  const packagePath = path.join(target, 'package.json');
  if (!fs.existsSync(packagePath)) return;

  packageManagers.add('npm');
  for (const [file, manager] of [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ]) {
    if (fs.existsSync(path.join(target, file))) packageManagers.add(manager);
  }

  let pkg = {};
  try {
    pkg = readJson(packagePath);
  } catch {
    return;
  }

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  };
  const depNames = new Set(Object.keys(deps));

  stacks.add('node');
  if (depNames.has('typescript')) stacks.add('typescript');
  if (depNames.has('react')) stacks.add('react');
  if (depNames.has('next')) stacks.add('next');
  if (depNames.has('nuxt')) stacks.add('nuxt');
  if (depNames.has('vite')) stacks.add('vite');
  if (depNames.has('vue')) stacks.add('vue');
  if (depNames.has('svelte')) stacks.add('svelte');
  if (depNames.has('astro')) stacks.add('astro');
  if (depNames.has('express') || depNames.has('@nestjs/core') || depNames.has('fastify')) stacks.add('backend');
  if (depNames.has('framer-motion')) {
    stacks.add('frontend');
    stacks.add('framer-motion');
  }
  if (depNames.has('three') || depNames.has('@react-three/fiber') || depNames.has('@react-three/drei')) {
    stacks.add('three');
    stacks.add('threejs');
    stacks.add('frontend');
  }
  if (depNames.has('tailwindcss')) stacks.add('tailwind');
  if (depNames.has('openai') || depNames.has('@modelcontextprotocol/sdk')) {
    stacks.add('ai');
    stacks.add('llm');
  }
  if (
    depNames.has('prisma') ||
    depNames.has('@prisma/client') ||
    depNames.has('mongoose') ||
    depNames.has('typeorm') ||
    depNames.has('drizzle-orm')
  )
    stacks.add('database');
  if (depNames.has('@21st-dev') || depNames.has('@21st') || depNames.has('21st')) stacks.add('21st-dev');
  if (depNames.has('electron') || depNames.has('electron-builder')) stacks.add('electron');
  if (depNames.has('react-native') || depNames.has('expo')) stacks.add('mobile');
  if (depNames.has('jest') || depNames.has('vitest') || depNames.has('mocha')) stacks.add('testing');
  if (depNames.has('cypress') || depNames.has('playwright')) stacks.add('e2e');
  if (depNames.has('graphql') || depNames.has('apollo') || depNames.has('@apollo')) stacks.add('graphql');
  if (depNames.has('prisma') || depNames.has('drizzle-orm')) stacks.add('orm');
}

function checkExtensions(files, stacks) {
  for (const file of files) {
    const ext = '.' + file.split('.').pop()?.toLowerCase();
    const lang = EXTENSION_LANGUAGE_MAP[ext];
    if (lang) stacks.add(lang);
  }
}

function checkFrameworks(target, files, stacks) {
  for (const [trigger, keyword, label] of FRAMEWORK_HEURISTICS) {
    const lowerFiles = files.map((f) => f.toLowerCase());
    const triggerLower = trigger.toLowerCase();
    const triggerWithSlash = triggerLower.endsWith('/') ? triggerLower : triggerLower + '/';
    const hasTrigger = lowerFiles.some((f) => f === triggerLower || f.startsWith(triggerWithSlash));
    if (!hasTrigger) continue;
    if (keyword) {
      try {
        const match = lowerFiles.find((f) => f.includes(trigger.toLowerCase()));
        if (match) {
          const fullPath = path.join(target, match);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
            if (!content.includes(keyword.toLowerCase())) continue;
          }
        }
      } catch {
        continue;
      }
    }
    stacks.add(label);
  }
}

function inferCategories(stacks) {
  const CATEGORY_MAP = {
    backend: [
      'node',
      'python',
      'java',
      'rust',
      'go',
      'ruby',
      'php',
      'csharp',
      'elixir',
      'scala',
      'kotlin',
      'spring',
      'rails',
      'django',
      'laravel',
      'express',
      'fastapi',
      'flask',
      'aspnet',
      'actix-web',
      'gin',
      'echo',
      'fiber',
      'axum',
      'phoenix',
      'graphql',
    ],
    frontend: [
      'react',
      'vue',
      'svelte',
      'angular',
      'astro',
      'next',
      'nuxt',
      'remix',
      'vite',
      'tailwind',
      'framer-motion',
      'threejs',
    ],
    mobile: ['flutter', 'android', 'ios', 'react-native', 'expo'],
    ai: ['ai', 'llm', 'openai', 'langchain', 'cursor'],
    devops: ['docker', 'kubernetes', 'helm', 'terraform', 'ci', 'github-actions', 'gitlab-ci', 'jenkins', 'serverless'],
    testing: ['testing', 'e2e', 'jest', 'vitest', 'cypress', 'playwright'],
    database: ['database', 'prisma', 'orm', 'mongodb', 'postgresql'],
  };

  for (const [category, indicators] of Object.entries(CATEGORY_MAP)) {
    if (indicators.some((ind) => stacks.has(ind))) {
      stacks.add(category);
    }
  }
}

export function detectProject(target) {
  const absoluteTarget = path.resolve(target);
  const files = walkFiles(absoluteTarget);
  const stacks = new Set();
  const packageManagers = new Set();

  // Phase 1: Lockfile-based detection (fastest, most reliable)
  checkLockfiles(absoluteTarget, stacks, packageManagers);

  // Phase 2: package.json dependency analysis (for JS/TS ecosystems)
  readPackageSignals(absoluteTarget, stacks, packageManagers);

  // Phase 3: File extension detection
  checkExtensions(files, stacks);

  // Phase 4: Framework heuristics (convention-based)
  checkFrameworks(absoluteTarget, files, stacks);

  // Phase 4b: Common aliases
  if (stacks.has('github-actions') || stacks.has('gitlab-ci') || stacks.has('jenkins')) stacks.add('ci');
  if (stacks.has('ai') || stacks.has('cursor')) stacks.add('llm');
  if (stacks.has('github-actions')) stacks.add('ci');
  if (stacks.has('next') || stacks.has('vite') || stacks.has('astro') || stacks.has('remix')) stacks.add('frontend');

  // Phase 5: Infer high-level categories
  inferCategories(stacks);

  // Phase 6: Self-learning patterns store
  const patternsPath = path.join(absoluteTarget, '.nokta', 'detection-patterns.json');
  try {
    const custom = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
    if (custom.stacks) custom.stacks.forEach((s) => stacks.add(s));
  } catch {}

  return {
    target: absoluteTarget,
    files,
    stacks: Array.from(stacks).sort(),
    packageManagers: Array.from(packageManagers).sort(),
  };
}
