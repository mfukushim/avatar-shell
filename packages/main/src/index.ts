import type {AppInitConfig} from './AppInitConfig.js';
import {createModuleRunner} from './ModuleRunner.js';
import {disallowMultipleAppInstance} from './modules/SingleInstanceApp.js';
import {createWindowManagerModule} from './modules/WindowManager.js';
import {terminateAppOnLastWindowClose} from './modules/ApplicationTerminatorOnLastWindowClose.js';
import {hardwareAccelerationMode} from './modules/HardwareAccelerationModule.js';
import {autoUpdater} from './modules/AutoUpdater.js';
import {allowInternalOrigins} from './modules/BlockNotAllowdOrigins.js';
import {allowExternalUrls} from './modules/ExternalUrls.js';
import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron';
import {Effect, Layer, ManagedRuntime} from 'effect';
import {ConfigService, ConfigServiceLive} from './ConfigService.js';
import {DocService, DocServiceLive} from './DocService.js';
import {McpService, McpServiceLive} from './McpService.js';
import {BuildInMcpServiceLive} from './BuildInMcpService.js';
import {MediaServiceLive} from './MediaService.js';
import {AvatarService, AvatarServiceLive} from './AvatarService.js';
import {SocketServiceLive} from './SocketService.js';
import {AlertReply, AsMessage, MutableSysConfig} from '../../common/Def.js';
import electronLog from 'electron-log';

const AppConfigLive = Layer.mergeAll(ConfigServiceLive, DocServiceLive, McpServiceLive, BuildInMcpServiceLive, MediaServiceLive,AvatarServiceLive,SocketServiceLive);
const aiRuntime = ManagedRuntime.make(AppConfigLive);

export function showAlertIfFatal(detectPos: string) {
  return (e:any) => {
    if (dialog) {
      dialog.showErrorBox(
        'Error',
        `${detectPos} error ${e}`
      );
    }
    console.log(e);
    return Effect.succeed(e); //  復帰はさせる
  };
}


export async function initApp(initConfig: AppInitConfig) {
  const moduleRunner = createModuleRunner()
    .init(createWindowManagerModule({initConfig, openDevTools: import.meta.env.DEV}))
    .init(disallowMultipleAppInstance())
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({enable: false}))
    .init(autoUpdater()) //  TODO デプロイの仕組みが通るまで一時オフ

    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))

    // Security
    .init(allowInternalOrigins(
      new Set(initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []),
    ))
    .init(allowExternalUrls(
      new Set(
        initConfig.renderer instanceof URL
          ? [
            'https://vite.dev',
            'https://developer.mozilla.org',
            'https://solidjs.com',
            'https://qwik.dev',
            'https://lit.dev',
            'https://react.dev',
            'https://preactjs.com',
            'https://www.typescriptlang.org',
            'https://vuejs.org',
          ]
          : [],
      )),
    );

  await moduleRunner;
}

ipcMain.handle('request-window-close', async (event,avatarId:string) => {
  // console.log('request-window-close');
  await AvatarService.deleteAvatar(avatarId).pipe(Effect.catchAll(showAlertIfFatal('request-window-close')),aiRuntime.runPromise);
  const win = BrowserWindow.fromWebContents(event.sender);
  // console.log('win:',win);
  if (win) win.close();
});

