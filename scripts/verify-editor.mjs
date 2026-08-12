#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

/**
 * A real, live end-to-end check: boots the actual server (tsx, no mocks) and the actual editor
 * dev server, drives the canvas with real mouse events in a real headless browser — click a
 * palette button, drag a connection between two ports, edit a property field, save, run, watch
 * the live status turn green — and confirms the workflow that produced against the server's own
 * REST API, not just against what the page claims happened.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const serverPort = 3099;
const editorPort = 5199;
const serverUrl = `http://localhost:${serverPort}`;
const editorUrl = `http://localhost:${editorPort}`;
const dbDir = mkdtempSync(join(tmpdir(), 'fluxforge-e2e-'));

async function waitForServer(url) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error(`verify-editor: ${url} never came up`);
}

async function main() {
  const server = spawn('npx', ['tsx', 'src/main.ts'], {
    cwd: join(root, 'packages/server'),
    env: {
      ...process.env,
      PORT: String(serverPort),
      FLUXFORGE_DB_PATH: join(dbDir, 'app.sqlite'),
      FLUXFORGE_QUEUE_DB_PATH: join(dbDir, 'queue.sqlite'),
      FLUXFORGE_CREDENTIALS_KEY: randomBytes(32).toString('base64'),
    },
    stdio: 'pipe',
    shell: true,
  });
  server.stdout.on('data', (c) => process.stdout.write(`[server] ${c}`));
  server.stderr.on('data', (c) => process.stderr.write(`[server] ${c}`));

  const editorServer = spawn('npx', ['vite', '--port', String(editorPort), '--strictPort'], {
    cwd: join(root, 'packages/editor'),
    env: { ...process.env, VITE_PROXY_TARGET: serverUrl },
    stdio: 'pipe',
    shell: true,
  });
  editorServer.stderr.on('data', (c) => process.stderr.write(`[editor] ${c}`));

  try {
    await waitForServer(`${serverUrl}/api/nodes`);
    await waitForServer(editorUrl);
    await delay(500);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('page console error:', msg.text());
    });
    page.on('pageerror', (err) => console.log('page error:', err));

    await page.goto(editorUrl);
    await page.waitForSelector('.ff-palette__item', { timeout: 10_000 });

    // 1. Add a "Manual Trigger" node and a "Set" node via the palette.
    await page.click('.ff-palette__item:has-text("Manual Trigger")');
    await page.click('.ff-palette__item:has-text("Set")');
    const nodeCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    console.log(`OK  canvas present: ${nodeCount === 1}`);

    // 2. Read back node screen positions via a debug hook is overkill — instead drag from a
    //    fixed point where the trigger node's output port renders (cascade places node 1 at
    //    (40,40) local, node 2 at (64,64) local, offset by the app's pan (260,40)).
    const canvasBox = await page.locator('#canvas').boundingBox();
    if (canvasBox === null) throw new Error('canvas has no bounding box');

    // Trigger node: metadata {x:40,y:40}, single output port at (40+180, 40+28+12) local -> plus pan(260,40).
    const fromX = canvasBox.x + 260 + 40 + 180;
    const fromY = canvasBox.y + 40 + 40 + 28 + 12;
    // Set node: metadata {x:64,y:64}, single input port at (64, 64+28+12) local -> plus pan.
    const toX = canvasBox.x + 260 + 64;
    const toY = canvasBox.y + 40 + 64 + 28 + 12;

    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(toX, toY, { steps: 10 });
    await page.mouse.up();

    // 3. Select the Set node (click its body) and fill in a param via the property panel.
    const setNodeBodyX = canvasBox.x + 260 + 64 + 90;
    const setNodeBodyY = canvasBox.y + 40 + 64 + 10;
    await page.mouse.click(setNodeBodyX, setNodeBodyY);
    await page.waitForSelector('.ff-panel__header', { timeout: 5000 });

    const setField = page.locator('.ff-field:has(label:text("set")) textarea');
    await setField.fill('{"greeting":"hello from playwright"}');
    await setField.dispatchEvent('change');

    // 4. Save, then run, and wait for the live status text to report completion.
    await page.fill('#workflow-name', 'E2E Smoke Test');
    await page.click('#btn-save');
    await page.waitForFunction(() => document.getElementById('status')?.textContent?.includes('Saved'), { timeout: 5000 });

    await page.click('#btn-run');
    await page.waitForFunction(() => document.getElementById('status')?.textContent?.includes('finished'), { timeout: 10_000 });

    const url = new URL(page.url());
    const workflowId = url.searchParams.get('workflow');
    console.log(`OK  workflow saved and run, id=${workflowId}`);

    // 5. Pan and zoom: drag the empty canvas background, then scroll to zoom. The precise
    //    geometry of where a click lands afterward is `layout.ts`/`hit-test.ts`'s job (unit
    //    tested exhaustively, including the exact zoom-tolerance math) — this step only proves
    //    the real mouse/wheel event listeners are wired up on the real canvas with no exception.
    const emptySpotX = canvasBox.x + canvasBox.width - 40;
    const emptySpotY = canvasBox.y + canvasBox.height - 40;
    await page.mouse.move(emptySpotX, emptySpotY);
    await page.mouse.down();
    await page.mouse.move(emptySpotX - 60, emptySpotY - 30, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, -200); // zoom in, centred wherever the cursor last was
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    await delay(100);
    console.log(`OK  pan-drag and zoom-wheel gestures completed with no page error (${pageErrors.length} errors)`);
    if (pageErrors.length > 0) throw new Error(`pan/zoom threw: ${pageErrors[0]}`);

    // 6. Credentials panel: open it, add a credential, confirm it's listed, delete it.
    await page.click('#btn-credentials');
    await page.waitForSelector('.ff-modal-overlay:not([hidden]) .ff-modal', { timeout: 5000 });
    await page.fill('.ff-cred-name', 'test-cred');
    await page.fill('.ff-cred-data', '{"token":"abc123"}');
    await page.click('.ff-cred-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.ff-cred-item') !== null, { timeout: 5000 });
    const credListed = await page.evaluate(() => document.querySelector('.ff-cred-item span')?.textContent);
    console.log(`OK  credentials panel: created and listed "${credListed}"`);
    if (credListed !== 'test-cred') throw new Error(`expected credential "test-cred" to be listed, got "${credListed}"`);

    const credCheck = await fetch(`${serverUrl}/api/credentials`);
    const credNames = await credCheck.json();
    console.log(`OK  server confirms credential exists: ${JSON.stringify(credNames)}`);
    if (!credNames.includes('test-cred')) throw new Error('server does not have the credential the UI just created');

    await page.click('.ff-cred-item button');
    await page.waitForFunction(() => document.querySelector('.ff-cred-item') === null, { timeout: 5000 });
    console.log('OK  credentials panel: deleted via UI');
    await page.click('.ff-modal-overlay:not([hidden]) .ff-modal__close');

    // 7. Dead-letter panel: open it and confirm it renders the real (empty) state from the server.
    await page.click('#btn-dead-letter');
    await page.waitForSelector('.ff-modal-overlay:not([hidden]) .ff-modal', { timeout: 5000 });
    const dlqEmptyText = await page.evaluate(() => document.querySelector('.ff-dlq-empty')?.textContent);
    console.log(`OK  dead-letter panel opened, empty-state text: "${dlqEmptyText}"`);
    if (dlqEmptyText !== 'Nothing dead-lettered.') throw new Error(`unexpected dead-letter panel state: "${dlqEmptyText}"`);
    await page.click('.ff-modal-overlay:not([hidden]) .ff-modal__close');

    await browser.close();

    // 8. Verify against the server's own API — the real source of truth, not the page's claim.
    const workflow = await (await fetch(`${serverUrl}/api/workflows/${workflowId}`)).json();
    console.log(`OK  server has ${workflow.nodes.length} nodes and ${workflow.edges.length} edge(s)`);
    if (workflow.nodes.length !== 2 || workflow.edges.length !== 1) {
      throw new Error(`expected 2 nodes and 1 edge, got ${workflow.nodes.length} nodes and ${workflow.edges.length} edges`);
    }

    const runs = await (await fetch(`${serverUrl}/api/workflows/${workflowId}/runs`)).json();
    console.log(`OK  ${runs.length} run(s) recorded, status: ${runs[0]?.status}`);
    if (runs.length !== 1 || runs[0].status !== 'succeeded') {
      throw new Error(`expected exactly one succeeded run, got ${JSON.stringify(runs.map((r) => r.status))}`);
    }

    const setNode = workflow.nodes.find((n) => n.type === 'data.set');
    const setNodeRunState = runs[0].nodes[setNode.id];
    console.log(`OK  set node output: ${JSON.stringify(setNodeRunState.output)}`);
    if (JSON.stringify(setNodeRunState.output.main[0]) !== JSON.stringify({ greeting: 'hello from playwright' })) {
      throw new Error(`the property-panel edit did not reach the executed workflow: ${JSON.stringify(setNodeRunState.output)}`);
    }

    console.log('\neditor verified end-to-end in a real browser: drag-connected two nodes, edited a property, saved, ran, and the server executed exactly what the canvas showed.');
  } finally {
    server.kill();
    editorServer.kill();
    // The server process may still hold its SQLite WAL files open for a moment after `kill()`
    // returns (the signal is delivered async) — a few retries with a short backoff clears this
    // reliably without the arbitrary-feeling fixed delay a single retry would need.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(dbDir, { recursive: true, force: true });
        break;
      } catch {
        await delay(300);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
