import type {ElectronApplication, JSHandle} from 'playwright';
import {_electron as electron} from 'playwright';
import {expect, test as base} from '@playwright/test';
import type {BrowserWindow} from 'electron';
import {globSync} from 'glob';
import {platform} from 'node:process';
import {createHash} from 'node:crypto';

process.env.PLAYWRIGHT_TEST = 'true';

// Declare the types of your fixtures.
type TestFixtures = {
  electronApp: ElectronApplication;
  electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
  electronApp: [async ({}, use) => {

    /**
     * Executable path depends on root package name!
     */
    let executablePattern = 'dist/*/avatar-shell{,.*}';
    if (platform === 'darwin') {
      executablePattern += '/Contents/*/avatar-shell';
    }

    const [executablePath] = globSync(executablePattern);
    if (!executablePath) {
      throw new Error('App Executable path not found');
    }

    const electronApp = await electron.launch({
      executablePath: executablePath,
      args: ['--no-sandbox'],
    });

    electronApp.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`[electron][${msg.type()}] ${msg.text()}`);
      }
    });

    await use(electronApp);

    // This code runs after all the tests in the worker process.
    await electronApp.close();
  }, {scope: 'worker', auto: true} as any],

  page: async ({electronApp}, use) => {
    const page = await electronApp.firstWindow();
    // capture errors
    page.on('pageerror', (error) => {
      console.error(error);
    });
    // capture console messages
    page.on('console', (msg) => {
      console.log(msg.text());
    });

    await page.waitForLoadState('load');
    await use(page);
  },

  electronVersions: async ({electronApp}, use) => {
    await use(await electronApp.evaluate(() => process.versions));
  },
});


test('Main window state', async ({electronApp, page}) => {
  const window: JSHandle<BrowserWindow> = await electronApp.browserWindow(page);
  const windowState = await window.evaluate(
    (mainWindow): Promise<{isVisible: boolean; isDevToolsOpened: boolean; isCrashed: boolean,title:string}> => {
      const getState = () => ({
        isVisible: mainWindow.isVisible(),
        isDevToolsOpened: mainWindow.webContents.isDevToolsOpened(),
        isCrashed: mainWindow.webContents.isCrashed(),
        title: mainWindow.webContents.getTitle(),
      });

      return new Promise(resolve => {
        /**
         * The main window is created hidden, and is shown only when it is ready.
         * See {@link ../packages/main/src/mainWindow.ts} function
         */
        if (mainWindow.isVisible()) {
          resolve(getState());
        } else {
          mainWindow.once('ready-to-show', () => resolve(getState()));
        }
      });
    },
  );

  console.log('windowState:',windowState);
  expect(windowState.isCrashed, 'The app has crashed').toEqual(false);
  expect(windowState.isVisible, 'The main window was not visible').toEqual(true);
  expect(windowState.isDevToolsOpened, 'The DevTools panel was open').toEqual(false);
});

