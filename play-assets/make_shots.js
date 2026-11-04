const { chromium } = require('C:/Users/hp/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = 'C:/Users/hp/Documents/JOB/MarocJobs-APK/play-assets/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const shot = async (page, name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('saved', name);
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/hp/AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe' });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, locale: 'fr-FR', colorScheme: 'light', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.locator('input[type=email]').fill('demo@assouli.app');
  await page.getByRole('button', { name: /Recevoir le code/i }).click();
  await page.waitForTimeout(700);
  await page.locator('input[inputmode=numeric]').fill('246810');
  await page.getByRole('button', { name: /Vérifier et entrer/i }).click();
  await page.waitForTimeout(3200);

  await shot(page, '01-accueil.png');

  await page.getByRole('button', { name: /JOBS CDI/ }).click();
  await page.waitForTimeout(1800);
  await shot(page, '02-offres-emploi.png');

  await page.locator('.poster-nav button', { hasText: 'Recherche' }).click();
  await page.waitForTimeout(1200);
  await shot(page, '03-recherche.png');

  await page.locator('.poster-nav button', { hasText: 'Accueil' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /MARCHÉS PUBLICS/ }).click();
  await page.waitForTimeout(2200);
  await shot(page, '04-marches-publics.png');

  await page.locator('.poster-nav button', { hasText: 'Accueil' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Configuration$/ }).first().click();
  await page.waitForTimeout(1200);
  await shot(page, '05-configuration.png');

  await page.mouse.move(206, 600);
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(900);
  await shot(page, '06-compte-confidentialite.png');

  await page.getByRole('button', { name: /Supprimer le compte/ }).click();
  await page.waitForTimeout(600);
  await shot(page, '07-confirmation-suppression.png');
  await page.getByRole('button', { name: /^Annuler$/ }).click();
  await page.waitForTimeout(400);

  await browser.close();
})();
