//  注意: インポート順序に順序があるようだ。誤るとAvatarState.makeでエラーになる
import {Effect} from 'effect';
import {runPromise, runPromiseExit} from 'effect/Effect';
import {NodeFileSystem} from '@effect/platform-node';
import {it, expect, describe, beforeEach, afterEach} from '@effect/vitest';
import {AvatarState} from '../src/AvatarState';
import {ConfigServiceLive} from '../src/ConfigService';
import {McpService, McpServiceLive} from '../src/McpService';
import {DocServiceLive} from '../src/DocService';
import {MediaServiceLive} from '../src/MediaService';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {vitestAvatarConfigMi} from '../../../tools/vitestConfig';

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

  it('init', async () => {
    //  vitest --run --testNamePattern=init McpService.unit.spec.ts
    await Effect.gen(function* () {
      yield* McpService.initial();
    }).pipe(
      Effect.provide([ConfigServiceLive,McpServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise
    );

  });
  it('Info', async () => {
    //  vitest --run --testNamePattern=init_Info McpService.unit.spec.ts
    const res = await Effect.gen(function* () {
      yield* McpService.initial();
      return yield* McpService.getMcpServerInfos();
    }).pipe(
      Effect.provide([ConfigServiceLive,McpServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise
    );

    console.log(JSON.stringify(res,null,2));
    // expect(res).toHaveLength(2);
    if (res.length > 0) {
      expect(res[0]).toHaveProperty('id');
      expect(res[0]).toHaveProperty('tools');
      expect(res[0]).toHaveProperty('prompts');
      expect(res[0]).toHaveProperty('resources');
    }
  });

  it('readMcpResource', async () => {
    const res = await Effect.gen(function* () {
      yield* McpService.initial();
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
        yield* McpService.initial();
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
    console.log('a');

    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.initial();
      console.log('c');
      return yield* McpService.callFunction(avatarState, {
        name: 'traveler_tips',
        id: 'tip',
        input: { }
      },'emptyText');
    }).pipe(
      Effect.provide([MediaServiceLive, DocServiceLive,McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer]),
      runPromise
    );

    console.log(res);
    expect(typeof res === 'object').toBe(true)
  });

  it('callFunctionNoMcp', async () => {
    //  vitest --run --testNamePattern=callFunction McpService.unit.spec.ts
    console.log('a');

    const res = await Effect.gen(function* () {
      console.log('b');
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');
      yield* McpService.initial();
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
      yield* McpService.initial();
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
      yield* McpService.initial();
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
      yield* McpService.initial();
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
      yield* McpService.initial();
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
},5 * 60 * 1000);
