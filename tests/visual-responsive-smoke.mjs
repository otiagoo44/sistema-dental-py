import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const entry = process.env.PUPPETEER_ENTRY;
const executablePath = process.env.CHROME_EXECUTABLE;
const baseUrl = process.env.VISUAL_QA_BASE_URL || 'http://127.0.0.1:4174';
const outputDir = process.env.VISUAL_QA_OUTPUT;

if (!entry || !executablePath) {
  throw new Error('Set PUPPETEER_ENTRY and CHROME_EXECUTABLE before running visual QA.');
}

const { default: puppeteer } = await import(pathToFileURL(entry).href);
if (outputDir) await mkdir(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--disable-gpu', '--no-first-run', '--disable-extensions'],
});

const cases = [
  { name: 'home-320', path: '/?page=home', width: 320, height: 1000 },
  { name: 'patients-375', path: '/?page=patients', width: 375, height: 1000 },
  { name: 'pending-320', path: '/?page=pending', width: 320, height: 1000 },
  { name: 'pending-1024', path: '/?page=pending', width: 1024, height: 1000 },
  { name: 'agenda-320', path: '/?page=agenda', width: 320, height: 1000 },
  { name: 'agenda-768', path: '/?page=agenda', width: 768, height: 1000 },
  { name: 'owner-375', path: '/?page=owner', width: 375, height: 1000 },
  { name: 'owner-1024', path: '/?page=owner', width: 1024, height: 1000 },
  { name: 'owner-1440', path: '/?page=owner', width: 1440, height: 1000 },
  { name: 'analysis-375', path: '/?page=analysis', width: 375, height: 1000 },
  { name: 'analysis-1440', path: '/?page=analysis', width: 1440, height: 1000 },
];

try {
  for (const testCase of cases) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewport({ width: testCase.width, height: testCase.height, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}${testCase.path}`, { waitUntil: 'networkidle0' });
    const audit = await page.evaluate(() => {
      const root = document.documentElement;
      const important = [...document.querySelectorAll('button, a')]
        .filter((element) => /WhatsApp|Registrar resultado|Confirmar|Asistió|No asistió|Reprogramar|Nueva consulta|Actualizar|Ver pacientes/i.test(element.textContent || ''))
        .map((element) => ({ text: element.textContent.trim(), height: Math.round(element.getBoundingClientRect().height) }));
      return {
        viewport: window.innerWidth,
        documentWidth: root.scrollWidth,
        important,
      };
    });
    assert.equal(errors.length, 0, `${testCase.name} has console errors: ${errors.join(' | ')}`);
    assert.ok(audit.documentWidth <= audit.viewport + 1, `${testCase.name} overflows horizontally (${audit.documentWidth} > ${audit.viewport})`);
    assert.ok(audit.important.every((item) => item.height >= 44), `${testCase.name} has a primary target below 44px: ${JSON.stringify(audit.important)}`);
    if (outputDir) await page.screenshot({ path: `${outputDir}/${testCase.name}.png`, fullPage: false });
    console.log(`PASS ${testCase.name} viewport=${audit.viewport} document=${audit.documentWidth}`);
    await page.close();
  }

  for (const kind of ['contact', 'quote', 'appointment', 'lead']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width: 375, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/?page=modal&modal=${kind}`, { waitUntil: 'networkidle0' });
    await page.click('#qa-modal-opener');
    await page.waitForSelector('[role="dialog"]');
    assert.equal(errors.length, 0, `${kind} modal has runtime errors: ${errors.join(' | ')}`);
    assert.equal((await page.$$('[role="dialog"]')).length, 1, `${kind} modal did not open`);
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true, `${kind} modal did not receive initial focus`);
    const validationButton = {
      contact: 'Rechazó el presupuesto',
      quote: 'Guardar presupuesto',
      appointment: 'Agendar cita',
      lead: 'Guardar consulta',
    }[kind];
    if (kind === 'quote') {
      await page.select('select', '');
    }
    if (kind === 'appointment') {
      await page.$eval('input[type="date"]', (input) => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    const hasValidationButton = await page.$$eval('button', (buttons, label) => {
      const target = buttons.find((button) => button.textContent?.includes(label));
      return Boolean(target);
    }, validationButton);
    assert.equal(hasValidationButton, true, `Validation button not found: ${validationButton}`);
    if (kind === 'contact') {
      await page.$$eval('button', (buttons, label) => buttons.find((button) => button.textContent?.includes(label))?.click(), validationButton);
    } else if (kind !== 'quote') {
      await page.$eval('[role="dialog"]', (form) => form.requestSubmit());
    }
    if (kind !== 'quote') {
      const alertSelector = '[role="alert"], [aria-live="assertive"]';
      await page.waitForSelector(alertSelector, { timeout: 5000 });
      const alertText = await page.$eval(alertSelector, (element) => element.textContent || '');
      assert.ok(alertText.trim().length > 0 && !/PGRST|RPC|SQLSTATE/i.test(alertText), `${kind} modal exposed a technical validation error`);
    }
    for (let index = 0; index < 20; index += 1) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true, `${kind} modal let focus escape`);
    await page.keyboard.press('Escape');
    assert.equal((await page.$$('[role="dialog"]')).length, 0, `${kind} modal did not close with Escape`);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'qa-modal-opener', `${kind} modal did not return focus`);
    console.log(`PASS modal-${kind} focus-trap escape return-focus`);
    await page.close();
  }

  const savingPage = await browser.newPage();
  await savingPage.setViewport({ width: 375, height: 900, deviceScaleFactor: 1 });
  await savingPage.goto(`${baseUrl}/?page=modal&modal=quote&saving=1`, { waitUntil: 'networkidle0' });
  await savingPage.click('#qa-modal-opener');
  await savingPage.waitForSelector('[role="dialog"]');
  await savingPage.keyboard.press('Escape');
  assert.equal((await savingPage.$$('[role="dialog"]')).length, 1, 'Saving modal closed with Escape');
  console.log('PASS modal-saving blocks Escape');
  await savingPage.close();
} finally {
  await browser.close();
}

console.log('PASS responsive pages and modal accessibility');
