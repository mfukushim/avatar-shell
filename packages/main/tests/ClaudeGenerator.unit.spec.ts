//  注意: インポート順序に順序があるようだ。誤るとAvatarState.makeでエラーになる
import {Effect, Layer, ManagedRuntime} from 'effect';
import {runPromise} from 'effect/Effect';
import {it, expect, describe, beforeEach} from '@effect/vitest';
import {AvatarState} from '../src/AvatarState';
import {ConfigService, ConfigServiceLive} from '../src/ConfigService';
import {McpService, McpServiceLive} from '../src/McpService';
import {DocService, DocServiceLive} from '../src/DocService';
import {MediaServiceLive} from '../src/MediaService';
import {vitestAvatarConfigNone, vitestSysConfig} from '../../common/vitestConfig';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {NodeFileSystem} from '@effect/platform-node';
import {FileSystem} from '@effect/platform';
import path from 'node:path';
import {AvatarService, AvatarServiceLive} from '../src/AvatarService';
import {ClaudeTextGenerator} from '../src/generators/ClaudeGenerator';
import {AsMessage} from '../../common/Def';

const cwd = process.cwd();
let baseDir = cwd;
if (cwd.endsWith('main')) {
  baseDir = path.join(baseDir, '../..');
}

const AppLive = Layer.mergeAll(MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, AvatarServiceLive, NodeFileSystem.layer);
const aiRuntime = ManagedRuntime.make(AppLive);

