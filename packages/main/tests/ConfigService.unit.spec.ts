import {it, expect, describe} from '@effect/vitest';
import {Effect} from 'effect';
import {runPromise} from 'effect/Effect';
import {NodeFileSystem} from '@effect/platform-node';
import {ConfigService, ConfigServiceLive} from '../src/ConfigService';
import {vitestAvatarConfigMi, vitestMutableSetting, vitestSysConfig} from '../../../tools/vitestConfig';

const inGitHubAction = process.env.GITHUB_ACTIONS === 'true';

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

  it('getVersion', async () => {
    //  vitest --run --testNamePattern=getVersion ConfigService.unit.spec.ts
    const res = await Effect.gen(function* () {
      return yield* ConfigService.getVersion();
    }).pipe(
      Effect.provide([ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

    console.log(res);
    expect(typeof res).toBe('string');
    expect(res).toMatch(/^\d+\.\d+\.\d+$/);
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
});
