import type {ElectronApplication, JSHandle, Page} from 'playwright';
import {_electron as electron} from 'playwright';
import {expect, test} from '@playwright/test';
import type {BrowserWindow} from 'electron';
import {globSync} from 'glob';
import {platform} from 'node:process';

process.env.PLAYWRIGHT_TEST = 'true';

let electronApp: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  let executablePattern = 'dist/*/avatar-shell{,.*}';
  if (platform === 'darwin') {
    executablePattern += '/Contents/*/avatar-shell';
  }

  const [executablePath] = globSync(executablePattern);
  if (!executablePath) {
    throw new Error('App Executable path not found');
  }

  electronApp = await electron.launch({
    executablePath: executablePath,
    // ウィザードを強制表示
    args: ['--no-sandbox', '--playWright=wiz'],
  });

  electronApp.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[electron][${msg.type()}] ${msg.text()}`);
    }
  });

  page = await electronApp.firstWindow();
  await page.waitForLoadState('load');
});

test.afterEach(async () => {
  await electronApp.close();
});

test('Wizard dialog appears and can be completed', async () => {
  // メインウィンドウの可視性を確認（参考: e2e_main）
  const window: JSHandle<BrowserWindow> = await electronApp.browserWindow(page);
  const windowState = await window.evaluate(
    (mainWindow): Promise<{isVisible: boolean; isDevToolsOpened: boolean; isCrashed: boolean; title: string}> => {
      const getState = () => ({
        isVisible: mainWindow.isVisible(),
        isDevToolsOpened: mainWindow.webContents.isDevToolsOpened(),
        isCrashed: mainWindow.webContents.isCrashed(),
        title: mainWindow.webContents.getTitle(),
      });
      return new Promise(resolve => {
        if (mainWindow.isVisible()) {
          resolve(getState());
        } else {
          mainWindow.once('ready-to-show', () => resolve(getState()));
        }
      });
    },
  );
  expect(windowState.isCrashed).toEqual(false);
  expect(windowState.isVisible).toEqual(true);

  // ウィザードダイアログの表示を確認
  const dialog = page.locator('.q-dialog');
  await expect(dialog).toBeVisible();

  // 最下部のボタン行の最後のボタンが「次へ/保存/完了」に相当するのでそれを使う
  const nextBtn = dialog.locator('div.row >> button.q-btn').last();
  const endBtn = dialog.getByTestId('end-wizard').locator('button.q-btn');

  // slide 0 -> 1
  await nextBtn.click();

  // slide 1 -> 2
  await nextBtn.click();

  // slide 2: APIキー未入力でNextするとエラー表示が出る
  await nextBtn.click();
  const errorEl = dialog.locator('.text-red');
  await expect(errorEl).toBeVisible();
  await expect(errorEl).not.toHaveText(''); // 何らかのエラーテキストが入っている

  // // 入力ボックスにダミーキーを入力し、エラーが消えることを確認
  const apiKeyInput = dialog.getByRole('textbox') //.locator('input[type="text"]').first();
  await apiKeyInput.fill('dummy-gemini-api-key');
  await nextBtn.click();
  await expect(errorEl).toBeHidden() //.toHaveText(''); // エラークリア

  // slide 3 -> 4
  await nextBtn.click();

  // slide 4 -> 5
  await nextBtn.click();

  // slide 5 -> 完了（保存とダイアログクローズ）
  await endBtn.click();
  // await nextBtn.click(); nextになるとセーブになりgeminiAPIが動いてしまうのでそれはやめておく
  //
  // // ダイアログが閉じるのを確認
  await expect(dialog).toBeHidden();
});