describe('ClaudeGenerator', () => {
  beforeEach(() => {
  });

  it('make', async () => {
    const ai = await ClaudeTextGenerator.make(vitestSysConfig).pipe(runPromise);

    console.log(ai);
    expect(typeof ai === 'object').toBe(true);
  });

  it('generateContext_text', async () => {
    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない

      const ai = yield* ClaudeTextGenerator.make(vitestSysConfig);

      return yield* ai.generateContext({
        avatarId: 'aaaa', toGenerator: ai, fromGenerator: 'external',
        input: AsMessage.makeMessage({
          innerId: '1234567890',
          text: 'hello',
        }, 'talk', 'human', 'surface'),
        genNum: 0,
      }, avatarState);
    }).pipe(aiRuntime.runPromise);

    console.log('out:', res);
    expect(typeof res === 'object').toBe(true);
  });

  it('generateContext_image', async () => {
    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない

      const ai = yield* ClaudeTextGenerator.make(vitestSysConfig);

      // const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const fs = yield* FileSystem.FileSystem;
      const file = yield* fs.readFile(path.join(baseDir, 'tests_fixtures/1758692794_planeImage.png'));
      const testImageBase64 = Buffer.from(file).toString('base64');

      const url = yield* DocService.saveDocMedia('123', 'image/png', testImageBase64, 'vitestDummyId');
      return yield* ai.generateContext({
        avatarId: 'aaaa', toGenerator: ai, fromGenerator: 'external',
        input: AsMessage.makeMessage({
          innerId: '1234567890',
          mediaUrl: url,
          mimeType: 'image/png',  //  mimeの指定は必須にしている
          text: 'What is in the picture?',
        }, 'talk', 'human', 'surface'),
        genNum: 0,
      }, avatarState);
    }).pipe(aiRuntime.runPromise);


    console.log(res);
    expect(typeof res === 'object').toBe(true);
  });

  //  現時点ファイルはimageのみ想定っぽい。テキストファイルは展開してプロンプト扱いにしていたはず。
  // it('generateContext_text_file', async () => {
  //   const res = await Effect.gen(function* () {
  //     const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
  //     // console.log(avatarState);
  //     yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
  //
  //     const ai = yield* OllamaTextGenerator.make({
  //       host: "http://192.168.11.121:11434",
  //       model: "llava:7b-v1.6"
  //     });
  //
  //     // const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  //     const fs = yield* FileSystem.FileSystem;
  //     const file = yield *fs.readFileString(path.join(baseDir,'tests_fixtures/q1.txt'));
  //
  //     const url = yield *DocService.saveDocMedia('123', 'image/png', testImageBase64, 'vitestDummyId')
  //     return yield *ai.generateContext({avatarId:'aaaa',toGenerator:'ollamaText',input:{
  //         innerId: '1234567890',
  //         mediaUrl: url,
  //         mimeType: 'image/png',  //  mimeの指定は必須にしている
  //         text: 'What is in the picture?',
  //       }
  //     } as GenInner, avatarState);
  //   }).pipe(aiRuntime.runPromise,);
  //   console.log(res);
  //   expect(typeof res === 'object').toBe(true);
  // });

  function setupNormalTalkTest(vitestConf: any) {
    return Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield* Effect.sleep('1 seconds');

      yield* ConfigService.setAvatarConfig('vitestNoneId', vitestConf);

      yield* AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'});
      const avatarState = yield* AvatarService.makeAvatar(null);

      yield* Effect.sleep('1 seconds');

      const pickOuter = (yield* avatarState.ScheduleList).find(d => d.name === 'pickOuter');
      const gen = yield* avatarState.getDefGenerator(pickOuter.genId);
      return {avatarState, gen};
    });
  }

  it('コンテキストステップ確認1', async () => {
    await Effect.gen(function* () {
      const {avatarState, gen} = yield* setupNormalTalkTest({
        ...vitestAvatarConfigNone,
        mcp: {},
        daemons: vitestAvatarConfigNone.daemons.concat([{
          'id': 'aaaa',
          'name': 'pickOuter',
          'isEnabled': true,
          'trigger': {
            'triggerType': 'IfContextExists',
            'condition': {asClass: 'talk', asRole: 'human', asContext: 'outer'},
          },
          'exec': {
            copyContext: true,
            generator: 'copy',/* templateGeneratePrompt: '{body}', */
            setting: {toClass: 'talk', toRole: 'human', toContext: 'surface'},
          },
        }, {
          id: 'xx1',
          name: 'normalTalk',
          isEnabled: true,
          trigger: {
            triggerType: 'IfContextExists',
            condition: {asClass: 'talk', asRole: 'human', asContext: 'surface'},
          },
          exec: {
            generator: 'claudeText',
            copyContext: false,/* directTrigger: true, */
            setting: {toClass: 'talk', toRole: 'bot', toContext: 'surface'},
          },
        }]),
      });

      yield* AvatarService.addExtTalkContext(avatarState.Id, [
        AsMessage.makeMessage({
          from: 'user',
          text: 'hello',
          isExternal: true,
        }, 'talk', 'human', 'outer'),
      ]);

      yield* Effect.sleep('30 seconds');

      const params = yield* avatarState.TalkContextEffect;
      console.log('context:', params);
      expect(params.length).toBe(4);

    }).pipe(
      aiRuntime.runPromise,
    );
  });

  it('コンテキストステップ確認2', async () => {
    await Effect.gen(function* () {
      const {avatarState, gen} = yield* setupNormalTalkTest({
        ...vitestAvatarConfigNone,
        daemons: vitestAvatarConfigNone.daemons.concat([{
            'id': 'aaaa',
            'name': 'pickOuter',
            'isEnabled': true,
            'trigger': {
              'triggerType': 'IfContextExists', 'condition': {
                asClass: 'talk',
                asRole: 'human',
                asContext: 'outer',
              },
            },
            'exec': {
              copyContext: true,
              generator: 'copy',
              // templateGeneratePrompt: '{body}',
              setting: {
                toClass: 'talk',
                toRole: 'human',
                toContext: 'surface',
              },
            },
          },
            {
              id: 'xx1',
              name: 'normalTalk',
              isEnabled: true,
              trigger: {
                triggerType: 'IfContextExists',
                condition: {
                  asClass: 'talk',
                  asRole: 'human',
                  asContext: 'surface',
                },
              },
              exec: {
                generator: 'claudeText',
                copyContext: false,
                // directTrigger: true,
                setting: {
                  toClass: 'talk',
                  toRole: 'bot',
                  toContext: 'surface',
                },
              },
            }],
        ),
      });

      yield* AvatarService.addExtTalkContext(avatarState.Id, [
        AsMessage.makeMessage({
          from: 'user',
          text: '/get traveler tips',
          isExternal: true,
        }, 'talk', 'human', 'outer'),
      ]);

      yield* Effect.sleep('20 seconds');

      console.log('context:', yield* avatarState.TalkContextEffect);

    }).pipe(
      aiRuntime.runPromise,
    );
  });

  it('コンテキストステップ確認3', async () => {
    await Effect.gen(function* () {
      const {avatarState, gen} = yield* setupNormalTalkTest({
          ...vitestAvatarConfigNone,
          mcp: {},
          daemons: vitestAvatarConfigNone.daemons.concat([{
              'id': 'aaaa',
              'name': 'pickOuter',
              'isEnabled': true,
              'trigger': {
                'triggerType': 'IfContextExists', 'condition': {
                  asClass: 'talk',
                  asRole: 'human',
                  asContext: 'outer',
                },
              },
              'exec': {
                copyContext: true,
                generator: 'copy',
                // templateGeneratePrompt: '{body}',
                setting: {
                  toClass: 'talk',
                  toRole: 'human',
                  toContext: 'surface',
                },
              },
            },
              {
                id: 'xx1',
                name: 'normalTalk',
                isEnabled: true,
                trigger: {
                  triggerType: 'IfContextExists',
                  condition: {
                    asClass: 'talk',
                    asRole: 'human',
                    asContext: 'surface',
                  },
                },
                exec: {
                  generator: 'claudeText',
                  copyContext: false,
                  // directTrigger: true,
                  setting: {
                    toClass: 'talk',
                    toRole: 'bot',
                    toContext: 'surface',
                  },
                },
              }],
          ),
        },
      );

      const res = yield* AvatarService.askAvatar(avatarState.Id, [AsMessage.makeMessage({
        from: 'user',
        text: 'hello',
        isExternal: true,
      }, 'talk', 'human', 'outer')]);
      console.log('askAvatar:', res);

      yield* Effect.sleep('30 seconds');

      const params = yield* avatarState.TalkContextEffect;
      console.log('context:', params);
      expect(params.length).toBe(4);

    }).pipe(
      aiRuntime.runPromise,
    );
  });

  it('コンテキストステップ確認4', async () => {
    await Effect.gen(function* () {
      const {avatarState, gen} = yield* setupNormalTalkTest({
          ...vitestAvatarConfigNone,
          mcp: {},
          daemons: vitestAvatarConfigNone.daemons.concat([{
              'id': 'aaaa',
              'name': 'pickOuter',
              'isEnabled': true,
              'trigger': {
                'triggerType': 'IfContextExists', 'condition': {
                  asClass: 'talk',
                  asRole: 'human',
                  asContext: 'outer',
                },
              },
              'exec': {
                copyContext: true,
                generator: 'copy',
                // templateGeneratePrompt: '{body}',
                setting: {
                  toClass: 'talk',
                  toRole: 'human',
                  toContext: 'surface',
                },
              },
            },
              {
                id: 'xx1',
                name: 'normalTalk',
                isEnabled: true,
                trigger: {
                  triggerType: 'IfContextExists',
                  condition: {
                    asClass: 'talk',
                    asRole: 'human',
                    asContext: 'surface',
                  },
                },
                exec: {
                  generator: 'claudeText',
                  copyContext: false,
                  // directTrigger: true,
                  setting: {
                    toClass: 'talk',
                    toRole: 'bot',
                    toContext: 'surface',
                  },
                },
              }],
          ),
        },
      );
      yield* Effect.sleep('1 seconds');

      const res = yield* AvatarService.askAvatar(avatarState.Id, [AsMessage.makeMessage({
        from: 'user',
        text: 'hello',
        isExternal: true,
      }, 'talk', 'human', 'outer')]);
      console.log('askAvatar:', res);

      yield* Effect.sleep('30 seconds');

      const res2 = yield* AvatarService.askAvatar(avatarState.Id, [AsMessage.makeMessage({
        from: 'user',
        text: 'What should I do when it\'s hot?',
        isExternal: true,
      }, 'talk', 'human', 'outer')]);
      console.log('askAvatar:', res2);

      yield* Effect.sleep('30 seconds');


      const params = yield* avatarState.TalkContextEffect;
      console.log('context:', params);
      expect(params.length).toBe(8);

    }).pipe(
      aiRuntime.runPromise,
    );
  });

  it('コンテキストステップ確認5', async () => {
    await Effect.gen(function* () {
      const {avatarState, gen} = yield* setupNormalTalkTest({
        ...vitestAvatarConfigNone,
        mcp: {
          reversi: {
            enable: true,
            useTools: {
              'new-game': {
                enable: true,
                allow: 'any',
              },
              'get-board': {
                'enable': true,
                'allow': 'any',
              },
              'select-user': {
                'enable': true,
                'allow': 'any',
              },
              'select-assistant': {
                'enable': true,
                'allow': 'any',
              },
              'session-auth': {
                'enable': true,
                'allow': 'ask',
              },
              'add': {
                'enable': true,
                'allow': 'ask',
              },
              'calculate': {
                'enable': true,
                'allow': 'ask',
              },
            },
          },
        },
        daemons: vitestAvatarConfigNone.daemons.concat([
          {
            'id': 'aaaa',
            'name': 'pickOuter',
            'isEnabled': true,
            'trigger': {
              'triggerType': 'IfContextExists', 'condition': {
                asClass: 'talk',
                asRole: 'human',
                asContext: 'outer',
              },
            },
            'exec': {
              copyContext: true,
              generator: 'copy',
              // templateGeneratePrompt: '{body}',
              setting: {
                toClass: 'talk',
                toRole: 'human',
                toContext: 'surface',
              },
            },
          }, {
            id: 'xx1',
            name: 'normalTalk',
            isEnabled: true,
            trigger: {
              triggerType: 'IfContextExists',
              condition: {
                asClass: 'talk',
                asRole: 'human',
                asContext: 'surface',
              },
            },
            exec: {
              generator: 'claudeText',
              copyContext: false,
              setting: {
                toClass: 'talk',
                toRole: 'bot',
                toContext: 'surface',
              },
            },
          }],
        ),
      });
      yield* Effect.sleep('1 seconds');

      const res = yield* AvatarService.askAvatar(avatarState.Id, [AsMessage.makeMessage({
        from: 'user',
        text: ' play reversi',
        isExternal: true,
      }, 'talk', 'human', 'outer')]);
      console.log('askAvatar:', res);

      yield* Effect.sleep('30 seconds');

      const params = yield* avatarState.TalkContextEffect;
      console.log('context:', params);
      expect(params.length).toBe(12);

    }).pipe(
      aiRuntime.runPromise,
    );
  });

  it('コンテキストステップ確認6', async () => {
    await Effect.gen(function* () {
      const {avatarState, gen} = yield* setupNormalTalkTest({
        ...vitestAvatarConfigNone,
        mcp: {
          reversi: {
            enable: true,
            useTools: {
              'new-game': {
                enable: true,
                allow: 'any',
              },
              'get-board': {
                'enable': true,
                'allow': 'any',
              },
              'select-user': {
                'enable': true,
                'allow': 'any',
              },
              'select-assistant': {
                'enable': true,
                'allow': 'any',
              },
              'session-auth': {
                'enable': true,
                'allow': 'ask',
              },
              'add': {
                'enable': true,
                'allow': 'ask',
              },
              'calculate': {
                'enable': true,
                'allow': 'ask',
              },
            },
          },
        },
        daemons: vitestAvatarConfigNone.daemons.concat([
          {
            'id': 'aaaa',
            'name': 'pickOuter',
            'isEnabled': true,
            'trigger': {
              'triggerType': 'IfContextExists', 'condition': {
                asClass: 'talk',
                asRole: 'human',
                asContext: 'outer',
              },
            },
            'exec': {
              copyContext: true,
              generator: 'copy',
              // templateGeneratePrompt: '{body}',
              setting: {
                toClass: 'talk',
                toRole: 'human',
                toContext: 'surface',
              },
            },
          }, {
            id: 'xx1',
            name: 'normalTalk',
            isEnabled: true,
            trigger: {
              triggerType: 'IfContextExists',
              condition: {
                asClass: 'talk',
                asRole: 'human',
                asContext: 'surface',
              },
            },
            exec: {
              generator: 'claudeText',
              copyContext: false,
              setting: {
                toClass: 'talk',
                toRole: 'bot',
                toContext: 'surface',
              },
            },
          }],
        ),
      });
      yield* Effect.sleep('1 seconds');

      const res = yield* AvatarService.askAvatar(avatarState.Id, [AsMessage.makeMessage({
        from: 'user',
        text: '/new game',
        isExternal: true,
      }, 'talk', 'human', 'outer')]);
      console.log('askAvatar:', res);

      yield* Effect.sleep('30 seconds');

      const params = yield* avatarState.TalkContextEffect;
      console.log('context:', params.map(a => AsMessage.debugLog(a)).join('\n'));
      expect(params.length).toBe(9);

    }).pipe(
      aiRuntime.runPromise,
    );
  });

}, 5 * 60 * 1000);