ipcMain.handle('request-window-max', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.handle('request-window-min', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle('AskAi', async (_, avatarId: string, mes: AsMessage[]) => await AvatarService.askAvatar(avatarId, mes).pipe(Effect.catchAll(showAlertIfFatal('AskAi')), aiRuntime.runPromise));

ipcMain.handle('GetTalkContext', async (_, avatarId: string) => await AvatarService.getTalkContext(avatarId).pipe(Effect.catchAll(showAlertIfFatal('GetTalkContext')), aiRuntime.runPromise));
ipcMain.handle('addExtTalkContext', async (_, avatarId: string,bags:AsMessage[]) => await AvatarService.addExtTalkContext(avatarId, bags).pipe(Effect.catchAll(showAlertIfFatal('addExtTalkContext')), aiRuntime.runPromise));
ipcMain.handle('getMcpServerInfos', async (_) => await McpService.getMcpServerInfos().pipe(Effect.catchAll(showAlertIfFatal('getMcpServerInfos')), aiRuntime.runPromise));
ipcMain.handle('readMcpResource', async (_,avatarId: string,userName:string,name:string,uri:string) => {
  return await McpService.readMcpResource(name, uri).pipe(
    Effect.andThen(a => {
      if (a && a.contents) {
        const mesList = a.contents.flatMap(b => {
          if(b.mimeType === 'text/plain') {
            const c = b.text as string
            return [AsMessage.makeMessage({
              from: userName,
              mediaBin: Buffer.from(b.text as string).buffer,
              mimeType: 'text/plain',
            }, 'talk', 'human', 'inner')] //  前提条件テキストにしたいが今はLLM直に送る形にする
          }
          //  TODO 画像等
          return []
        })
        return AvatarService.askAvatar(avatarId, mesList)
      }
      return Effect.succeed([]);
    }),
    Effect.catchAll(showAlertIfFatal('readMcpResource')), aiRuntime.runPromise);
});

ipcMain.handle('answerMainAlert', async (_,id:string,reply:AlertReply,btn:string) => {
  switch (reply) {
    case 'mcpSelect':
      return await McpService.answerMcpAlert(id, btn).pipe(Effect.catchAll(showAlertIfFatal('answerMcpAlert')), aiRuntime.runPromise);
  }
});

ipcMain.handle('getAvatarConfig', async (_, templateId) => await ConfigService.getAvatarConfig(templateId).pipe(Effect.catchAll(showAlertIfFatal('getAvatarConfig')), aiRuntime.runPromise));

ipcMain.handle('setNames', async (_,id:string, setting:{userName?:string,avatarName?:string}) => await AvatarService.setNames(id, setting).pipe(Effect.catchAll(showAlertIfFatal('setNames')), aiRuntime.runPromise));

ipcMain.handle('setAvatarConfig', async (_, id, data) => await ConfigService.setAvatarConfig(id, data).pipe(Effect.catchAll(showAlertIfFatal('setAvatarConfig')), aiRuntime.runPromise));
ipcMain.handle('copyAvatarConfig', async (_, templateId) => await ConfigService.copyAvatarConfig(templateId).pipe(Effect.catchAll(showAlertIfFatal('copyAvatarConfig')), aiRuntime.runPromise));
ipcMain.handle('deleteAvatarConfig', async (_, templateId) => {
  //  現在動いているtemplateのインスタンスが存在するかをチェック
  return await Effect.gen(function* () {
    const list = yield *AvatarService.getCurrentAvatarList()
    if (list.some(a => a.templateId === templateId)) {
      return 'template is running. can not delete.';
    }
    yield *ConfigService.deleteAvatarConfig(templateId);
    return 'done';
  }).pipe(Effect.catchAll(showAlertIfFatal('deleteAvatarConfig')),aiRuntime.runPromise);
});

ipcMain.handle('getAvatarConfigList', async (_) => await ConfigService.getAvatarConfigList().pipe(Effect.catchAll(showAlertIfFatal('getAvatarConfigList')), aiRuntime.runPromise));

ipcMain.handle('getSysConfig', async (_) => await ConfigService.getSysConfig().pipe(Effect.catchAll(showAlertIfFatal('getSysConfig')), aiRuntime.runPromise));

ipcMain.handle('setSysConfig', async (_, data) => {
  return await ConfigService.updateSysConfig(() => data).pipe(
    //  sys修正があったとき、現在存在するアバターのavatarConfigを強制更新する必要がある(avatarのMCP制約の更新のため)
    Effect.andThen(a => McpService.reset(a)),
    Effect.andThen(a => AvatarService.getCurrentAvatarList()),
    Effect.andThen(a => Effect.forEach(Array.from(new Set(a.map(b => b.templateId))), templateId => {
      return ConfigService.updateAvatarConfigEffect(templateId, a => {
        return McpService.updateAvatarMcpSetting(templateId).pipe(Effect.andThen(b => {
          // console.log('update avatar mcp setting: ', b);
          return Effect.succeed({
            ...a,
            mcp: b
          })
        }));
      });
    })),
    Effect.catchAll(showAlertIfFatal('setSysConfig'))
    , aiRuntime.runPromise);
});

ipcMain.handle('exportSysConfig',async (_) => {
  return await ConfigService.exportSysConfig().pipe(Effect.catchAll(showAlertIfFatal('exportSysConfig')), aiRuntime.runPromise)
})
ipcMain.handle('importSysConfig',async (_) => {
  return await ConfigService.importSysConfig().pipe(Effect.catchAll(showAlertIfFatal('importSysConfig')), aiRuntime.runPromise)
})

ipcMain.handle('exportAvatar',async (_,templateId:string) => {
  return await ConfigService.exportAvatar(templateId).pipe(Effect.catchAll(showAlertIfFatal('exportAvatar')), aiRuntime.runPromise)
})

ipcMain.handle('importAvatar',async (_) => {
  return await ConfigService.importAvatar().pipe(Effect.catchAll(showAlertIfFatal('importAvatar')), aiRuntime.runPromise)
})

ipcMain.handle('getMutableSetting', async (_) => await ConfigService.getMutableSetting().pipe(Effect.catchAll(showAlertIfFatal('getMutableSetting')), aiRuntime.runPromise));

ipcMain.handle('updateMutableSetting', async (_, data:MutableSysConfig) => await ConfigService.updateMutableSetting(data).pipe(Effect.catchAll(showAlertIfFatal('updateMutableSetting')), aiRuntime.runPromise));

ipcMain.handle('readDocList', async (_, avatarId: string) => await DocService.readDocList(avatarId).pipe(Effect.catchAll(showAlertIfFatal('readDocList')), aiRuntime.runPromise));
ipcMain.handle('readDocument', async (_,templateId:string, fileName: string) => {
  return await DocService.readDocument(templateId, fileName).pipe(
    Effect.andThen(a => a.flatMap(b => b.mes)), //  レンダー側で取得する場合はAsMessageだけにする
    Effect.catchAll(showAlertIfFatal('readDocument')),
    aiRuntime.runPromise,
  );
});
ipcMain.handle('readDocMedia', async (_, mediaUrl: string) => await DocService.readDocMedia(mediaUrl).pipe(Effect.catchAll(showAlertIfFatal(`readDocument`)), aiRuntime.runPromise,));

ipcMain.handle('getScheduleList', async (_, avatarId: string) => await AvatarService.getScheduleList(avatarId).pipe(Effect.catchAll(showAlertIfFatal('getScheduleList')), aiRuntime.runPromise));

ipcMain.handle('cancelSchedule', async (_, avatarId: string,id:string) => await AvatarService.cancelSchedule(avatarId, id).pipe(Effect.catchAll(showAlertIfFatal('cancelSchedule')), aiRuntime.runPromise));

ipcMain.handle('getVersion', async (_) => await ConfigService.getVersion().pipe(Effect.catchAll(showAlertIfFatal('getVersion')), aiRuntime.runPromise));

ipcMain.handle('openBrowser', async (_, url: string) => {
  // console.log(url);
  await shell.openExternal(url);
});


ipcMain.handle('updateAvatarMcpSetting', async (_,templateId: string) => await McpService.updateAvatarMcpSetting(templateId).pipe(Effect.catchAll(showAlertIfFatal('updateAvatarMcpSetting')), aiRuntime.runPromise));

ipcMain.handle('getGeneratorList', async (event) => {
  return await ConfigService.getGeneratorList().pipe(Effect.catchAll(showAlertIfFatal('getGeneratorList')), aiRuntime.runPromise);
});

ipcMain.handle('getCurrentAvatarList', async (_) => await AvatarService.getCurrentAvatarList().pipe(Effect.catchAll(showAlertIfFatal('getCurrentAvatarList')), aiRuntime.runPromise));

ipcMain.handle('addAvatar',async (_,templateId:string,name:string) => {
  return await Effect.gen(function* () {
    yield *AvatarService.addAvatarQueue({templateId,name})
    console.log('addAvatar:',templateId,name);
    app.emit('second-instance', process.argv);
  }).pipe(Effect.catchAll(showAlertIfFatal('addAvatar')),aiRuntime.runPromise);
});

ipcMain.handle('calcDefaultName', async (_, templateId:string) => await AvatarService.calcDefaultName(templateId).pipe(Effect.catchAll(showAlertIfFatal('calcDefaultName')), aiRuntime.runPromise));

ipcMain.handle('getLocale',  (_) => app.getLocale());

ipcMain.handle('findInPage',  async (_,avatarId:string,text:string) => await AvatarService.findInPage(avatarId,text).pipe(Effect.catchAll(showAlertIfFatal('findInPage')), aiRuntime.runPromise));


app.on('ready', async () => {
  console.log('start app');
  await ConfigService.getSysConfig().pipe(
    Effect.andThen(a =>  McpService.reset(a)),
    Effect.andThen(a => {
      console.log('MCP init done');
      app.emit('second-instance');
      return Effect.succeed(a);
    }),
    Effect.catchAll(showAlertIfFatal('MCP init')),
    aiRuntime.runPromise)
});

app.on('browser-window-created', async (_, window) => {
  electronLog.log('browser-window-created');
  await Effect.gen(function* () {
    // console.log('browser-window-created inner start:');
    yield *Effect.async<boolean>(resume => {
      window.webContents.on('did-finish-load', () => {
        // console.log('receive did-finish-load')
        resume(Effect.succeed(true));
      });
    }).pipe(Effect.timeoutOption('10 seconds'))  //  TODO 初期ウィンドウの生成とアプリ全体準備にかかる時間の問題を暫定回避。。
    electronLog.log('browser-window-created inner end:');
    yield *AvatarService.makeAvatar(window)
    electronLog.log('browser-window-created end:');
    window.show()
    window.focus()
  }).pipe(Effect.catchAll(showAlertIfFatal('browser-window-created')),aiRuntime.runPromise);

});


// const program = Effect.gen(function* () {
//   yield* Effect.log('Application started!');
//
//   yield* Effect.log('Application is about to exit!');
// });
//
// // Running with the default logger
// //Effect.runFork(program)
// const scoped = Effect.scoped(program);
// aiRuntime.runFork(scoped);
