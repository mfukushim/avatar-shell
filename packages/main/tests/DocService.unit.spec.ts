import {it, expect, describe} from '@effect/vitest';
import {Effect} from 'effect';
import {runPromise} from 'effect/Effect';
import {DocService, DocServiceLive} from '../src/DocService';
import {NodeFileSystem} from '@effect/platform-node';
import {ConfigServiceLive} from '../src/ConfigService';
import {AsOutput} from '../../common/Def';
import {AvatarState} from '../src/AvatarState';
import {McpServiceLive} from '../src/McpService';
import {MediaServiceLive} from '../src/MediaService';
import {vitestAvatarConfigMi} from '../../../tools/vitestConfig';

const inGitHubAction = process.env.GITHUB_ACTIONS === 'true';

describe("DocService", () => {
  const testTemplateId = vitestAvatarConfigMi.templateId;
  const testFileName = 'test_file_20240713000000.asdata';

  it('readDocList', async () => {
    //  vitest --run --testNamePattern=readDocList DocService.unit.spec.ts
    const res = await Effect.gen(function* () {
      return yield* DocService.readDocList(testTemplateId);
    }).pipe(
      Effect.tap(a => Effect.log(a)),
      Effect.provide([DocServiceLive, NodeFileSystem.layer,]),
      // Effect.provide([McpServiceLive, ConfigServiceLive, DocServiceLive,BuildInMcpServiceLive,MediaServiceLive,NodeFileSystem.layer,]),
      runPromise,
    );

    console.log(res);
    expect(res.length > 0).toBeTruthy();
  });

  it('readDocument', async () => {
    //  vitest --run --testNamePattern=readDocument DocService.unit.spec.ts
    const res = await Effect.gen(function* () {
      return yield* DocService.readDocument(testTemplateId, 'aaaa_Mix_20250713220404.asdata');
    }).pipe(
      Effect.provide([DocServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(JSON.stringify(res, null, 2));
    expect(Array.isArray(res)).toBeTruthy();
  });

  it('readDocMedia', async () => {
    //  vitest --run --testNamePattern=readDocMedia DocService.unit.spec.ts
    const mediaUrl = `file://${testTemplateId}/Mia_bbbb_20250604192321_2.png`;
    const res = await Effect.gen(function* () {
      return yield* DocService.readDocMedia(mediaUrl);
    }).pipe(
      Effect.provide([DocServiceLive,ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    expect(typeof res === 'string').toBeTruthy();
    console.log(res.slice(0,100));
  });

  it('saveDocMedia', async () => {
    //  vitest --run --testNamePattern=saveDocMedia DocService.unit.spec.ts

    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const res = await Effect.gen(function* () {
      return yield* DocService.saveDocMedia(
        'test-id',
        'image/png',
        testImageBase64,
        testTemplateId
      );
    }).pipe(
      Effect.provide([DocServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    expect(res).toMatch(new RegExp(`file://${testTemplateId}/test-id.png`));
  });

  it('addLog', async () => {
    //  vitest --run --testNamePattern=addLog DocService.unit.spec.ts
    const testLog:AsOutput[] = [
      AsOutput.makeOutput({
        id: 'test-message-id',
        tick:0,
        asClass:'system',
        role: 'user',
        isRequestAction:false,
        content: { text: 'テストメッセージ' }
      },{
        provider: 'emptyText',
        model:'none',
        isExternal:false
      })];

    await Effect.gen(function* () {
      const testAvatarState = yield *AvatarState.make('test', testTemplateId,'Mix',null,'user');
      return yield* DocService.addLog(testLog, testAvatarState);
    }).pipe(
      Effect.provide([MediaServiceLive,ConfigServiceLive,McpServiceLive, DocServiceLive, NodeFileSystem.layer]),
      runPromise,
    )//.resolves.not.toThrow();
  });
});
