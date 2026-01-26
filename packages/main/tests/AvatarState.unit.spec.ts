import {Effect, Layer, ManagedRuntime} from 'effect';
import {ConfigService, ConfigServiceLive} from '../src/ConfigService.js';
import {NodeFileSystem} from '@effect/platform-node';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService.js';
import {McpService, McpServiceLive} from '../src/McpService.js';
import {AvatarState} from '../src/AvatarState.js';
import {DocService, DocServiceLive} from '../src/DocService.js';
import {MediaServiceLive} from '../src/MediaService.js';
import {describe, expect, it} from '@effect/vitest';
import {AsMessage, AsOutput, AvatarSettingMutable} from '../../common/Def.js';
import dayjs from 'dayjs';
import {vitestSysConfig} from '../../common/vitestConfig.js';
import {AvatarService, AvatarServiceLive} from '../src/AvatarService.js';
import {FetchHttpClient} from '@effect/platform';

const AppLive = Layer.mergeAll(MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive,
  BuildInMcpServiceLive,AvatarServiceLive, NodeFileSystem.layer,FetchHttpClient.layer)
const aiRuntime = ManagedRuntime.make(AppLive);

describe('avatarState', () => {
  it('make', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      return yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
  });
  it('val', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      const tempId = avatarState.TemplateId;
      const name = avatarState.Name;
      const tag = avatarState.Tag;
      const avatarConfig = avatarState.Config;
      return {tempId, name, tag, avatarConfig};
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(res);
    expect(typeof res === 'object').toBeTruthy();
  });
  it('ScheduleList', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      return yield* avatarState.ScheduleList;
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
    expect(res.length === 3).toBeTruthy();
  });
  it('setNames', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      avatarState.setNames({userName: 'mfuku', avatarName: 'mi'});
      return {name: avatarState.Name, userName: avatarState.UserName};
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
    expect(res.name).toBe('mi');
    expect(res.userName).toBe('mfuku');
  });
  it('addContext', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);

      const avatarState = yield* AvatarState.make('aaaa', 'vitestNoneId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      yield* avatarState.addContext([
        AsMessage.makeMessage({
          from: 'human',
          text: 'hello',
        },'talk','human','surface')
      ]);
      return yield* avatarState.TalkContextEffect;
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
    expect(res.length).toBe(1);
  });
