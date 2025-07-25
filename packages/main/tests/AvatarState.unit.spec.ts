import {Effect} from 'effect';
import {runPromise} from 'effect/Effect';
import {ConfigService, ConfigServiceLive} from '../src/ConfigService';
import {NodeFileSystem} from '@effect/platform-node';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {McpService, McpServiceLive} from '../src/McpService';
import {AvatarState} from '../src/AvatarState';
import {DocService, DocServiceLive} from '../src/DocService';
import {MediaServiceLive} from '../src/MediaService';
import {describe, expect, it} from '@effect/vitest';
import {AsMessage, AsOutput, AvatarSettingMutable} from '../../common/Def';
import dayjs from 'dayjs';
import {AvatarServiceLive} from '../src/AvatarService';

describe('avatarState', () => {
  it('make', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.initial();
      return yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
  });
  it('val', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.initial();

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      const tempId = avatarState.TemplateId;
      const name = avatarState.Name;
      const tag = avatarState.Tag;
      const avatarConfig = avatarState.Config;
      return {tempId, name, tag, avatarConfig};
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(res);
    expect(typeof res === 'object').toBeTruthy();
  });
  it('ScheduleList', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.initial();

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      return yield* avatarState.ScheduleList;
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
    expect(res.length === 3).toBeTruthy();
  });
  it('setNames', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.initial();

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      avatarState.setNames({userName: 'mfuku', avatarName: 'mi'});
      return {name: avatarState.Name, userName: avatarState.UserName};
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBeTruthy();
    expect(res.name).toBe('mi');
    expect(res.userName).toBe('mfuku');
  });
  it('addContext', async () => {
    //  vitest --run --testNamePattern=make AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.initial();

      const avatarState = yield* AvatarState.make('aaaa', 'vitestNoneId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      yield* avatarState.addContext([
        AsMessage.makeMessage({
          from: 'user',
          text: 'hello',
        },'talk','user')
      ], true);
      return yield* avatarState.TalkContextEffect;
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
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

      const avatarState = yield* AvatarState.make('aaaa', 'vitestNoneId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      return yield* avatarState.askAi([
        AsMessage.makeMessage({
          from: 'user',
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
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
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
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
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
              addDaemonGenToContext: true,
              // templateContextPrompt: 'add 1 min Time',
              setting: {
                toClass:'talk',
                toRole:'assistant'
              },
            },
          },
        ],
      } as AvatarSettingMutable;

      yield* ConfigService.updateAvatarConfig(template, cf);

      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      const check1 = yield* avatarState.TalkContextEffect;

      yield* Effect.sleep('60 seconds'); //  累積35
      const check2 = yield* avatarState.TalkContextEffect;

      return {check1, check2};
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
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
              addDaemonGenToContext: true,
              // templateContextPrompt: 'add 1 min Time',
              setting: {
                toClass:'talk',
                toRole:'assistant'
              },
            },
          },
        ],
      } as AvatarSettingMutable;

      yield* ConfigService.updateAvatarConfig(template, cf);

      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
      const check1 = yield* avatarState.TalkContextEffect;

      yield* Effect.sleep('60 seconds'); //  累積35
      const check2 = yield* avatarState.TalkContextEffect;

      return {check1, check2};
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(res.check1.length).toBe(0);
    expect(res.check2.length).toBe(2);
  });


  it('daemonContext', async () => {
    //  vitest --run --testNamePattern=daemonContext AvatarState.unit.spec.ts
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
            name: 'ContextFind',
            isEnabled: true,
            trigger: {
              triggerType: 'IfContextExists',
              condition: {asClass:'talk',asRole:'user'},
            },
            exec: {
              generator:'emptyText',  //  TODO generatorに回すときのcurrentは今はclass/roleを見ないが、roleはuserにしないといけないのではないか?
              addDaemonGenToContext: false, //  generatorの出力はコンテキストに追加しない
              templateGeneratePrompt: 'user said {body}',
              setting: {
                debug:true,  //  ダミーログを出力させる
                previousContextSize:0,
                toClass:'daemon',
                toRole:'user'
              },
            },
          },
        ],
      } as AvatarSettingMutable;

      yield* ConfigService.updateAvatarConfig(template, cf);

      yield* Effect.sleep('5 seconds');
      const check1 = yield* avatarState.TalkContextEffect;

      //  ダミーmesとlog
      const mes = AsMessage.makeMessage({
        from: 'user',
          text: 'hello',
      },'talk','user');
      yield* avatarState.addContext([mes])
      yield *DocService.addLog([AsOutput.makeOutput(mes,{
        provider:'emptyText', //  無効値を持たせたいが
        model:'none',
        isExternal:false,
      })], avatarState)


      yield* Effect.sleep('5 seconds');
      const check2 = yield* avatarState.TalkContextEffect;  //  コンテキストには呼び水のコンテキストしかない

      const log = yield *DocService.readDocument(template,avatarState.LogFileName)  //  ログには

      return {check1, check2,log};
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(res.check1.length).toBe(0);
    expect(res.check2.length).toBe(3);
    expect(res.log.length).toBe(3);
  });
  it('daemonTalkAfterMin', async () => {
    //  vitest --run --testNamePattern=daemonDayTime AvatarState.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.initial();

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
              addDaemonGenToContext: true,
              templateGeneratePrompt: 'Please respond to the above conversation', //  15秒後
              setting: {
                toClass:'talk',
                toRole:'assistant'
              },
            },
          },
        ],
      } as AvatarSettingMutable;

      yield* ConfigService.updateAvatarConfig(template, cf);

      yield* Effect.sleep('30 seconds');
      const check1 = yield* avatarState.TalkContextEffect;

      //const mes = yield *AvatarService.askAvatar(id,[makeMessage('hello')]) これでは AvatarServiceにアバター登録しなければならないので同等処理で記述する
      yield *avatarState.addContext([AsMessage.makeMessage({
        from: 'user',
        text: 'hello',
      },'talk','user')])
/*
      const mes = yield *avatarState.askAi([AsMessage.makeMessage({
        from: 'user',
        text: 'hello',
      },'talk','user')])
*/
      yield *avatarState.rebuildIdle()

      yield* Effect.sleep('5 seconds');
      const check2 = yield* avatarState.TalkContextEffect;
      yield* Effect.sleep('20 seconds');
      const check3 = yield* avatarState.TalkContextEffect;
      yield* Effect.sleep('30 seconds');
      const check4 = yield* avatarState.TalkContextEffect;

      return {check1,check2,check3,check4};
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive,AvatarServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(res.check1.length).toBe(0);
    // expect(res.mes.length).toBe(1);
    expect(res.check2.length).toBe(2);
    expect(res.check3.length).toBe(4);
    expect(res.check4.length).toBe(4);
  });

}, 5 * 60 * 1000);

