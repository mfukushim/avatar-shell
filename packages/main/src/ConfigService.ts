/*! avatar-shell | Apache-2.0 License | https://github.com/mfukushim/avatar-shell */
import {Effect, HashMap, Ref, Schema, SubscriptionRef} from 'effect';
import Store from 'electron-store';
import {
  AvatarSetting,
  AvatarSettingMutable,
  MutableSysConfig,
  SysConfig,
  SysConfigMutable,
  SysConfigSchema,
} from '../../common/Def.js';
import {app, dialog,session} from 'electron';
import {
  defaultAvatarSetting,
  defaultMutableSetting,
  defaultSysSetting,
  emptyAvatarConfig,
} from '../../common/DefaultSetting.js';
import short from 'short-uuid';
import path from 'node:path';
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {vitestAvatarConfig, vitestSysConfig} from '../../common/vitestConfig.js';
import {ContextGeneratorSetting, GeneratorProvider} from '../../common/DefGenerators.js';
import {GeminiImageGenerator, GeminiTextGenerator, GeminiVoiceGenerator} from './generators/GeminiGenerator.js';
import {ContextGenerator, CopyGenerator} from './generators/ContextGenerator.js';
import {EmptyImageGenerator, EmptyTextGenerator, EmptyVoiceGenerator} from './generators/EmptyGenerator.js';
import {FileSystem} from '@effect/platform';
import {NodeFileSystem} from '@effect/platform-node';
import dayjs from 'dayjs';
import {OllamaTextGenerator} from './generators/OllamaGenerator.js';
import {ClaudeTextGenerator} from './generators/ClaudeGenerator.js';
import {OpenAiImageGenerator, OpenAiTextGenerator, OpenAiVoiceGenerator} from './generators/OpenAiGenerator.js';
import { rm, readdir } from 'fs/promises';

let debugConfigFile: string | undefined = undefined;

const debug = process.env.VITE_LOCAL_DEBUG === '1';
const debugWrite = process.env.VITE_LOCAL_DEBUG === '2';

const isViTest = process.env.VITEST === 'true';

const playWright = process.argv.slice(2).find(arg => arg.startsWith('--playWright='))?.split('=')[1];

