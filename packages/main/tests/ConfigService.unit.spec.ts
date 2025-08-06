/*! avatar-shell | Apache-2.0 License | https://github.com/mfukushim/avatar-shell */
import {it, expect, describe} from '@effect/vitest';
import {Effect, Schema} from 'effect';
import {runPromise} from 'effect/Effect';
import {NodeFileSystem} from '@effect/platform-node';
import {ConfigService, ConfigServiceLive} from '../src/ConfigService';
import {vitestAvatarConfigMi, vitestMutableSetting, vitestSysConfig} from '../../common/vitestConfig';
import {FileSystem} from '@effect/platform';
import {AvatarMcpSetting} from '../../common/Def';
import {AvatarService} from '../src/AvatarService';
import path from 'node:path';

const inGitHubAction = process.env.GITHUB_ACTIONS === 'true';

const cwd = process.cwd()
let baseDir = cwd;
if (cwd.endsWith('main')) {
  baseDir = path.join(baseDir,'../..');
}

describe("ConfigService", () => {

  it('getSysConfig', async () => {
    //  vitest --run --testNamePattern=getSysConfig ConfigService.unit.spec.ts
    const res = await Effect.gen(function* () {
      return yield* ConfigService.getSysConfig();
    }).pipe(
      Effect.tap(a => Effect.log(a)),
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer,]),
      // Effect.provide([McpServiceLive, ConfigServiceLive, DocServiceLive,BuildInMcpServiceLive,MediaServiceLive,NodeFileSystem.layer,]),
      runPromise,
    );

    console.log(res);
    expect(res).toBe(vitestSysConfig);
  });

  it('getMutableSetting', async () => {
    const res = await Effect.gen(function* () {
      return yield* ConfigService.getMutableSetting();
    }).pipe(
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(res);
    expect(res).toEqual(vitestMutableSetting);
  });

  it('needWizard', async () => {
    const res = await Effect.gen(function* () {
      return yield* ConfigService.needWizard();
    }).pipe(
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(res);
    expect(typeof res).toBe('boolean');
  });

  it('getAvatarConfigList', async () => {
    const res = await Effect.gen(function* () {
      return yield* ConfigService.getAvatarConfigList();
    }).pipe(
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(res);
    expect(Array.isArray(res)).toBe(true);
    if (res.length > 0) {
      expect(res[0]).toHaveProperty('templateId');
      expect(res[0]).toHaveProperty('name');
      expect(res[0].templateId).toEqual('vitestDummyId');
      expect(res[0].name).toEqual('vitestMi');
    }
  });

  it('avatarCreateCopyDelete', async () => {
    //  vitest --run --testNamePattern=avatarCreateCopyDelete ConfigService.unit.spec.ts
    await Effect.gen(function* () {
      // テンプレートからアバターをコピー
      const defaultId = vitestAvatarConfigMi.templateId;
      console.log(defaultId);
      const aConfig = yield* ConfigService.getAvatarConfig(defaultId);
      console.log(aConfig);
      const newId = yield* ConfigService.copyAvatarConfig(defaultId);
      console.log(newId);
      expect(typeof newId).toBe('string');

      // 新しいアバターの設定を取得
      const newConfig = yield* ConfigService.getAvatarConfig(newId);
      console.log(newConfig);
      expect(newConfig).toBeDefined();
      expect(newConfig.templateId).toBe(newId);

      // アバター設定を更新
      const updatedConfig = {
        ...newConfig,
        general: {
          ...newConfig.general,
          name: "テストアバター"
        }
      };
      yield* ConfigService.setAvatarConfig(newId, updatedConfig);

      // 更新された設定を確認
      const confirmedConfig = yield* ConfigService.getAvatarConfig(newId);
      console.log(confirmedConfig);
      expect(confirmedConfig.general.name).toBe("テストアバター");

      // アバターを削除
      yield* ConfigService.deleteAvatarConfig(newId);

      // 削除されたことを確認
      const avatarList = yield* ConfigService.getAvatarConfigList();
      expect(avatarList.find(a => a.templateId === newId)).toBeUndefined();
    }).pipe(
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );
  });
  it('decodeTest', async () => {
    const res = await Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const d = yield* fs.readFileString('D:\\mfuku\\Documents\\projects\\daisyProj\\avatar-sight-rel\\tools\\test.json', 'utf8');
      const t = yield *Schema.decodeUnknown(Schema.parseJson(AvatarMcpSetting))(d)
      // const t = yield *Schema.decodeUnknown(AvatarMcpSetting)(Schema.parseJson())
      return t;
    }).pipe(
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(res);
    // expect(Array.isArray(res)).toBe(true);
    // if (res.length > 0) {
    //   expect(res[0]).toHaveProperty('templateId');
    //   expect(res[0]).toHaveProperty('name');
    //   expect(res[0].templateId).toEqual('vitestDummyId');
    //   expect(res[0].name).toEqual('vitestMi');
    // }
  });

  it('updateMutableSetting', async () => {
    //  vitest --run --testNamePattern=saveMutableSetting ConfigService.unit.spec.ts
    await Effect.gen(function* () {
      // 現在の設定を取得
      const originalSetting = yield* ConfigService.getMutableSetting();
      console.log('Original setting:', originalSetting);

      // 設定を更新
      const updatedSetting = {
        ...originalSetting,
        volume: 0.5,
        winX: -100,
      };

      // 更新を保存
      yield* ConfigService.updateMutableSetting(updatedSetting);

      // 更新された設定を取得して確認
      const newSetting = yield* ConfigService.getMutableSetting();
      console.log('Updated setting:', newSetting);

      expect(newSetting).toEqual(updatedSetting);
    }).pipe(
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );
  });

  it('setAvatarConfig', async () => {
    //  vitest --run --testNamePattern=setAvatarConfig ConfigService.unit.spec.ts
    await Effect.gen(function* () {
      // テンプレートからアバターをコピー
      const defaultId = vitestAvatarConfigMi.templateId;
      const newId = yield* ConfigService.copyAvatarConfig(defaultId);
      console.log('New avatar ID:', newId);

      // 新しいアバターの設定を取得
      const config = yield* ConfigService.getAvatarConfig(newId);
      console.log('Original config:', config);

      // 設定を更新
      const updatedConfig = {
        ...config,
        general: {
          ...config.general,
          name: "設定更新テスト",
          maxGeneratorUseCount: 5
        }
      };

      // 更新を保存
      yield* ConfigService.setAvatarConfig(newId, updatedConfig);

      // 更新された設定を取得して確認
      const newConfig = yield* ConfigService.getAvatarConfig(newId);
      console.log('Updated config:', newConfig);

      expect(newConfig.general.name).toBe("設定更新テスト");
      expect(newConfig.general.maxGeneratorUseCount).toBe(5);

      // アバターを削除
      yield* ConfigService.deleteAvatarConfig(newId);
    }).pipe(
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );
  });

  // GitHubアクションでは実行しないテスト（ダイアログが表示されるため）
  if (!inGitHubAction) {
    it('exportAndImportSysConfig', async () => {
      //  vitest --run --testNamePattern=exportAndImportSysConfig ConfigService.unit.spec.ts
      await Effect.gen(function* () {
        // システム設定をエクスポート
        yield* ConfigService.exportSysConfig(path.join(baseDir,'tools/test/sysConfig.json'));

        // インポートは手動テストが必要なため、コメントアウト
        yield* ConfigService.importSysConfig(path.join(baseDir,'tools/test/sysConfig.json'));
        console.log('a');
        const fs = yield *FileSystem.FileSystem;
        const d = yield* fs.readFileString(path.join(baseDir,'tools/test/sysConfig.json'), 'utf8');
        console.log(d);
        expect(JSON.parse(d)).toEqual(vitestSysConfig)
      }).pipe(
        Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
        runPromise,
      );
    });

    it('exportAndImportAvatar', async () => {
      //  vitest --run --testNamePattern=exportAndImportAvatar ConfigService.unit.spec.ts
      await Effect.gen(function* () {
        // デフォルトアバターのIDを取得
        const avatarList = yield* ConfigService.getAvatarConfigList();
        if (avatarList.length > 0) {
          const avatarId = avatarList[0].templateId;

          // アバター設定をエクスポート
          yield* ConfigService.exportAvatar(avatarId,path.join(baseDir, 'tools/test/avatar.json'));

          //  import時に重複確認ダイアログが出るので一旦削除
          yield *ConfigService.deleteAvatarConfig(avatarId)
          console.log(avatarId);

          // インポートは手動テストが必要なため、コメントアウト
          yield* ConfigService.importAvatar(path.join(baseDir,'tools/test/avatar.json'));
          const fs = yield *FileSystem.FileSystem;
          const d = yield* fs.readFileString(path.join(baseDir,'tools/test/avatar.json'), 'utf8');
          console.log(d);
          expect(JSON.parse(d)).toEqual(vitestAvatarConfigMi)
        }
      }).pipe(
        Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
        runPromise,
      );
    });
  }

});
