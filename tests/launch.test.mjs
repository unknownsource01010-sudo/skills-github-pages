import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 18888;
const BASE = `http://127.0.0.1:${PORT}`;

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`server did not become ready; output: ${output}`));
    }, 10_000);

    const onData = chunk => {
      output += chunk.toString();
      if (output.includes('Venture Systems listening on')) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve(child);
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`server exited before ready (${code}); output: ${output}`));
    });
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3_000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('launch-critical Venture flows work end to end', async () => {
  const server = await startServer();
  try {
    const health = await fetch(`${BASE}/health`);
    assert.equal(health.status, 200);
    const healthJson = await health.json();
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.service, 'venture-systems');

    const home = await fetch(`${BASE}/`);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Venture Systems/i);
    assert.match(html, /studioForm/);

    const blueprint = await fetch(`${BASE}/api/blueprint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        business: 'Launch Test Services',
        industry: 'Home services',
        goal: 'Test estimates and customer operations.',
        modules: ['crm', 'estimates', 'invoices']
      })
    });
    assert.equal(blueprint.status, 200);
    const bp = await blueprint.json();
    assert.equal(bp.business, 'Launch Test Services');
    assert.equal(bp.modules.length, 3);

    const build = await fetch(`${BASE}/api/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        business: 'Launch Test Services',
        industry: 'Home services',
        goal: 'Test estimates and customer operations.',
        modules: ['crm', 'estimates', 'invoices']
      })
    });
    assert.equal(build.status, 200);
    assert.match(build.headers.get('content-disposition') || '', /\.zip/i);
    const zip = new Uint8Array(await build.arrayBuffer());
    assert.ok(zip.byteLength > 1000, 'generated ZIP should contain a real starter app');
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);

    const robots = await fetch(`${BASE}/robots.txt`);
    assert.equal(robots.status, 200);
  } finally {
    await stopServer(server);
  }
});