/*
  it('askAi', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.initial();

      const avatarState = yield* AvatarState.make('aaaa', 'vitestNoneId', 'Mix', null, 'human');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      return yield* avatarState.askAi([
        AsMessage.makeMessage({
          from: 'human',
          text: 'hello',
        })
      ]);
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
  });
*/
  it('daemonTime', async () => {
    //  vitest --run --testNamePattern=daemonTime AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      // yield* McpService.initial();

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDaemonId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      const check1 = yield* avatarState.TalkContextEffect;
      // console.log('check1',check1);
      yield* Effect.sleep('30 seconds'); //  累積35
      const check2 = yield* avatarState.TalkContextEffect;
      // console.log('check2',check2);
      yield* Effect.sleep('30 seconds'); //  累積65
      const check3 = yield* avatarState.TalkContextEffect;
      // console.log('check3',check3);
      yield* Effect.sleep('60 seconds'); //  累積125
      const check4 = yield* avatarState.TalkContextEffect;
      // console.log('check4',check4);
      return {check1, check2, check3, check4};
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(res.check1.length).toBe(2);
    expect(res.check2.length).toBe(4);
    expect(res.check3.length).toBe(6);
    expect(res.check4.length).toBe(8);
  });
  it('daemonTimeRepeat', async () => {
    //  vitest --run --testNamePattern=daemonTime AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      // yield* McpService.initial();

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDaemon2Id', 'Mix', null, 'user');
      // console.log(avatarState);

      return yield* Effect.forEach(Array.from(Array(5).keys()), a => {
        return Effect.sleep('14 seconds').pipe(Effect.andThen(a1 => avatarState.TalkContextEffect));
      });
    }).pipe(
      aiRuntime.runPromise,
    );

    res.map(a => console.log(JSON.stringify(a, null, 2)));
    expect(res[0].length).toBe(2);
    expect(res[1].length).toBe(4);
    expect(res[2].length).toBe(6);
    expect(res[3].length).toBe(8);
  });
  it('daemonDayTime', async () => {
    //  vitest --run --testNamePattern=daemonDayTime AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      // yield* McpService.initial();

      const id = 'aaaa';
      const template = 'vitestDaemon999Id';
      const avatarState = yield* AvatarState.make(id, template, 'Mix', null, 'user');
      // console.log(avatarState);
      const now = dayjs();
      const add1min = now.add(1, 'minute').format('HH:mm');
      console.log('now', now.format(), 'add1min', add1min);

      const cf = {
        ...avatarState.Config,
        daemons: [
          {
            id: 'aaab',
            name: 'TimeAdd1Min',
            isEnabled: true,
            trigger: {
              triggerType: 'DayTimeDirect',
              condition: {time: add1min},
            },
            exec: {
              generator:'emptyText',
              templateGeneratePrompt:'1 minute has passed',
              // templateContextPrompt: 'add 1 min Time',
              setting: {
                toClass:'talk',
                toRole:'bot'
              },
            },
          },
        ],
      } as AvatarSettingMutable;

      yield* ConfigService.setAvatarConfig(template, cf);

      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      const check1 = yield* avatarState.TalkContextEffect;

      yield* Effect.sleep('60 seconds'); //  累積35
      const check2 = yield* avatarState.TalkContextEffect;

      return {check1, check2};
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(res.check1.length).toBe(0);
    expect(res.check2.length).toBe(2);
  });
  it('daemonDateTime', async () => {
    //  vitest --run --testNamePattern=daemonDayTime AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      // yield* McpService.initial();

      const id = 'aaaa';
      const template = 'vitestDaemon999Id';
      const avatarState = yield* AvatarState.make(id, template, 'Mix', null, 'user');
      // console.log(avatarState);
      const now = dayjs();
      const add1min = now.add(1, 'minute').format('HH:mm');
      console.log('now', now.format(), 'add1min', add1min);

      const cf = {
        ...avatarState.Config,
        daemons: [
          {
            id: 'aaab',
            name: 'TimeAdd1Min',
            isEnabled: true,
            trigger: {
              triggerType: 'DateTimeDirect',
              condition: {time: add1min},
            },
            exec: {
              generator:'emptyText',
              templateGeneratePrompt:`It is now ${add1min}.`,
              // templateContextPrompt: 'add 1 min Time',
              setting: {
                toClass:'talk',
                toRole:'bot'
              },
            },
          },
        ],
      } as AvatarSettingMutable;

      yield* ConfigService.setAvatarConfig(template, cf);

      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      const check1 = yield* avatarState.TalkContextEffect;

      yield* Effect.sleep('60 seconds'); //  累積35
      const check2 = yield* avatarState.TalkContextEffect;

      return {check1, check2};
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(res.check1.length).toBe(0);
    expect(res.check2.length).toBe(2);
  });


  it('daemonContext', async () => {
    //  vitest --run --testNamePattern=daemonContext AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      // yield* McpService.initial();

      const id = 'aaaa';
      const template = 'vitestDaemon999Id';
      const avatarState = yield* AvatarState.make(id, template, 'Mix', null, 'user');
      // console.log(avatarState);
      const now = dayjs();
      const add1min = now.add(1, 'minute').format('HH:mm');
      console.log('now', now.format(), 'add1min', add1min);

      const cf = {
        ...avatarState.Config,
        daemons: [
          {
            id: 'aaab',
            name: 'ContextFind',
            isEnabled: true,
            trigger: {
              triggerType: 'IfContextExists',
              condition: {asClass:'talk',asRole:'human'},
            },
            exec: {
              generator:'emptyText',  //  TODO generatorに回すときのcurrentは今はclass/roleを見ないが、roleはuserにしないといけないのではないか?
              templateGeneratePrompt: 'user said {body}',
              setting: {
                debug:true,  //  ダミーログを出力させる
                previousContextSize:0,
                toClass:'daemon',
                toRole:'human'
              },
            },
          },
        ],
      } as AvatarSettingMutable;

      yield* ConfigService.setAvatarConfig(template, cf);

      yield* Effect.sleep('5 seconds');
      const check1 = yield* avatarState.TalkContextEffect;

      //  ダミーmesとlog
      const mes = AsMessage.makeMessage({
        from: 'user',
          text: 'hello',
      },'talk','human','surface');
      yield* avatarState.addContext([mes])
      yield *DocService.addLog([AsOutput.makeOutput(mes)], avatarState)


      yield* Effect.sleep('5 seconds');
      const check2 = yield* avatarState.TalkContextEffect;  //  コンテキストには呼び水のコンテキストしかない

      const log = yield *DocService.readDocument(template,avatarState.LogFileName)  //  ログには

      return {check1, check2,log};
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(res.check1.length).toBe(0);
    expect(res.check2.length).toBe(3);
    expect(res.log.length).toBe(3);
  });
  it('daemonTalkAfterMin', async () => {
    //  vitest --run --testNamePattern=daemonDayTime AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);

      const id = 'aaaa';
      const template = 'vitestDaemon999Id';
      const avatarState = yield* AvatarState.make(id, template, 'Mix', null, 'user');
      // console.log(avatarState);
      const now = dayjs();
      const add1min = now.add(1, 'minute').format('HH:mm');
      console.log('now', now.format(), 'add1min', add1min);

      const cf = {
        ...avatarState.Config,
        daemons: [
          {
            id: 'aaab',
            name: 'TalkAfterMin',
            isEnabled: true,
            trigger: {
              triggerType: 'TalkAfterMin',
              condition: {min: 0.25},
            },
            exec: {
              generator: 'emptyText',
              templateGeneratePrompt: 'Please respond to the above conversation', //  15秒後
              setting: {
                toClass:'talk',
                toRole:'bot'
              },
            },
          },
        ],
      } as AvatarSettingMutable;

      yield* ConfigService.setAvatarConfig(template, cf);

      yield* Effect.sleep('30 seconds');
      const check1 = yield* avatarState.TalkContextEffect;

      //const mes = yield *AvatarService.askAvatar(id,[makeMessage('hello')]) これでは AvatarServiceにアバター登録しなければならないので同等処理で記述する
      yield *avatarState.addContext([AsMessage.makeMessage({
        from: 'user',
        text: 'hello',
      },'talk','human','surface')])
      yield *avatarState.rebuildIdle()

      yield* Effect.sleep('5 seconds');
      const check2 = yield* avatarState.TalkContextEffect;
      yield* Effect.sleep('20 seconds');
      const check3 = yield* avatarState.TalkContextEffect;
      yield* Effect.sleep('30 seconds');
      const check4 = yield* avatarState.TalkContextEffect;

      return {check1,check2,check3,check4};
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(res.check1.length).toBe(0);
    // expect(res.mes.length).toBe(1);
    expect(res.check2.length).toBe(2);
    expect(res.check3.length).toBe(4);
    expect(res.check4.length).toBe(4);
  });

  it('execGeneratorLoop_text', async () => {
    const r = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield *Effect.sleep('1 seconds');

      yield *AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'})
      const avatarState = yield *AvatarService.makeAvatar(null)
      // yield *GeneratorService.startLoop()

      // const avatarState = yield* AvatarState.make('aaaa', 'vitestNoneId', 'Mix', null, 'user');
      // const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      yield *Effect.sleep('5 seconds');

      const gen = yield* avatarState.getDefGenerator('aaa');
      const res = yield *avatarState.enterInner({
        avatarId:avatarState.Id,
        fromGenerator:'external',
        toGenerator:gen,
        input:AsMessage.makeMessage({
          from: 'user',
          text: 'hello',
          isExternal: true,
        }, 'physics', 'human', 'inner'),
        genNum:0,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('30 seconds');

      const context = yield *avatarState.TalkContextEffect;
      console.log('context:',context)
      return context
    }).pipe(
      aiRuntime.runPromise,
    )
    console.log('r:',r);
  })
  it('addContext', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);

      const avatarState = yield* AvatarState.make('aaaa', 'vitestNoneId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      yield* avatarState.addContext([
        AsMessage.makeMessage({
          from: 'human',
          text: 'hello',
        },'talk','human','surface')
      ]);
      return yield* avatarState.TalkContextEffect;
    }).pipe(
      aiRuntime.runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
    expect(res.length).toBe(1);
  });

  it('execGeneratorLoop_text2', async () => {
    await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield *Effect.sleep('1 seconds');

      yield *AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'})
      const avatarState = yield *AvatarService.makeAvatar(null)
      // yield *GeneratorService.startLoop()
      // const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      yield *Effect.sleep('1 seconds');

      const gen = yield* avatarState.getDefGenerator('aaa');
      const res = yield *avatarState.enterInner({
        avatarId:avatarState.Id,
        fromGenerator:'external',
        toGenerator: gen,
        input:AsMessage.makeMessage({
          from: 'human',
          text: 'hello',
        },'talk','human','surface'),
        genNum:0,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('20 seconds');

      const res2 = yield *avatarState.enterInner({
        avatarId:avatarState.Id,
        fromGenerator:'external',
        toGenerator:gen,
        input:AsMessage.makeMessage({
          from: 'human',
          text: 'hello',
        },'talk','human','surface'),
        genNum:0,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner2:',res2);

      yield *Effect.sleep('30 seconds');

      console.log('context:',yield *avatarState.TalkContextEffect)

    }).pipe(
      aiRuntime.runPromise,
    )
  })
  it('execGeneratorLoop_mcp', async () => {
    await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield *Effect.sleep('1 seconds');

      yield *AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'})
      const avatarState = yield *AvatarService.makeAvatar(null)
      // const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      yield *Effect.sleep('1 seconds');

      const gen = yield* avatarState.getDefGenerator('aaa');
      const res = yield *avatarState.enterInner({
        avatarId:avatarState.Id,
        fromGenerator:'external',
        toGenerator:gen,
        input:AsMessage.makeMessage({
          from: 'human',
          text: 'hello',
        },'talk','human','surface'),
        genNum:0,
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('30 seconds');

    }).pipe(
      aiRuntime.runPromise,
    )
  })
  it('execGeneratorLoop_text2_gemini', async () => {
    await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield *Effect.sleep('1 seconds');

      yield *AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'})
      const avatarState = yield *AvatarService.makeAvatar(null)
      // yield *GeneratorService.startLoop()
      // const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      yield *Effect.sleep('1 seconds');

      const gen = yield* avatarState.getDefGenerator('aaa');
      const res = yield *avatarState.enterInner({
        avatarId:avatarState.Id,
        fromGenerator:'external',
        toGenerator:gen,
        input:AsMessage.makeMessage({
          from: 'human',
          text: 'hello',
        },'talk','human','surface'),
        genNum:0,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('20 seconds');

      const res2 = yield *avatarState.enterInner({
        avatarId:avatarState.Id,
        fromGenerator:'external',
        toGenerator:gen,
        input:AsMessage.makeMessage({
          from: 'human',
          text: 'hello',
        },'talk','human','surface'),
        genNum:0,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner2:',res2);

      yield *Effect.sleep('30 seconds');

      console.log('context:',yield *avatarState.TalkContextEffect)

    }).pipe(
      aiRuntime.runPromise,
    )
  })

}, 10 * 60 * 1000);