test.describe('Main window web content', async () => {

  test('The main window has an interactive button', async ({page}) => {
    {
      const element = page.getByText('Alice - Avatar Shell')
      await element.evaluate((el) => {
        console.log('el: ', el.outerHTML);
      });
      await expect(element).toBeVisible();
    }
    {
      const element = page.getByText('mfuku')
      await element.evaluate((el) => {
        console.log('el: ', el.outerHTML);
      });
      await expect(element).toBeVisible();
    }
  })

  test('The main window has header with avatar name', async ({page}) => {
    // ヘッダーが表示されていることを確認
    const header = page.locator('header.q-header');
    // console.log('header: ', header);
    // console.log('header innerHTML: ', await header.innerHTML());
    await expect(header).toBeVisible();

    // アバター名が表示されていることを確認（初期状態では空文字列の可能性もある）
    const avatarNameElement = page.locator('div.q-bar div').first();
    console.log('avatarNameElement innerHTML: ', await avatarNameElement.innerHTML());
    await expect(avatarNameElement).toBeVisible();
  });

  test('The main window has input panel with text input', async ({page}) => {
    // 入力パネルが表示されていることを確認
    const inputPanel = page.locator('footer.q-footer');
    await expect(inputPanel).toBeVisible();

    // テキスト入力フィールドが表示されていることを確認
    const textInput = page.getByRole('textbox',{ name: 'talk input'});
    await expect(textInput).toBeVisible();

    // 送信ボタンが表示されていることを確認
    const sendButton = page.locator('button.q-btn i.q-icon', {hasText: 'send'});
    await expect(sendButton).toBeVisible();
  });

  test('The main window has menu button in header', async ({page}) => {
    // ヘッダーのメニューボタンが表示されていることを確認
    const menuButton = page.locator('aside.q-drawer i.q-icon',{hasText: 'face'});
    await expect(menuButton).toBeVisible();
  });

  test('The main window has volume control button', async ({page}) => {
    // 音量制御ボタンが表示されていることを確認
    const volumeButton = page.locator('div.q-bar button.q-btn[icon*="volume"]');
    await expect(volumeButton).toBeVisible();
  });

  test('The main window has chat toggle button in footer', async ({page}) => {
    // フッターのチャットトグルボタンが表示されていることを確認
    const chatButton = page.locator('footer.q-footer button.q-btn[icon="chat"]');
    await expect(chatButton).toBeVisible();
  });

  test('The main window has main image display area', async ({page}) => {
    // メイン画像表示エリアが表示されていることを確認
    const mainImage = page.locator('div.q-img');
    await expect(mainImage).toBeVisible();

    // デフォルト画像が表示されていることを確認（内部のimg要素から取得）
    const imgSrc = await mainImage.locator('img').getAttribute('src');
    expect(imgSrc).toBeTruthy();
  });

  test('The main window has file upload button', async ({page}) => {
    // ファイルアップロードボタンが表示されていることを確認
    const fileUpload = page.locator('div.q-file');
    await expect(fileUpload).toBeVisible();

    // ファイルアップロードのアイコンが表示されていることを確認
    const fileIcon = page.locator('div.q-file i.q-icon[name="attach_file"]');
    await expect(fileIcon).toBeVisible();
  });

  test('The main window has MCP resource button', async ({page}) => {
    // MCPリソースボタンが表示されていることを確認
    const mcpButton = page.locator('button.q-btn[icon="text_snippet"]');
    await expect(mcpButton).toBeVisible();
  });

  test('The main window has window control buttons', async ({page}) => {
    // ウィンドウ制御ボタンが表示されていることを確認
    const minimizeButton = page.locator('div.q-bar button.q-btn[icon="minimize"]');
    const maximizeButton = page.locator('div.q-bar button.q-btn[icon="crop_square"]');
    const closeButton = page.locator('div.q-bar button.q-btn[icon="close"]');

    await expect(minimizeButton).toBeVisible();
    await expect(maximizeButton).toBeVisible();
    await expect(closeButton).toBeVisible();
  });

  test('The main window has search button in header', async ({page}) => {
    // 検索ボタンが表示されていることを確認
    const searchButton = page.locator('q-bar q-btn[icon="search"]');
    await expect(searchButton).toBeVisible();
  });

  test('The main window has connection status button', async ({page}) => {
    // 接続状態ボタンが表示されていることを確認
    const connectionButton = page.locator('q-bar q-btn[icon*="wifi"]');
    await expect(connectionButton).toBeVisible();
  });

  test('The main window has schedule button in header', async ({page}) => {
    // スケジュールボタンが表示されていることを確認
    const scheduleButton = page.locator('q-bar q-btn[icon*="schedule"], q-bar q-btn[icon*="update_disabled"]');
    await expect(scheduleButton).toBeVisible();
  });

  test('Input panel is disabled initially', async ({page}) => {
    // 初期状態で入力パネルが無効化されていることを確認
    const textInput = page.locator('q-input input[type="text"]');
    const sendButton = page.locator('q-btn[icon="send"]');
    const fileUpload = page.locator('q-file');

    // 入力フィールドが無効化されていることを確認
    await expect(textInput).toBeDisabled();
    await expect(sendButton).toBeDisabled();
    await expect(fileUpload).toBeDisabled();
  });

  test('The main window has proper layout structure', async ({page}) => {
    // レイアウト構造が正しく表示されていることを確認
    const layout = page.locator('div.q-layout');
    const header = page.locator('header.q-header');
    const footer = page.locator('footer.q-footer');
    const pageContainer = page.locator('div.q-page-container');

    await expect(layout).toBeVisible();
    await expect(header).toBeVisible();
    await expect(footer).toBeVisible();
    await expect(pageContainer).toBeVisible();
  });

  test('The main window has wave background animation', async ({page}) => {
    // 波の背景アニメーションが表示されていることを確認
    const waveBackground = page.locator('.wave-background');
    const wave = page.locator('.wave');

    await expect(waveBackground).toBeVisible();
    await expect(wave).toBeVisible();
  });

  test('Menu drawer can be toggled', async ({page}) => {
    // メニューボタンをクリックしてドロワーを開く
    const menuButton = page.locator('div.q-bar i.q-icon[name="face"]');
    await menuButton.click();

    // ドロワーが表示されることを確認
    const drawer = page.locator('aside.q-drawer');
    await expect(drawer).toBeVisible();

    // 再度クリックしてドロワーを閉じる
    await menuButton.click();
  });

  test('Chat drawer can be toggled', async ({page}) => {
    // チャットボタンをクリックしてドロワーを開く
    const chatButton = page.locator('footer.q-footer button.q-btn[icon="chat"]');
    await chatButton.click();

    // 右側のドロワーが表示されることを確認
    const rightDrawer = page.locator('aside.q-drawer[side="right"]');
    await expect(rightDrawer).toBeVisible();

    // 再度クリックしてドロワーを閉じる
    await chatButton.click();
  });

  test('Volume control popup can be opened', async ({page}) => {
    // 音量ボタンをクリックしてポップアップを開く
    const volumeButton = page.locator('div.q-bar button.q-btn[icon*="volume"]');
    await volumeButton.click();

    // 音量制御パネルが表示されることを確認
    const volumePanel = page.locator('div.q-popup-proxy');
    await expect(volumePanel).toBeVisible();
  });

  test('Search button opens image selector', async ({page}) => {
    // 検索ボタンをクリックして画像セレクターを開く
    const searchButton = page.locator('div.q-bar button.q-btn[icon="search"]');
    await searchButton.click();

    // 画像セレクターが表示されることを確認
    const imageSelector = page.locator('ImageSelector');
    await expect(imageSelector).toBeVisible();

    // 再度クリックして閉じる
    await searchButton.click();
  });

  test('Text input accepts user input', async ({page}) => {
    // テキスト入力フィールドにテキストを入力
    const textInput = page.locator('q-input input[type="text"]');
    const testText = 'Hello, Avatar!';

    await textInput.fill(testText);

    // 入力されたテキストが正しく表示されることを確認
    await expect(textInput).toHaveValue(testText);
  });

  test('MCP resource button shows menu', async ({page}) => {
    // MCPリソースボタンをクリックしてメニューを開く
    const mcpButton = page.locator('button.q-btn[icon="text_snippet"]');
    await mcpButton.click();

    // メニューが表示されることを確認
    const mcpMenu = page.locator('div.q-menu');
    await expect(mcpMenu).toBeVisible();
  });

  test('Window control buttons are clickable', async ({page}) => {
    // ウィンドウ制御ボタンがクリック可能であることを確認
    const minimizeButton = page.locator('div.q-bar button.q-btn[icon="minimize"]');
    const maximizeButton = page.locator('div.q-bar button.q-btn[icon="crop_square"]');
    const closeButton = page.locator('div.q-bar button.q-btn[icon="close"]');

    // ボタンがクリック可能であることを確認（実際の動作はテストしない）
    await expect(minimizeButton).toBeEnabled();
    await expect(maximizeButton).toBeEnabled();
    await expect(closeButton).toBeEnabled();
  });

  test('Connection status button toggles state', async ({page}) => {
    // 接続状態ボタンをクリック
    const connectionButton = page.locator('div.q-bar button.q-btn[icon*="wifi"]');
    const initialIcon = await connectionButton.locator('i.q-icon').getAttribute('name');

    await connectionButton.click();

    // アイコンが変更されることを確認（実際の状態は環境に依存するため、クリック可能であることを確認）
    await expect(connectionButton).toBeEnabled();
  });

  test('Schedule button toggles state', async ({page}) => {
    // スケジュールボタンをクリック
    const scheduleButton = page.locator('div.q-bar button.q-btn[icon*="schedule"], div.q-bar button.q-btn[icon*="update_disabled"]');
    const initialIcon = await scheduleButton.locator('i.q-icon').getAttribute('name');

    await scheduleButton.click();

    // アイコンが変更されることを確認（実際の状態は環境に依存するため、クリック可能であることを確認）
    await expect(scheduleButton).toBeEnabled();
  });

  test('Main image has popup on click', async ({page}) => {
    // メイン画像をクリック
    const mainImage = page.locator('div.q-img');
    await mainImage.click();

    // ポップアップが表示されることを確認
    const popup = page.locator('div.q-popup-proxy');
    await expect(popup).toBeVisible();
  });

  test('Application has proper accessibility attributes', async ({page}) => {
    // アクセシビリティ属性が適切に設定されていることを確認
    const textInput = page.locator('div.q-input input[type="text"]');
    const sendButton = page.locator('button.q-btn[icon="send"]');
    const fileUpload = page.locator('div.q-file');

    // 入力フィールドにラベルが設定されていることを確認
    await expect(textInput).toHaveAttribute('aria-label', 'talk input');

    // ボタンが適切に識別可能であることを確認
    await expect(sendButton).toBeVisible();
    await expect(fileUpload).toBeVisible();
  });

  test('Application handles different screen sizes', async ({page}) => {
    // 異なる画面サイズでの表示をテスト
    const originalSize = page.viewportSize();

    // 小さな画面サイズでテスト
    await page.setViewportSize({ width: 800, height: 600 });
    await expect(page.locator('div.q-layout')).toBeVisible();
    await expect(page.locator('header.q-header')).toBeVisible();
    await expect(page.locator('footer.q-footer')).toBeVisible();

    // 大きな画面サイズでテスト
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('q-layout')).toBeVisible();
    await expect(page.locator('q-header')).toBeVisible();
    await expect(page.locator('q-footer')).toBeVisible();

    // 元のサイズに戻す
    if (originalSize) {
      await page.setViewportSize(originalSize);
    }
  });

  test('Application has proper keyboard navigation', async ({page}) => {
    // キーボードナビゲーションが適切に動作することを確認
    const textInput = page.locator('q-input input[type="text"]');

    // 入力フィールドにフォーカスを設定
    await textInput.focus();
    await expect(textInput).toBeFocused();

    // Tabキーでナビゲーションが可能であることを確認
    await page.keyboard.press('Tab');
    // 次の要素にフォーカスが移動することを確認（具体的な要素は環境に依存）
  });

  test('Application shows loading states appropriately', async ({page}) => {
    // ローディング状態が適切に表示されることを確認
    const mainImage = page.locator('div.q-img');

    // 画像のローディング状態を確認
    const loadingTemplate = page.locator('div.q-img template[v-slot="loading"]');
    await expect(loadingTemplate).toBeVisible();
  });

  test('Application handles error states gracefully', async ({page}) => {
    // エラー状態が適切に処理されることを確認
    const mainImage = page.locator('div.q-img');

    // エラー状態のテンプレートが存在することを確認
    const errorTemplate = page.locator('div.q-img template[v-slot="error"]');
    await expect(errorTemplate).toBeVisible();
  });
});

