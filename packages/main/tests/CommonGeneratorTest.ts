import {Effect, Layer, ManagedRuntime} from 'effect';
import {McpService, McpServiceLive} from '../src/McpService';
import {vitestAvatarConfigNone, vitestSysConfig} from '../../common/vitestConfig';
import {ConfigService, ConfigServiceLive} from '../src/ConfigService';
import {AvatarService, AvatarServiceLive} from '../src/AvatarService';
import {AsMessage} from '../../common/Def';
import {expect} from '@effect/vitest';
import {MediaServiceLive} from '../src/MediaService';
import {DocServiceLive} from '../src/DocService';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {NodeFileSystem} from '@effect/platform-node';
import {GeneratorProvider} from '../../common/DefGenerators';
import {FetchHttpClient} from '@effect/platform';

const AppLive = Layer.mergeAll(MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive,
  BuildInMcpServiceLive,AvatarServiceLive, NodeFileSystem.layer,FetchHttpClient.layer)
const aiRuntime = ManagedRuntime.make(AppLive);


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



export async function contextStepTest1(generatorName:GeneratorProvider,expectedStep:number,modelName?:string) {
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
          // copyContext: true,
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
          generator: generatorName,
          setting: {toClass: 'talk', toRole: 'bot', toContext: 'surface',useModel:modelName},
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
    expect(params.length).toBe(expectedStep);
  }).pipe(
    aiRuntime.runPromise,
  );

}

export async function contextStepTest2(generatorName:GeneratorProvider,expectedStep:number) {
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
            // copyContext: true,
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
              generator: generatorName,
              // copyContext: false,
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
    const params = yield* avatarState.TalkContextEffect;
    console.log('context:', params);
    expect(params.length).toBe(expectedStep);

  }).pipe(
    aiRuntime.runPromise,
  );

}

export async function contextStepTest3(generatorName:GeneratorProvider,expectedStep:number) {
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
              // copyContext: true,
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
                generator: generatorName,
                // copyContext: false,
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
    expect(params.length).toBe(expectedStep);

  }).pipe(
    aiRuntime.runPromise,
  );

}

export async function contextStepTest4(generatorName:GeneratorProvider,expectedStep:number) {
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
              // copyContext: true,
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
                generator: generatorName,
                // copyContext: false,
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
    expect(params.length).toBe(expectedStep);

  }).pipe(
    aiRuntime.runPromise,
  );

}

export async function contextStepTest5(generatorName:GeneratorProvider,expectedStep:number) {
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
            // copyContext: true,
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
            generator: generatorName,
            // copyContext: false,
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
    expect(params.length).toBe(expectedStep);

  }).pipe(
    aiRuntime.runPromise,
  );

}

export async function contextStepTest6(generatorName:GeneratorProvider,expectedStep:number,waitTime:number = 30) {
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
            // copyContext: true,
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
            generator: generatorName,
            // copyContext: false,
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

    yield* Effect.sleep(`${waitTime} seconds`);

    const params = yield* avatarState.TalkContextEffect;
    console.log('context:', params.map(a => AsMessage.debugLog(a)).join('\n'));
    expect(params.length).toBe(expectedStep);

  }).pipe(
    aiRuntime.runPromise,
  );
}

export async function contextStepTest7(generatorName:GeneratorProvider,expectedStep:number) {
  await Effect.gen(function* () {
    yield* McpService.reset(vitestSysConfig);
    yield* Effect.sleep('1 seconds');

    const vitestConf = {
      ...vitestAvatarConfigNone,
      mcp: {
        reversi: {
          enable: true,
          useTools: {
            "new-game": {
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
      daemons: vitestAvatarConfigNone.daemons.concat([        {
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
            // copyContext: true,
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
            generator: generatorName,
            setting: {
              toClass: 'talk',
              toRole: 'bot',
              toContext: 'surface',
            },
          },
        }],
      ),
    };
    //  @ts-ignore
    yield* ConfigService.setAvatarConfig('vitestNoneId', vitestConf);

    yield* AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'});
    const avatarState = yield* AvatarService.makeAvatar(null);
    yield* Effect.sleep('1 seconds');

    const res = yield* AvatarService.askAvatar(avatarState.Id, [AsMessage.makeMessage({
      from: 'user',
      text: '/new game',
      isExternal: true,
    }, 'talk', 'human', 'outer')]);
    console.log('askAvatar:', res);

    yield* Effect.sleep('30 seconds');

    const normalTalk = (yield* avatarState.ScheduleList).find(d => d.name === 'normalTalk');

    const res2 = yield *avatarState.callMcpToolByExternal({
      callId: '123',
      name: 'reversi_select-user',
      input: {
        move:'D3'
      }
    },normalTalk.genId)
    console.log('callMcpToolByExternal:',res2);

    yield* Effect.sleep('60 seconds');
    // const res2 = yield* AvatarService.askAvatar(avatarState.Id, [AsMessage.makeMessage({
    //   from: 'user',
    //   text: '/new game',
    //   isExternal: true,
    // }, 'talk', 'human', 'outer')]);
    // console.log('askAvatar:', res2);

    const params = yield* avatarState.TalkContextEffect;
    console.log('context:', params.map(a => AsMessage.debugLog(a)).join('\n'));
    expect(params.length).toBe(expectedStep);

  }).pipe(
    aiRuntime.runPromise,
  );

}
