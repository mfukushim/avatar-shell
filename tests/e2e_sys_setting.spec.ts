import type {ElectronApplication, JSHandle, Page} from 'playwright';
import {_electron as electron} from 'playwright';
import {expect, test} from '@playwright/test';
import type {BrowserWindow} from 'electron';
import {globSync} from 'glob';
import {platform} from 'node:process';
import {createHash} from 'node:crypto';

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
    args: ['--no-sandbox','--playWright=noWiz'],
  });

  electronApp.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[electron][${msg.type()}] ${msg.text()}`);
    }
  });

  page = await electronApp.firstWindow();

  await page.waitForLoadState('load');

  const sysSettingBtn = page.getByTestId('sys-setting-btn')
  expect(sysSettingBtn).toBeTruthy();
  await expect(sysSettingBtn).toBeVisible();

  //  sys setting dialog
  await sysSettingBtn.click()

});

test.afterEach(async () => {
  await electronApp.close();
});


test.describe('sys setting dialog web content', async () => {

  test('Test sys setting dialog shown', async () => {
      // 設定ダイアログの表示を確認
      const dialog = page.locator('.q-dialog');
      await expect(dialog).toBeVisible();
  })
// ... existing code ...
  test('AI settings: validation error appears if GPT Text setting is partial', async () => {
    const dialog = page.locator('.q-dialog');
    await expect(dialog).toBeVisible();

    // 左側タブの「AI」へ（アイコン: smart_toy）
    await dialog.locator('.q-splitter .q-tabs').first().locator('.q-tab i.material-icons:has-text("smart_toy")').click();

    // 内部のAIタブ群が表示されること（GPTタブを選択）
    const gptTab = dialog.getByRole('tab', { name: 'GPT' });
    await expect(gptTab).toBeVisible();
    await gptTab.click();

    await dialog.getByTestId('openai-api-key').fill('');
    // GPT Text: model だけ入力（apiKey 未入力）→ 保存時にエラー
    await dialog.getByTestId('openai-model').fill('gpt-4.1-mini');
    // 保存（フッター右下のボタン）
    await dialog.getByTestId('save-and-close-btn').click();

    // エラーメッセージが表示される（コード内の英語固定文言）
    await expect(dialog).toContainText('GPT Text setting is not valid');
  });

  test('MCP settings: add and delete server tabs', async () => {
    const dialog = page.locator('.q-dialog');
    await expect(dialog).toBeVisible();

    // 左側タブの「MCP」へ（アイコン: extension）
    await dialog.locator('.q-splitter .q-tabs').first().locator('.q-tab i.material-icons:has-text("extension")').click();

    // 追加ボタン（data-testid）を押して mcp1 タブが増えること
    await dialog.getByTestId('mcp-add-btn').click();
    await expect(dialog.locator('.q-tab:has-text("mcp1")')).toBeVisible();

    // mcp1 タブを開いた状態で削除（data-testid）
    await dialog.getByTestId('mcp-delete-btn').click();

    // mcp1 タブが消えること
    await expect(dialog.locator('.q-tab:has-text("mcp1")')).toHaveCount(0);
  });

  test('License tab shows app info and version text', async () => {
    const dialog = page.locator('.q-dialog');
    await expect(dialog).toBeVisible();

    // 左側タブの「License」へ（アイコン: info_outline）
    await dialog.locator('.q-splitter .q-tabs').first().locator('.q-tab i.material-icons:has-text("info_outline")').click();

    // 固定文言の存在を確認
    await expect(dialog).toContainText('Avatar Shell');
    await expect(dialog).toContainText('Version');
  });
// ... existing code ...
});