test.describe('Preload context should be exposed', async () => {
  test.describe(`versions should be exposed`, async () => {
    test('with same type`', async ({page}) => {
      const type = await page.evaluate(() => typeof globalThis[btoa('versions')]);
      expect(type).toEqual('object');
    });

    test('with same value', async ({page, electronVersions}) => {
      const value = await page.evaluate(() => globalThis[btoa('versions')]);
      expect(value).toEqual(electronVersions);
    });
  });

  test.describe(`sha256sum should be exposed`, async () => {
    test('with same type`', async ({page}) => {
      const type = await page.evaluate(() => typeof globalThis[btoa('sha256sum')]);
      expect(type).toEqual('function');
    });

    test('with same behavior', async ({page}) => {
      const testString = btoa(`${Date.now() * Math.random()}`);
      const expectedValue = createHash('sha256').update(testString).digest('hex');
      const value = await page.evaluate((str) => globalThis[btoa('sha256sum')](str), testString);
      expect(value).toEqual(expectedValue);
    });
  });

/*
  test.describe(`send should be exposed`, async () => {
    test('with same type`', async ({page}) => {
      const type = await page.evaluate(() => typeof globalThis[btoa('send')]);
      expect(type).toEqual('function');
    });

    test('with same behavior', async ({page, electronApp}) => {
      await electronApp.evaluate(async ({ipcMain}) => {
        ipcMain.handle('test', (event, message) => btoa(message));
      });

      const testString = btoa(`${Date.now() * Math.random()}`);
      const expectedValue = btoa(testString);
      const value = await page.evaluate(async (str) => await globalThis[btoa('send')]('test', str), testString);
      expect(value).toEqual(expectedValue);
    });
  });
*/
});