if (debug) {
  debugConfigFile = '../../common/debugConfig.js';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const __pwd = isViTest ? path.join(__dirname, '../../..') : __dirname.endsWith('src') ? path.join(__dirname, '../..') : path.join(__dirname, '../../..');

const debugPath = app ? path.join(app.getPath('userData'), 'docs') : `${__pwd}/tools/docs`;

async function factoryReset(options?: {
  // ベストエフォートの安全消去（後述）
  secure?: boolean;
  // 残したいファイル/フォルダ名（userData 直下基準）
  keep?: string[];
  // electron-store 等の外部パス（フルパス）で追加削除したいもの
  extraPaths?: string[];
}) {
  const secure = options?.secure ?? false;
  const keep = new Set(options?.keep ?? []);
  const extraPaths = options?.extraPaths ?? [];

  // 1) まずブラウザ系ストレージをクリア
  //   Cookie, LocalStorage, IndexedDB, CacheStorage, ServiceWorker, WebSQL 等を対象
  try {
    await session.defaultSession.clearStorageData({
      // 必要に応じて targets を絞れる:
      // quotas: ['temporary', 'persistent', 'syncable'],
      // storages: ['cookies', 'localstorage', 'indexdb', 'shadercache', 'serviceworkers', 'cachestorage', 'websql'],
    });
    await session.defaultSession.clearCache();
  } catch (e) {
    console.warn('clearStorageData/clearCache 失敗:', e);
  }

  // 2) ユーザーデータ/キャッシュ/ログの物理削除
  const userData = app.getPath('userData');
  console.log('userData:', userData);
  // const cache = app.getPath('cache');
  const logs = app.getPath('logs');
  console.log('logs:', logs);

  // userData 直下の一部を残したい場合（ライセンスキー等）は個別削除に切替
  const deletes: string[] = [];
  // const { readdir, lstat } = await import('fs/promises');
  const items = await readdir(userData);
  for (const name of items) {
    if (keep.has(name)) continue;
    deletes.push(path.join(userData, name));
  }

  // キャッシュ/ログ/追加の外部パス
  // deletes.push(cache);
  deletes.push(logs, ...extraPaths);
  console.log('deletes:', deletes.join('\n'));
  // 実削除
  for (const p of deletes) {
    try {
      await rm(p, { recursive: true, force: true });
    } catch (e) {
      console.warn('rm 失敗:', p, e);
    }
  }
  app.exit(0);

  // 3) （任意）ベストエフォート安全消去（上書き）
  //    ※ SSD のウェアレベリング等で保証は不可。実施するなら特定ファイルだけに限定を推奨。
  if (secure && keep.size === 0) {
    // 例: “残したいもの以外”で特定の既知ファイルを乱数で1回上書きしてから削除する処理を
    //     専用関数で組み込む。ここでは割愛。
  }
}

// IPC エンドポイント（レンダラーからのコマンド）
/*
ipcMain.handle('factory-reset', async (evt, args: { confirm?: boolean }) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!args?.confirm) {
    const result = await dialog.showMessageBox(win ?? null, {
      type: 'warning',
      buttons: ['初期化する', 'キャンセル'],
      defaultId: 0,
      cancelId: 1,
      title: '工場出荷状態に戻す',
      message: 'ユーザーデータがすべて削除され、アプリは再起動します。よろしいですか？',
      noLink: true,
    });
    if (result.response !== 0) return { canceled: true };
  }

  // すべてのウィンドウを閉じてから実行（書込み競合回避）
  BrowserWindow.getAllWindows().forEach(w => w.destroy());

  await factoryReset({
    secure: false,        // 必要に応じて true
    keep: [],             // 例: ['license.key'] などを残す場合
    extraPaths: [],       // 例: electron-store の個別ファイルパス
  });

  // 再起動
  app.relaunch();
  app.exit(0);
  return { ok: true };
});
*/

export class ConfigService extends Effect.Service<ConfigService>()('avatar-shell/ConfigService', {
  accessors: true,
  effect: Effect.gen(function* () {
    let sysData: SysConfig;
    let avatarData: Record<string, AvatarSetting>;
    let mutableSetting: Ref.Ref<MutableSysConfig> = yield* Ref.make(defaultMutableSetting);
    let store: Store | undefined = undefined;

    if (debugConfigFile) {
      sysData = yield* Effect.tryPromise(() => {
        return import(debugConfigFile);
      }).pipe(Effect.andThen(a => a.defaultSysSetting as SysConfig));
      console.log('sysData:', sysData);
      avatarData = yield* Effect.tryPromise(() => {
        return import(debugConfigFile);
      }).pipe(Effect.andThen(a => a.defaultAvatarSetting as Record<string, AvatarSetting>));
      console.log('avatarData:', avatarData);
    } else if (isViTest) {
      sysData = vitestSysConfig;
      avatarData = vitestAvatarConfig;
    } else if (playWright) {
      sysData = defaultSysSetting;
      avatarData = emptyAvatarConfig;
    } else if (app) {
      store = new Store(debug ? {} : {
        encryptionKey: 'IntelligenceIsNotReasoning',  // for Obfuscation, not security
      });
      sysData = store?.get('sysConfig') as SysConfig || defaultSysSetting;
      avatarData = (store?.get('avatarConfig') as {
        id: string,
        data: AvatarSetting
      }[] || defaultAvatarSetting).reduce((previousValue, currentValue) => {
        previousValue[currentValue.id] = currentValue.data;
        return previousValue;
      }, {} as Record<string, AvatarSetting>);
      mutableSetting = yield* Ref.make(store.get('mutableSetting') as MutableSysConfig);
    } else {
      sysData = defaultSysSetting;
      avatarData = defaultAvatarSetting.reduce((previousValue, currentValue) => {
        previousValue[currentValue.id] = currentValue.data;
        return previousValue;
      }, {} as Record<string, AvatarSetting>);
    }

    const fs = yield* FileSystem.FileSystem;

    const sysConfig: SubscriptionRef.SubscriptionRef<SysConfig> = yield* SubscriptionRef.make(sysData);

    const avatarConfigs: Ref.Ref<HashMap.HashMap<string, SubscriptionRef.SubscriptionRef<AvatarSetting>>>
      = yield* Effect.forEach(Object.entries(avatarData), a =>
      SubscriptionRef.make<AvatarSetting>(a[1] as AvatarSetting).pipe(Effect.andThen(a1 => [a[0], a1] as [string, SubscriptionRef.SubscriptionRef<AvatarSetting>]))).pipe(
      Effect.andThen(a => Ref.make(HashMap.make(...a))));

    function getMutableSetting() {
      return mutableSetting.get;
    }

    function updateMutableSetting(setting: MutableSysConfig) {
      return Ref.update(mutableSetting, a => ({
        ...a,
        ...setting,
      }));
    }

    function getSysConfigPub() {
      return Effect.succeed(sysConfig);
    }

    function getSysConfig() {
      return SubscriptionRef.get(sysConfig);
    }

    function getAvatarConfigPub(id: string) {
      return Ref.get(avatarConfigs).pipe(Effect.andThen(HashMap.get(id)), Effect.catchAll(e => Effect.fail(new Error(`getAvatarConfigPub ${e.message}`))));
    }

    function getAvatarConfig(id: string) {
      return Ref.get(avatarConfigs).pipe(Effect.andThen(HashMap.get(id)), Effect.andThen(SubscriptionRef.get));
    }

    function getAvatarConfigList() {
      return Ref.get(avatarConfigs).pipe(Effect.andThen(a => HashMap.values(a)),
        Effect.andThen(Effect.forEach(a1 =>
          SubscriptionRef.get(a1).pipe(Effect.andThen(a => ({
            templateId: a.templateId,
            name: a.general.name,
          }))))),
      );
    }

    function updateSysConfig(f: (c: SysConfig) => SysConfig | SysConfigMutable) {
      return SubscriptionRef.updateAndGet(sysConfig, f).pipe(Effect.tap(a => {
        if (store) {
          store.set('sysConfig', a);
        }
        if (debugWrite) {
          return fs.writeFileString(path.join(debugPath, 'debugSys.json'), JSON.stringify(a, null, 2));
        }
      }));
    }

    function importSysConfig(loadPath?: string) {
      return Effect.gen(function* () {
        let path = loadPath;
        if (!path) {
          const {filePaths, canceled} = yield* Effect.tryPromise(signal => dialog.showOpenDialog({
            title: 'import System settings',
            buttonLabel: 'Load',
            filters: [
              {name: 'json Files', extensions: ['json']},
            ],
          }));
          if (canceled) {
            return yield* Effect.fail(new Error('Canceled'));
          }
          path = filePaths[0];
        }
        return yield* fs.readFileString(path).pipe(Effect.andThen(a => SubscriptionRef.updateEffect(sysConfig, b => Schema.decodeUnknown(Schema.parseJson(SysConfigSchema))(a))),
          Effect.catchAll(e => {
            return Effect.tryPromise(() => dialog.showMessageBox({
              title: 'Error',
              message: `System setting import error`,
              detail: 'There is no data format migration yet. Sorry for the inconvenience.',
              buttons: ['ok'],
              defaultId: 0,
            }));
          }));
      });
    }

    function importAvatar(loadPath?: string) {
      return Effect.gen(function* () {
        let path = loadPath;
        if (!path) {
          const ret = yield* Effect.tryPromise(() => dialog.showOpenDialog({
            title: 'import Avatar settings',
            buttonLabel: 'Load',
            filters: [
              {name: 'json Files', extensions: ['json']},
            ],
          }));
          if (ret.canceled) {
            return yield* Effect.fail(new Error('Canceled'));
          }
          path = ret.filePaths[0];
        }
        return yield* fs.readFileString(path).pipe(
          Effect.andThen(a1 => Schema.decodeUnknown(Schema.parseJson(AvatarSetting))(a1)),
          Effect.andThen(config => {
            return Effect.gen(function* () {
              const dup = yield* avatarConfigs.get.pipe(Effect.andThen(a3 => HashMap.has(a3, config.templateId)));
              if (dup) {
                //  id重複がある 確認ダイアログはalertMainを使うとちょっと深すぎるのでelectron dialogを使う
                const res = yield* Effect.tryPromise(signal => dialog.showMessageBox({
                  title: 'Confirm',
                  message: 'AvatarTemplateId already exists. Do you want to overwrite it?',
                  buttons: ['overwrite', 'skip'],
                  defaultId: 0,
                  cancelId: 1,
                }));
                if (res.response !== 0) {
                  return yield* Effect.fail(new Error('canceled'));
                }
              }
              const c = yield* SubscriptionRef.make(config);
              return yield* Ref.update(avatarConfigs, cfMap => {
                return HashMap.mutate(cfMap, a2 => HashMap.set(a2, config.templateId, c));
              });
            });
          }),
          Effect.catchAll(e => {
            return Effect.tryPromise(() => dialog.showMessageBox({
              title: 'Error',
              message: `Avatar setting import error`,
              detail: 'There is no data format migration yet. Sorry for the inconvenience.',
              buttons: ['ok'],
              defaultId: 0,
            }));
          }),
        );
      });
    }

    function exportSysConfig(savePath?: string) {
      return Effect.gen(function* () {
        let path = savePath;
        if (!path) {
          const {filePath, canceled} = yield* Effect.tryPromise(signal => dialog.showSaveDialog({
            title: 'export System settings',
            defaultPath: `asSys_${dayjs().format('YYYYMMDD_HHmmss')}.json`,
            buttonLabel: 'Save',
            filters: [
              {name: 'json Files', extensions: ['json']},
              {name: 'All Files', extensions: ['*']},
            ],
          }));
          if (canceled) {
            return yield* Effect.void;
          }
          path = filePath;
        }
        yield* sysConfig.get.pipe(Effect.andThen(a => fs.writeFileString(path, JSON.stringify(a, null, 2))));
      });
    }

    function exportAvatar(templateId: string, savePath?: string) {
      return Effect.gen(function* () {
        let path = savePath;
        const setting = yield* avatarConfigs.get.pipe(Effect.andThen(HashMap.get(templateId)), Effect.andThen(a => a.get));
        if (!path) {
          const {filePath, canceled} = yield* Effect.tryPromise(signal => dialog.showSaveDialog({
            title: `export ${setting.general.name} settings`,
            defaultPath: `asAvt_${setting.general.name}_${dayjs().format('YYYYMMDD_HHmmss')}.json`,
            buttonLabel: 'Save',
            filters: [
              {name: 'json Files', extensions: ['json']},
              {name: 'All Files', extensions: ['*']},
            ],
          }));
          if (canceled) {
            return yield* Effect.void;
          }
          path = filePath;
        }
        yield* fs.writeFileString(path, JSON.stringify(setting, null, 2));
      });

    }

    /*
        function updateAvatarConfigEffect(templateId: string, f: (c: AvatarSetting) => Effect.Effect<AvatarSetting | AvatarSettingMutable, Error, any>) {
          return Ref.get(avatarConfigs).pipe(
            Effect.andThen(HashMap.get(templateId)),
            Effect.andThen(SubscriptionRef.updateAndGetEffect(f)),
            Effect.tap(a => {
              if (debugWrite) {
                return fs.writeFileString(path.join(debugPath, `debugAvatar_${templateId}.json`), JSON.stringify(a, null, 2));
              }
            }),
            Effect.andThen(saveAvatarConfigs()),
          );
        }
    */

    function setAvatarConfig(id: string, data: AvatarSetting) {
      return Effect.gen(function* () {
        // const updated = yield *McpService.updateAvatarMcpSetting(data) //  TODO ここでMcpServiceを使うと依存性の順序が崩れるようだ。。
        return yield* Ref.get(avatarConfigs).pipe(
          Effect.andThen(HashMap.get(id)),
          Effect.andThen(SubscriptionRef.update(() => {
            return data;
          })),
          Effect.andThen(saveAvatarConfigs()),
        );
      });
    }

    function copyAvatarConfig(templateId: string) {
      const nextId = short.generate();
      return Effect.gen(function* () {
        const map = yield* Ref.get(avatarConfigs);
        const b = yield* HashMap.get(map, templateId).pipe(Effect.tap(a1 => Effect.log(a1)), Effect.andThen(a1 => a1.get));
        const dc = structuredClone(b);
        const copy: AvatarSettingMutable = {
          ...dc,
          general: {
            ...dc.general,
            name: dc.general.name + '_cp',
          },
        };  // readonlyをややごまかし
        copy.templateId = nextId;
        const c = yield* SubscriptionRef.make(copy);
        yield* Ref.update(avatarConfigs, map => {
          return HashMap.mutate(map, a => HashMap.set(a, nextId, c));
        });
        yield* saveAvatarConfigs();
      }).pipe(
        Effect.andThen(() => nextId as string));
    }

    function deleteAvatarConfig(templateId: string) {
      return Effect.gen(function* () {
        return yield* Ref.update(avatarConfigs, map => {
          return HashMap.mutate(map, a => HashMap.remove(a, templateId));
        });
      }).pipe(Effect.andThen(saveAvatarConfigs()));
    }

    function saveAvatarConfigs() {
      return avatarConfigs.pipe(
        Effect.andThen(HashMap.entries),
        Effect.andThen(a => Array.from(a)),
        Effect.andThen(Effect.forEach(a => {
          return Effect.all({
            id: Effect.succeed(a[0]),
            data: a[1],
          });
        })),
        Effect.andThen(a => {
          if (store) {
            store.set('avatarConfig', a);
          }
        }),
      );
    }

    function needWizard() {
      if (playWright) return Effect.succeed(playWright === 'wiz');
      if (!store) return Effect.succeed(true);
      //  最低限正常に動くアバターつまりLLM定義済みのアバターが存在していればfalse 存在していなければtrue
      return avatarConfigs.get.pipe(
        Effect.andThen(a => Effect.forEach(HashMap.values(a), a1 => SubscriptionRef.get(a1))),
        Effect.andThen(a => a.every(b => b.isTemporally)),
      );
    }

    const getVersion = () => {
      return Effect.succeed(app.getVersion());
    };

    function getPreferencePath() {
      return store ? path.dirname(store.path) : undefined;
    }

    function resetPreference(all = false) {
      return Effect.tryPromise(() => dialog.showMessageBox({
        title: 'Confirm',
        message: app?.getLocale() === 'ja' ? '初期化してよいですか' : 'Can I initialize it?',
        // detail: 'There is no data format migration yet. Sorry for the inconvenience.',
        buttons: ['Cancel', 'Initialize'],
        defaultId: 0,
      })).pipe(Effect.andThen(a => {
        if (a.response === 1) {
          return factoryReset({keep: all ? undefined:['docs']});
        }
        return Effect.void;
      }));
    }

    const genMap: Record<GeneratorProvider, (sysConfig: SysConfig, settings?: ContextGeneratorSetting) => Effect.Effect<any, Error>> = {
      //  llm系
      'openAiText': (sysConfig, settings) => OpenAiTextGenerator.make(sysConfig, settings),
      'claudeText': (sysConfig, settings) => ClaudeTextGenerator.make(sysConfig, settings), //ClaudeTextGenerator.make(sysConfig, settings),
      'geminiText': (sysConfig, settings) => GeminiTextGenerator.make(sysConfig, settings),
      'ollamaText': (sysConfig, settings) => OllamaTextGenerator.make(sysConfig, settings),
      //  画像生成系
      'pixAi': (sysConfig, settings) => EmptyImageGenerator.make(sysConfig,settings), //PixAiImageGenerator.make(sysConfig, settings),
      'openAiImage': (sysConfig, settings) => OpenAiImageGenerator.make(sysConfig, settings),
      'geminiImage': GeminiImageGenerator.make,
      //  音声合成系
      'openAiVoice': (sysConfig, settings) => OpenAiVoiceGenerator.make(sysConfig, settings),
      'geminiVoice': (sysConfig, settings) => GeminiVoiceGenerator.make(sysConfig, settings),
      // 'openAiVoice',
      // 'voiceVox',
      // 'nijiVoice',
      //  コピージェネレーター
      'copy': (sysConfig) => CopyGenerator.make(sysConfig),

      //  ダミージェネレーター
      'emptyText': (sysConfig, settings) => EmptyTextGenerator.make(sysConfig,settings),
      'emptyImage': (sysConfig, settings) => EmptyImageGenerator.make(sysConfig,settings),
      'emptyVoice': (sysConfig, settings) => EmptyVoiceGenerator.make(sysConfig,settings),
    };


    const generatorList = Object.keys(genMap);

    function getGeneratorList() {
      return generatorList;
    }

    function makeGenerator(name: GeneratorProvider, sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<ContextGenerator, Error> {
      const gen = genMap[name];
      if (gen) {
        return gen(sysConfig, settings);
      }
      return Effect.fail(new Error('unknown generator'));
    }

    if (app) {
      app.setAboutPanelOptions({
        applicationName: 'Avatar Shell',
        applicationVersion: yield* getVersion(),
        copyright: '© 2025 Masahiro Fukushima',
        authors: ['Masahiro Fukushima'],
        website: 'https://akibakokoubou.jp/',
        // iconPath: __dirname + '/assets/icon.png', // PNG形式のみ macOS用
      });
    }

    return {
      getSysConfig,
      getSysConfigPub,
      getAvatarConfig,
      getAvatarConfigPub,
      getAvatarConfigList,
      updateSysConfig,
      setAvatarConfig,
      exportSysConfig,
      importSysConfig,
      exportAvatar,
      importAvatar,
      // updateAvatarConfigEffect,
      copyAvatarConfig,
      deleteAvatarConfig,
      needWizard,
      getVersion,
      getMutableSetting,
      updateMutableSetting,
      getGeneratorList,
      makeGenerator,
      getPreferencePath,
      resetPreference,
    };

  }),
  dependencies: [NodeFileSystem.layer],
}) {
}

export const ConfigServiceLive = ConfigService.Default;
