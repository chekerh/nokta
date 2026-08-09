import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectProject } from '../compiler/lib/detect.mjs';

function makeFixture(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nokta-detect-${name}-`));
}

function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

test('detectProject detects Node.js project', () => {
  const root = makeFixture('node');
  writeFile(root, 'package.json', JSON.stringify({}));
  writeFile(root, 'index.js', 'console.log("hello");\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('node'));
  assert.ok(detected.packageManagers.includes('npm'));
});

test('detectProject detects Python project', () => {
  const root = makeFixture('python');
  writeFile(root, 'requirements.txt', 'flask\n');
  writeFile(root, 'app.py', 'print("hello")\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('python'));
});

test('detectProject detects Java Spring project', () => {
  const root = makeFixture('spring');
  writeFile(root, 'pom.xml', '<project><parent><groupId>org.springframework.boot</groupId></parent></project>');
  writeFile(root, 'src/main/java/App.java', 'class App {}\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('java'));
  assert.ok(detected.stacks.includes('spring'));
  assert.ok(detected.stacks.includes('backend'));
});

test('detectProject detects Flutter project', () => {
  const root = makeFixture('flutter');
  writeFile(root, 'pubspec.yaml', 'name: test\nflutter:\n');
  writeFile(root, 'lib/main.dart', 'void main() {}\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('dart'));
  assert.ok(detected.stacks.includes('flutter'));
  assert.ok(detected.stacks.includes('mobile'));
});

test('detectProject detects Docker', () => {
  const root = makeFixture('docker');
  writeFile(root, 'Dockerfile', 'FROM node:20\n');
  writeFile(root, 'package.json', JSON.stringify({}));
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('docker'));
});

test('detectProject detects CI workflows', () => {
  const root = makeFixture('ci');
  writeFile(root, '.github/workflows/test.yml', 'name: CI\n');
  writeFile(root, 'package.json', JSON.stringify({}));
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('ci'));
});

test('detectProject detects Kubernetes', () => {
  const root = makeFixture('k8s');
  writeFile(root, 'k8s/deployment.yaml', 'apiVersion: apps/v1\n');
  writeFile(root, 'package.json', JSON.stringify({}));
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('kubernetes'));
});

test('detectProject detects database stacks', () => {
  const root = makeFixture('db');
  writeFile(root, 'schema.prisma', 'model User { id Int }\n');
  writeFile(root, 'package.json', JSON.stringify({}));
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('database'));
});

test('detectProject detects AI/LLM stacks', () => {
  const root = makeFixture('ai');
  writeFile(root, 'prompts/hello.txt', 'Hello\n');
  writeFile(root, 'package.json', JSON.stringify({}));
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('ai'));
  assert.ok(detected.stacks.includes('llm'));
});

test('detectProject handles empty project', () => {
  const root = makeFixture('empty');
  const detected = detectProject(root);
  assert.ok(Array.isArray(detected.stacks));
  assert.ok(Array.isArray(detected.files));
  assert.ok(Array.isArray(detected.packageManagers));
});

test('detectProject handles pnpm lockfile', () => {
  const root = makeFixture('pnpm');
  writeFile(root, 'package.json', JSON.stringify({}));
  writeFile(root, 'pnpm-lock.yaml', 'lockfileVersion: 5.4\n');
  const detected = detectProject(root);
  assert.ok(detected.packageManagers.includes('pnpm'));
});

test('detectProject detects Rust project', () => {
  const root = makeFixture('rust');
  writeFile(root, 'Cargo.toml', '[package]\nname = "test"\n');
  writeFile(root, 'src/main.rs', 'fn main() {}\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('rust'));
});

test('detectProject detects Go project', () => {
  const root = makeFixture('go');
  writeFile(root, 'go.mod', 'module test\n');
  writeFile(root, 'main.go', 'package main\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('go'));
});

test('detectProject detects Ruby project', () => {
  const root = makeFixture('ruby');
  writeFile(root, 'Gemfile', 'source "https://rubygems.org"\n');
  writeFile(root, 'app.rb', 'puts "hello"\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('ruby'));
});

test('detectProject detects PHP project', () => {
  const root = makeFixture('php');
  writeFile(root, 'composer.json', '{"name":"test"}\n');
  writeFile(root, 'index.php', '<?php\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('php'));
});

test('detectProject detects C# project', () => {
  const root = makeFixture('csharp');
  writeFile(root, 'app.cs', 'class App {}\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('csharp'));
});

test('detectProject detects Swift project', () => {
  const root = makeFixture('swift');
  writeFile(root, 'Package.swift', '// swift-tools-version:5.5\n');
  writeFile(root, 'main.swift', 'print("hello")\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('swift'));
});

test('detectProject detects Kotlin project', () => {
  const root = makeFixture('kotlin');
  writeFile(root, 'App.kt', 'fun main() {}\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('kotlin'));
});

test('detectProject detects Elixir project', () => {
  const root = makeFixture('elixir');
  writeFile(root, 'mix.exs', 'defmodule Test.Mix do\nend\n');
  writeFile(root, 'lib/app.ex', 'defmodule App do\nend\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('elixir'));
});

test('detectProject detects Haskell project', () => {
  const root = makeFixture('haskell');
  writeFile(root, 'Main.hs', 'main = putStrLn "hello"\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('haskell'));
});

test('detectProject detects C/C++ project', () => {
  const root = makeFixture('cpp');
  writeFile(root, 'main.cpp', '#include <iostream>\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('cpp'));
});

test('detectProject detects Svelte project', () => {
  const root = makeFixture('svelte');
  writeFile(root, 'package.json', JSON.stringify({ dependencies: { svelte: '3.x' } }));
  writeFile(root, 'App.svelte', '<h1>Hello</h1>\n');
  const detected = detectProject(root);
  assert.ok(detected.stacks.includes('svelte'));
});
