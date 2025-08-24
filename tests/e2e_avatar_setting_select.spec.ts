import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';
import { expect, test } from '@playwright/test';
import { globSync } from 'glob';
import { platform } from 'node:process';

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
    executablePath,
    args: ['--no-sandbox', '--playWright=noWiz'],
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

test.describe('AvatarSettingSelectPanel dialog', () => {
  test('opens dialog from manage_accounts icon', async () => {
    // Avatars 設定アイコンを押してダイアログを開く
    const openIcon = page.locator('i.material-icons:has-text("manage_accounts")').first();
    await expect(openIcon).toBeVisible();
    const beforeCount = await page.locator('.q-dialog').count();
    await openIcon.click();

    // 新しいダイアログが増え、そこに q-select と edit ボタンがあること
    await expect(page.locator('.q-dialog')).toHaveCount(beforeCount + 1);
    const selectDialog = page
      .getByTestId('avatar-edit-btn')
    await expect(selectDialog).toBeVisible();
    await expect(selectDialog.locator('.q-select')).toBeVisible();
  });

  test('clicking edit opens AvatarSettingPanel dialog', async () => {
    // パネルを開く
    const openIcon = page.locator('i.material-icons:has-text("manage_accounts")').first();
    await openIcon.click();

    // セレクトダイアログ取得
    const selectDialog = page
      .locator('.q-dialog')
      .filter({ has: page.getByTestId('avatar-edit-btn') })
      .first();
    await expect(selectDialog).toBeVisible();

    // 編集ボタンを押すと、AvatarSettingPanel のダイアログが開く
    await selectDialog.getByTestId('avatar-edit-btn').click();

    // 内部ダイアログは "Generator prompt template" のラベルを含む
    const innerDialog = page
      .locator('.q-dialog')
      .filter({ hasText: 'Generator prompt template' })
      .first();
    await expect(innerDialog).toBeVisible();
  });

  test('delete flow shows confirm dialog and can be canceled', async () => {
    // パネルを開く
    const openIcon = page.locator('i.material-icons:has-text("manage_accounts")').first();
    await openIcon.click();

    const selectDialog = page
      .locator('.q-dialog')
      .filter({ has: page.getByTestId('avatar-edit-btn') })
      .first();
    await expect(selectDialog).toBeVisible();

    // 削除ボタンで確認ダイアログが1つ増える
    const before = await page.locator('.q-dialog').count();
    await selectDialog.getByTestId('avatar-delete-btn').click();
    await expect(page.locator('.q-dialog')).toHaveCount(before + 1);

    // 追加で開いたダイアログのアクション行の最後のボタン（キャンセル相当）を押す
    const confirmDialog = page.locator('.q-dialog').nth(before);
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByTestId('avatar-delete-cancel-btn').click();

    // 確認ダイアログが閉じる（増分が戻る）
    await expect(page.locator('.q-dialog')).toHaveCount(before);
  });
});
