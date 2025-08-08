//  注意: インポート順序に順序があるようだ。誤るとAvatarState.makeでエラーになる
import {Effect} from 'effect';
import {runPromise, runPromiseExit} from 'effect/Effect';
import {NodeFileSystem} from '@effect/platform-node';
import {it, expect, describe, beforeEach, afterEach} from '@effect/vitest';
import {AvatarState} from '../src/AvatarState';
import {ConfigService, ConfigServiceLive} from '../src/ConfigService';
import {McpService, McpServiceLive} from '../src/McpService';
import {DocServiceLive} from '../src/DocService';
import {MediaServiceLive} from '../src/MediaService';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {vitestAvatarConfigMi, vitestSysConfig} from '../../common/vitestConfig';
import {AvatarSetting} from '../../common/Def';

describe('McpService', () => {
  beforeEach(() => {
    // ConfigServiceのモックをセットアップ
    // vi.spyOn(ConfigService, 'getSysConfigPub').mockImplementation(() =>
    //   Effect.succeed({
    //     get: () => Effect.succeed(mockSysConfig),
    //     changes: { pipe: () => ({ changes: [] }) }
    //   })
    // );
  });

  afterEach(() => {
    // vi.clearAllMocks();
  });

  it('reset_getMcpServerInfos', async () => {
    //  vitest --run --testNamePattern=init McpService.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      return yield *McpService.getMcpServerInfos()
    }).pipe(
      Effect.provide([ConfigServiceLive,McpServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise
    );
    console.log(res);
    expect(Array.isArray(res)).toBeTruthy()
    expect(res[0].id === 'traveler').toBeTruthy()
  });

  it('readMcpResource', async () => {
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      return yield* McpService.readMcpResource('traveler', 'file:///credit.txt');
    }).pipe(
      Effect.provide([ConfigServiceLive,McpServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise
    );

    console.log(res);
    expect(res).toBeDefined();
    expect(res.contents[0].mimeType).toBe('text/plain');
  });

    it('getToolDefs', async () => {

      const res = await Effect.gen(function* () {
        yield* McpService.reset(vitestSysConfig);
        return yield* McpService.getToolDefs(vitestAvatarConfigMi.mcp);
      }).pipe(
        Effect.provide([ConfigServiceLive,McpServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
        runPromise
      );

      console.log(res);
      expect(Array.isArray(res)).toBe(true);
    });

  it('callFunction', async () => {
    //  vitest --run --testNamePattern=callFunction McpService.unit.spec.ts

    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.reset(vitestSysConfig);
      console.log('c');
      return yield* McpService.callFunction(avatarState, {
        name: 'traveler_tips',
        id: 'tips',
        input: { }
      },'emptyText');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive,McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise
    );

    console.log(JSON.stringify(res));
    expect(typeof res === 'object').toBe(true)
    expect(res.call_id).toEqual('tips');
    expect(res.toLlm !== undefined).toBeTruthy();
  });

  it('callFunctionNoMcp', async () => {
    //  vitest --run --testNamePattern=callFunction McpService.unit.spec.ts
    console.log('a');

    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.reset(vitestSysConfig);
      console.log('c');
      return yield* McpService.callFunction(avatarState, {
        name: 'xxx',
        id: 'tip',
        input: { }
      },'emptyText');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive,McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromiseExit
    );

    console.log(res);
    expect(res._tag).toBe('Failure');
  });

  it('callFunctionNoCall', async () => {
    //  vitest --run --testNamePattern=callFunction McpService.unit.spec.ts
    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.reset(vitestSysConfig);
      console.log('c');
      return yield* McpService.callFunction(avatarState, {
        name: 'traveler_xxx',
        id: 'xxx',
        input: { }
      },'emptyText');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive,McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromiseExit
    );

    console.log(res);
    expect(res._tag).toBe('Failure');
  });
  it('callFunctionStartTrip', async () => {
    //  vitest --run --testNamePattern=callFunction McpService.unit.spec.ts
    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.reset(vitestSysConfig);
      console.log('c');
      return yield* McpService.callFunction(avatarState, {
        name: 'traveler_start_traveler_journey',
        id: 'xxx',
        input: { }
      },'emptyText');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive,McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromiseExit
    );

    console.log(JSON.stringify(res));
    // expect(res._tag).toBe('Failure');
  });

  it('callFunctionAsk', async () => {
    //  vitest --run --testNamePattern=callFunction McpService.unit.spec.ts
    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.reset(vitestSysConfig);
      console.log('c');
      return yield* McpService.callFunction(avatarState, {
        name: 'traveler_get_traveler_location',
        id: 'get_traveler_location',
        input: { }
      },'emptyText');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive,McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromiseExit
    );

    console.log(res);
    expect(res._tag).toBe('Failure');
  });

  it('callFunctionDeny', async () => {
    //  vitest --run --testNamePattern=callFunction McpService.unit.spec.ts
    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.reset(vitestSysConfig);
      console.log('c');
      return yield* McpService.callFunction(avatarState, {
        name: 'traveler_get_setting',
        id: 'get_setting',
        input: { }
      },'emptyText');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive,McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromiseExit
    );

    console.log(res);
    expect(res._tag).toBe('Failure');
  });
  it('updateAvatarMcpSetting', async () => {
    const res = await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      const avatarConfig = yield *ConfigService.getAvatarConfig('vitestDummyId');
      console.log(JSON.stringify(avatarConfig.mcp));
      const a1:AvatarSetting = {
        ...avatarConfig,
        mcp: {
          ...avatarConfig.mcp,
          traveler: {
            ...avatarConfig.mcp.traveler,
            enable: false,
            useTools: {
              ...avatarConfig.mcp.traveler.useTools,
              'traveler_get_setting': {
                enable: false,
                allow: 'no'
              }
            }
          }
        }
      }
      const b1 = yield* McpService.updateAvatarMcpSetting(a1);
      console.log(JSON.stringify(b1.mcp));
      expect(b1.mcp).toHaveProperty('traveler');
      expect(b1.mcp.traveler.enable).toEqual(false);
      const a2:AvatarSetting = {
        ...avatarConfig,
        mcp: {
        }
      }
      const b2 = yield* McpService.updateAvatarMcpSetting(a2);
      console.log(JSON.stringify(b2.mcp));

    }).pipe(
      Effect.provide([ConfigServiceLive, McpServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise
    );

    // console.log(JSON.stringify(res));
    // expect(res).toBeDefined();
    // expect(typeof res).toBe('object');
    // MCPの設定が正しく含まれているか確認
    // Object.values(res).forEach(mcpSetting => {
    //   expect(mcpSetting).toHaveProperty('enable');
    //   expect(mcpSetting).toHaveProperty('useTools');
    //   expect(typeof mcpSetting.useTools).toBe('object');
    // });
  });

  it('getMcpServerInfos should return empty array when no servers', async () => {
    const res = await Effect.gen(function* () {
      // 初期化せずに直接getMcpServerInfosを呼び出す
      return yield* McpService.getMcpServerInfos();
    }).pipe(
      Effect.provide([ConfigServiceLive, McpServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise
    );

    console.log(res);
    expect(Array.isArray(res)).toBe(true);
    expect(res).toHaveLength(0);
  });

  // it('deepMerge should correctly merge objects', async () => {
  //   const res = await Effect.gen(function* () {
  //     const target = {
  //       id: 'test',
  //       settings: {
  //         enable: true,
  //         tools: { tool1: true }
  //       }
  //     };
  //     const source = {
  //       settings: {
  //         tools: { tool2: false }
  //       },
  //       newProp: 'value'
  //     };
  //
  //     return yield* McpService.deepMerge(target, source);
  //   }).pipe(
  //     Effect.provide([ConfigServiceLive, McpServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
  //     runPromise
  //   );
  //   expect(res).toHaveProperty('id', 'test');
  //   expect(res.settings).toHaveProperty('enable', true);
  //   expect(res.settings.tools).toHaveProperty('tool1', true);
  //   expect(res.settings.tools).toHaveProperty('tool2', false);
  //   expect(res).toHaveProperty('newProp', 'value');
  // });


  it('callFunction_MCP_disable', async () => {
    //  vitest --run --testNamePattern=callFunction McpService.unit.spec.ts
    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.reset(vitestSysConfig);
      console.log('c');
      return yield* McpService.callFunction(avatarState, {
        name: 'traveler_get_traveler_location',
        id: 'get_traveler_location',
        input: { }
      },'emptyText');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive,McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromiseExit
    );

    console.log(res);
    expect(res._tag).toBe('Failure');
  });

},5 * 60 * 1000);
