import {Effect, HashMap, Ref, SubscriptionRef} from 'effect';
import Store from 'electron-store';
import {AvatarSetting, MutableSysConfig, SysConfig, SysConfigMutable} from '../../common/Def.js';
import {app} from 'electron';
// import {debugAvatarConfig, debugMutableSetting, debugSysConfig} from '../../../tools/debugConfig.js';
import {defaultAvatarSetting, defaultMutableSetting, defaultSysSetting} from '../../common/DefaultSetting.js';
import short from 'short-uuid';
import path from 'node:path';
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {vitestAvatarConfig, vitestSysConfig} from '../../../tools/vitestConfig.js';
import {ContextGeneratorSetting, GeneratorProvider} from '../../common/DefGenerators.js';
import {openAiImageGenerator, openAiTextGenerator, openAiVoiceGenerator} from './OpenAiGenerator.js';
import {GeminiImageGenerator, GeminiTextGenerator, GeminiVoiceGenerator} from './GeminiGenerator.js';
import {PixAiImageGenerator} from './ImageGenarators.js';
import {ContextGenerator} from './ContextGenerator.js';
import {ClaudeTextGenerator} from './ClaudeGenerator.js';
import {EmptyImageGenerator, EmptyTextGenerator, EmptyVoiceGenerator} from './LlmGenerator.js';
//import electronLog from 'electron-log';


const debug = process.env.VITE_LOCAL_DEBUG === 'true';

const isViTest = process.env.VITEST === 'true';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const __pwd = isViTest ? path.join(__dirname, '../../..') : __dirname.endsWith('src') ? path.join(__dirname, '../..') : path.join(__dirname, '../../..');

//electronLog.log('config start:',debug,isViTest,__filename);

