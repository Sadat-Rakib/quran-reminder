'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');

const mcp = require('../src/mcp/server');
const { CLI, makeEnv } = require('./helpers');

test('initialize reports the server identity', () => {
  const response = mcp.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(response.id, 1);
  assert.equal(response.result.serverInfo.name, 'quran-reminder');
  assert.ok(response.result.capabilities.tools);
});

test('tools/list exposes both tools with valid schemas', () => {
  const response = mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = response.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ['quran_ayah', 'quran_themes']);
  for (const tool of response.result.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description.length > 20);
  }
});

test('quran_ayah returns markdown with a reference and link', () => {
  const response = mcp.handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'quran_ayah', arguments: { theme: 'sabr' } },
  });
  const text = response.result.content[0].text;
  assert.match(text, /quran\.com\/\d+\/\d+/);
  assert.match(text, /— \*\*/);
});

test('quran_themes lists all five themes', () => {
  const response = mcp.handle({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'quran_themes', arguments: {} },
  });
  const text = response.result.content[0].text;
  for (const theme of ['ilm', 'tawakkul', 'shukr', 'ihsan', 'sabr']) {
    assert.match(text, new RegExp(theme));
  }
});

test('unknown methods and tools return JSON-RPC errors', () => {
  const method = mcp.handle({ jsonrpc: '2.0', id: 5, method: 'nope' });
  assert.equal(method.error.code, -32601);

  const tool = mcp.handle({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'nope', arguments: {} },
  });
  assert.equal(tool.error.code, -32602);
});

test('notifications produce no response', () => {
  assert.equal(mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('the stdio server answers a real handshake', async () => {
  const { env } = makeEnv();
  const child = spawn(process.execPath, [CLI, 'mcp'], { env, stdio: ['pipe', 'pipe', 'pipe'] });

  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ];

  const output = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('MCP server did not respond in time'));
    }, 15000);

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.split('\n').filter(Boolean).length >= 2) {
        clearTimeout(timer);
        child.kill();
        resolve(buffer);
      }
    });
    child.on('error', reject);
    child.stdin.write(messages.map((message) => JSON.stringify(message)).join('\n') + '\n');
  });

  const responses = output
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(responses[0].result.serverInfo.name, 'quran-reminder');
  assert.equal(responses[1].result.tools.length, 2);
});
