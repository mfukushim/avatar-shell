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
import {vitestAvatarConfigMi} from '../../common/vitestConfig';

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
        asRole: 'human',
        asContext:'surface',
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

  it('end-to-end document flow', async () => {
    //  vitest --run --testNamePattern=end-to-end DocService.unit.spec.ts
    const testLog:AsOutput[] = [
      AsOutput.makeOutput({
        id: 'test-e2e-id',
        tick:0,
        asClass:'system',
        asRole: 'human',
        asContext:'surface',
        isRequestAction:false,
        content: { text: 'エンドツーエンドテスト' }
      },{
        provider: 'emptyText',
        model:'none',
        isExternal:false
      })];

    await Effect.gen(function* () {
      // アバターの状態を作成
      const testAvatarState = yield *AvatarState.make('e2eTest', testTemplateId, 'Flow', null, 'user');

      // ログを追加
      yield* DocService.addLog(testLog, testAvatarState);

      // ドキュメントリストを取得して確認
      const docList = yield* DocService.readDocList(testTemplateId);
      console.log('Document list:', docList);
      expect(docList.length > 0).toBeTruthy();

      // 作成したファイルが存在するか確認
      const targetFile = docList.find(filename => filename.includes('Flow'));
      expect(targetFile).toBeDefined();

      if (targetFile) {
        // 作成したドキュメントを読み込んで確認
        const doc = yield* DocService.readDocument(testTemplateId, targetFile);
        console.log('Read document:', doc);
        expect(doc.length > 0).toBeTruthy();

        // 追加したログの内容が含まれているか確認
        const hasTestMessage = doc.some(entry =>
          entry.mes &&
          entry.mes.content &&
          entry.mes.content.text === 'エンドツーエンドテスト'
        );
        expect(hasTestMessage).toBeTruthy();
      }
    }).pipe(
      Effect.provide([MediaServiceLive, ConfigServiceLive, McpServiceLive, DocServiceLive, NodeFileSystem.layer]),
      runPromise,
    );
  });

  it('media handling', async () => {
    //  vitest --run --testNamePattern=media DocService.unit.spec.ts
    // 1x1ピクセルの透明なPNG画像（Base64）
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    await Effect.gen(function* () {
      // メディアを保存
      const mediaId = 'test-media-flow';
      const mediaUrl = yield* DocService.saveDocMedia(
        mediaId,
        'image/png',
        testImageBase64,
        testTemplateId
      );
      console.log('Saved media URL:', mediaUrl);
      expect(mediaUrl).toMatch(new RegExp(`file://${testTemplateId}/${mediaId}.png`));

      // 保存したメディアを読み込む
      const mediaContent = yield* DocService.readDocMedia(mediaUrl);
      console.log('Read media content (partial):', mediaContent.substring(0, 30));

      // 元の画像データと一致するか確認
      expect(mediaContent).toEqual(testImageBase64);
    }).pipe(
      Effect.provide([MediaServiceLive, ConfigServiceLive, McpServiceLive, DocServiceLive, NodeFileSystem.layer]),
      runPromise,
    );
  });

  it('error handling - nonexistent document', async () => {
    //  vitest --run --testNamePattern=error DocService.unit.spec.ts
    const nonExistentFileName = 'non_existent_file_20240101010101.asdata';

    await expect(
      Effect.gen(function* () {
        return yield* DocService.readDocument(testTemplateId, nonExistentFileName);
      }).pipe(
        Effect.provide([DocServiceLive, NodeFileSystem.layer]),
        runPromise,
      )
    ).rejects.toThrow();
  });

  it('error handling - invalid media URL', async () => {
    //  vitest --run --testNamePattern=invalid DocService.unit.spec.ts
    const invalidMediaUrl = 'invalid://url/format';

    await expect(
      Effect.gen(function* () {
        return yield* DocService.readDocMedia(invalidMediaUrl);
      }).pipe(
        Effect.provide([DocServiceLive, ConfigServiceLive, NodeFileSystem.layer]),
        runPromise,
      )
    ).rejects.toThrow('no match media file');
  });
});