export class ConfigService extends Effect.Service<ConfigService>()('avatar-shell/ConfigService', {
  accessors: true,
  effect: Effect.gen(function* () {
    //electronLog.log('in config');
    const store = app ? new Store(debug ? {} : {
      encryptionKey: 'IntelligenceIsNotReasoning',  // for Obfuscation, not security
    }) : undefined;

    let sysData;
    let avatarData;
    let mutableSetting: Ref.Ref<MutableSysConfig>;
    //electronLog.log('meta',import.meta.env.DEV);
    if (import.meta.env.DEV) {
      sysData = isViTest ? vitestSysConfig : store?.get('sysConfig') as SysConfig || defaultSysSetting;
      avatarData = isViTest ? vitestAvatarConfig :
        (store?.get('avatarConfig') as {
          id: string,
          data: AvatarSetting
        }[] || defaultAvatarSetting).reduce((previousValue, currentValue) => {
          previousValue[currentValue.id] = currentValue.data;
          return previousValue;
        }, {} as Record<string, AvatarSetting>);
      mutableSetting = yield* Ref.make(store?.get('mutableSetting') as MutableSysConfig || defaultMutableSetting);
    } else {
      sysData = store?.get('sysConfig') as SysConfig || defaultSysSetting;
      avatarData = (store?.get('avatarConfig') as {
        id: string,
        data: AvatarSetting
      }[] || defaultAvatarSetting).reduce((previousValue, currentValue) => {
        previousValue[currentValue.id] = currentValue.data;
        return previousValue;
      }, {} as Record<string, AvatarSetting>);
      mutableSetting = yield* Ref.make(store?.get('mutableSetting') as MutableSysConfig || defaultMutableSetting);
    }
    //electronLog.log('meta end',sysData,avatarData);
    //const sysData = isViTest? vitestSysConfig: debug || !store ? testSysConfig : store.get('sysConfig') as SysConfig || defaultSysSetting;
    // const avatarData = isViTest ? vitestAvatarConfig: debug || !store ? testAvatarConfig :
    //   (store.get('avatarConfig') as {
    //     id: string,
    //     data: AvatarSetting
    //   }[] || defaultAvatarSetting).reduce((previousValue, currentValue) => {
    //     previousValue[currentValue.id] = currentValue.data;
    //     return previousValue;
    //   }, {} as Record<string, AvatarSetting>);

    const sysConfig: SubscriptionRef.SubscriptionRef<SysConfig> = yield* SubscriptionRef.make(sysData);
    //electronLog.log('sysConfig ref',sysConfig);

    const avatarConfigs: Ref.Ref<HashMap.HashMap<string, SubscriptionRef.SubscriptionRef<AvatarSetting>>>
      = yield* Effect.gen(function* () {
      const list = yield* Effect.forEach(Object.entries(avatarData), a => {
        return Effect.gen(function* () {
          const setting = yield* SubscriptionRef.make<AvatarSetting>(a[1] as AvatarSetting);
          return [a[0], setting] as [string, SubscriptionRef.SubscriptionRef<AvatarSetting>];
        });
      });
      // if (list.length === 0) {
      //   const one = yield* SubscriptionRef.make<AvatarSetting>({
      //     general: {
      //       name: defaultAvatarId, // default id をnameに仮置き
      //     },
      //     mcp: {},
      //   } as AvatarSetting);
      //   return yield* Ref.make(HashMap.make([defaultAvatarId, one]));
      // }
      return yield* Ref.make(HashMap.make(...list));
    });
    //electronLog.log('avatarConfigs ref',avatarConfigs);

    // const mutableSetting = yield *Ref.make(debug || !store ? testMutableSetting: store.get('mutableSetting') as MutableSysConfig || defaultMutableSetting)

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
        Effect.andThen(Effect.forEach(a1 => {
          return SubscriptionRef.get(a1).pipe(Effect.andThen(a => {
            return {
              templateId: a.templateId,
              name: a.general.name,
            };
          }));
        })),
      );
    }

    function updateSysConfig(f: (c: SysConfig) => SysConfig | SysConfigMutable) {
      console.log('updateSysConfig');
      return SubscriptionRef.updateAndGet(sysConfig, f).pipe(Effect.tap(a => {
        // console.log('ConfigService updateSysConfig:', a);
        if (store) {
          console.log('save sys:', a);
          store.set('sysConfig', a);
        }
      }));
    }

    function updateAvatarConfig(id: string, data: AvatarSetting) {
      return Ref.get(avatarConfigs).pipe(
        Effect.andThen(HashMap.get(id)),
        Effect.andThen(SubscriptionRef.update(() => {
          return data;
        })),
        Effect.andThen(saveAvatarConfigs()),
      );
    }

    function copyAvatarConfig(templateId: string) {
      const nextId = short.generate();
      return Effect.gen(function* () {
        const map = yield* Ref.get(avatarConfigs);
        const b = yield* HashMap.get(map, templateId).pipe(Effect.tap(a1 => Effect.log(a1)), Effect.andThen(a1 => a1.get));
        const copy = {...structuredClone(b)};  // readonlyをややごまかし
        copy.templateId = nextId;
        const c = yield* SubscriptionRef.make(copy);
        return yield* Ref.update(avatarConfigs, map => {
          return HashMap.mutate(map, a => HashMap.set(a, nextId, c));
        });
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
      console.log('saveAvatarConfigs');
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
            console.log('save data:', JSON.stringify(a, null, 2));
            store.set('avatarConfig', a);
          }
        }),
      );
    }

    function needWizard() {
      if (!store) return Effect.succeed(true);
      //  最低限正常に動くアバターつまりLLM定義済みのアバターが存在していればfalse 存在していなければtrue
      return avatarConfigs.get.pipe(
        Effect.andThen(a => Effect.forEach(HashMap.values(a), a1 => SubscriptionRef.get(a1))),
        Effect.andThen(a => a.every(b => b.isTemporally)),
      );
    }

    const getVersion = () => {
      return Effect.succeed(app.getVersion())
/*
      const packageJsonPath = path.resolve(__pwd, 'package.json');
      return Effect.async<string, Error>((resume) => {
        fs.readFile(packageJsonPath, {encoding: 'utf8'}, (err, data) => {
          if (err) resume(Effect.fail(err));
          else resume(Effect.succeed(data));
        });
      }).pipe(Effect.andThen(a => JSON.parse(a).version as string));
*/
    };

    const genMap:Record<GeneratorProvider, (sysConfig:SysConfig, settings?: ContextGeneratorSetting) => Effect.Effect<any,Error>> = {
      //  llm系
      'openAiText': (sysConfig,settings) => openAiTextGenerator.make(sysConfig, settings),
      'claudeText': (sysConfig,settings) => ClaudeTextGenerator.make(sysConfig, settings),
      'geminiText': (sysConfig,settings) => GeminiTextGenerator.make(sysConfig, settings),
      //  画像生成系
      'pixAi': (sysConfig,settings) => PixAiImageGenerator.make(sysConfig,settings),
      'openAiImage': (sysConfig,settings) => openAiImageGenerator.make(sysConfig, settings),
      'geminiImage': GeminiImageGenerator.make,
      //  音声合成系
      'openAiVoice': (sysConfig,settings) => openAiVoiceGenerator.make(sysConfig, settings),
      'geminiVoice': (sysConfig,settings) => GeminiVoiceGenerator.make(sysConfig, settings),
      // 'openAiVoice',
      // 'voiceVox',
      // 'nijiVoice',

      //  ダミージェネレーター
      'emptyText': (_,settings) => EmptyTextGenerator.make(settings),
      'emptyImage': (_,settings) => EmptyImageGenerator.make(settings),
      'emptyVoice': (_,settings) => EmptyVoiceGenerator.make(settings),
    }


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

    // function makeLlmGenerator(name: MainLlmSchema, sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<ContextGenerator, Error> {
    //   const gen = genMap[name];
    //   if (gen) {
    //     return gen(sysConfig, settings);
    //   }
    //   return genMap['emptyText'](sysConfig, settings);
    // }

    //electronLog.log('before config end')
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

    //electronLog.log('config end',app);

    return {
      getSysConfig,
      getSysConfigPub,
      getAvatarConfig,
      getAvatarConfigPub,
      getAvatarConfigList,
      updateSysConfig,
      updateAvatarConfig,
      copyAvatarConfig,
      deleteAvatarConfig,
      needWizard,
      getVersion,
      getMutableSetting,
      updateMutableSetting,
      getGeneratorList,
      makeGenerator,
    };

  }),
}) {
}

export const ConfigServiceLive = ConfigService.Default;
