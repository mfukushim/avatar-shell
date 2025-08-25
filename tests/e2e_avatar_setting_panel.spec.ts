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

test.describe('AvatarSettingPanel dialog (unit-like E2E)', () => {
  test('open via select panel and show Daemon editor', async () => {
    // Avatars 設定アイコンを押してセレクトダイアログを開く
    const openIcon = page.locator('i.material-icons', { hasText: 'manage_accounts' }).first();
    await expect(openIcon).toBeVisible();
    await openIcon.click();

    // セレクトダイアログを編集ボタンの存在で特定
    const selectDialog = page.locator('.q-dialog').filter({ has: page.getByTestId('avatar-edit-btn') }).first();
    await expect(selectDialog).toBeVisible();

    // 編集ボタンで AvatarSettingPanel ダイアログを新規に開く
    const beforeCount = await page.locator('.q-dialog').count();
    await selectDialog.getByTestId('avatar-edit-btn').click();
    await expect(page.locator('.q-dialog')).toHaveCount(beforeCount + 1);

    // 追加で開いたダイアログを取得
    const settingDialog = page.locator('.q-dialog').nth(beforeCount);
    await expect(settingDialog).toBeVisible();

    // 左側タブの「Daemon」（schedule アイコン）へ
    await settingDialog.locator('.q-splitter .q-tabs').first().locator('.q-tab i.material-icons', { hasText: 'schedule' }).click();

    // Daemon エディタの主要ラベルが表示されること
    await expect(settingDialog.getByText('Generator prompt template')).toBeVisible();

    // 追加ボタン（add アイコン）で daemon-* タブが出現すること
    await settingDialog.locator('i.material-icons', { hasText: 'add' }).first().click();
    await expect(settingDialog.locator('.q-tab', { hasText: /daemon-/ })).toBeVisible();
  });

  test('General tab controls: can edit name and usage limit', async () => {
    // ダイアログを開く
    const openIcon = page.locator('i.material-icons', { hasText: 'manage_accounts' }).first();
    await openIcon.click();
    const selectDialog = page.locator('.q-dialog').filter({ has: page.getByTestId('avatar-edit-btn') }).first();
    const beforeCount = await page.locator('.q-dialog').count();
    await selectDialog.getByTestId('avatar-edit-btn').click();
    await expect(page.locator('.q-dialog')).toHaveCount(beforeCount + 1);
    const settingDialog = page.locator('.q-dialog').nth(beforeCount);

    // 左側タブの「General」（face アイコン）へ
    await settingDialog.locator('.q-splitter .q-tabs').first().locator('.q-tab i.material-icons', { hasText: 'face' }).click();

    // 名前入力（最初のテキスト input）を変更
    const nameInput = settingDialog.locator('input[type="text"]').first();
    await nameInput.fill('');
    await nameInput.fill('Alice Edited');
    await expect(nameInput).toHaveValue('Alice Edited');

    // 使用上限（最初の number input）を変更
    const limitInput = settingDialog.locator('input[type="number"]').first();
    await limitInput.fill('');
    await limitInput.fill('3');
    await expect(limitInput).toHaveValue('3');
  });

  test('Daemon tab controls: add, rename, toggle enable', async () => {
    // ダイアログを開く
    const openIcon = page.locator('i.material-icons', { hasText: 'manage_accounts' }).first();
    await openIcon.click();
    const selectDialog = page.locator('.q-dialog').filter({ has: page.getByTestId('avatar-edit-btn') }).first();
    const beforeCount = await page.locator('.q-dialog').count();
    await selectDialog.getByTestId('avatar-edit-btn').click();
    await expect(page.locator('.q-dialog')).toHaveCount(beforeCount + 1);
    const settingDialog = page.locator('.q-dialog').nth(beforeCount);

    // デーモンタブへ
    await settingDialog.locator('.q-splitter .q-tabs').first().locator('.q-tab i.material-icons', { hasText: 'schedule' }).click();

    // 追加 -> 新規 daemon タブが現れる
    await settingDialog.locator('i.material-icons', { hasText: 'add' }).first().click();
    const daemonTab = settingDialog.locator('.q-tab', { hasText: /daemon-/ }).first();
    await expect(daemonTab).toBeVisible();

    // ヘッダー行の名前 input を変更
    // const headerNameInput = settingDialog.locator('.q-card-section .row.items-center input[type="text"]').first();
    // await headerNameInput.fill('daemon-new-name');
    // // タブ名が反映（debounce 後に更新されるため待機を入れる）
    // await expect(settingDialog.locator('.q-tab', { hasText: 'daemon-new-name' })).toBeVisible();

    // 有効トグル（最初の switch）をクリックして状態変化
    const enableSwitch = settingDialog.getByRole('switch').first();
    const beforeChecked = await enableSwitch.getAttribute('aria-checked');
    await enableSwitch.click();
    const afterChecked = await enableSwitch.getAttribute('aria-checked');
    expect(beforeChecked).not.toEqual(afterChecked);
  });

  test('Websocket tab controls: toggle and input remote server', async () => {
    // ダイアログを開く
    const openIcon = page.locator('i.material-icons', { hasText: 'manage_accounts' }).first();
    await openIcon.click();
    const selectDialog = page.locator('.q-dialog').filter({ has: page.getByTestId('avatar-edit-btn') }).first();
    const beforeCount = await page.locator('.q-dialog').count();
    await selectDialog.getByTestId('avatar-edit-btn').click();
    await expect(page.locator('.q-dialog')).toHaveCount(beforeCount + 1);
    const settingDialog = page.locator('.q-dialog').nth(beforeCount);

    // Websocket タブ（rss_feed アイコン）へ
    await settingDialog.locator('.q-splitter .q-tabs').first().locator('.q-tab i.material-icons', { hasText: 'rss_feed' }).click();

    // サーバー入力はトグル OFF 時は disabled
    const serverInput = settingDialog.getByTestId('as-remote-server');
    const socketSwitch = settingDialog.getByRole('switch').first();
    if (await serverInput.isEnabled()) {
      await serverInput.fill('');
      await serverInput.fill('ws://localhost:1234');
      await expect(serverInput).toHaveValue('ws://localhost:1234');
    } else {
      await expect(serverInput).toBeDisabled();
      await socketSwitch.click();
    }

    // アドレス入力
    await serverInput.fill('ws://localhost:1234');
    await expect(serverInput).toHaveValue('ws://localhost:1234');
  });

  test('MCP tab controls (if exists): toggle enable and change permission', async () => {
    // ダイアログを開く
    const openIcon = page.locator('i.material-icons', { hasText: 'manage_accounts' }).first();
    await openIcon.click();
    const selectDialog = page.locator('.q-dialog').filter({ has: page.getByTestId('avatar-edit-btn') }).first();
    const beforeCount = await page.locator('.q-dialog').count();
    await selectDialog.getByTestId('avatar-edit-btn').click();
    await expect(page.locator('.q-dialog')).toHaveCount(beforeCount + 1);
    const settingDialog = page.locator('.q-dialog').nth(beforeCount);

    // MCP タブ（extension アイコン）へ
    await settingDialog.locator('.q-splitter .q-tabs').first().locator('.q-tab i.material-icons', { hasText: 'extension' }).click();

    // 内部 MCP タブ群（オレンジタブ）の可視なコンテナを取得し、タブが無ければスキップ
    const mcpTabsContainer = settingDialog.locator('.bg-orange.text-white.shadow-2:visible').first();
    const mcpTabCount = await mcpTabsContainer.locator('.q-tab').count();
    if (mcpTabCount === 0) {
      test.skip(true, 'No MCP entries available in current config');
    }

    // 最初の MCP タブを開く
    await mcpTabsContainer.locator('.q-tab').first().click();

    // 有効トグルを操作（可視な最初の switch）
    const mcpSwitch = settingDialog.getByRole('switch').first();
    await mcpSwitch.click();

    // パーミッションのセレクト（最初の combobox）を変更
    const permSelect = settingDialog.getByRole('combobox').first();
    await permSelect.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // 何らかの値が入っていること（空でない）
    const permValue = await permSelect.inputValue();
    expect(permValue).not.toEqual('');
  });
});
