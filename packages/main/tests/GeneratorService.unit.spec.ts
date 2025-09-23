import {describe, it} from '@effect/vitest';
import {vitestAvatarConfigMi, vitestSysConfig} from '../../common/vitestConfig';
import {Effect, Layer, ManagedRuntime} from 'effect';
import {MediaServiceLive} from '../src/MediaService';
import {DocServiceLive} from '../src/DocService';
import {McpService, McpServiceLive} from '../src/McpService';
import {ConfigServiceLive} from '../src/ConfigService';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {NodeFileSystem} from '@effect/platform-node';


const inGitHubAction = process.env.GITHUB_ACTIONS === 'true';

const AppLive = Layer.mergeAll(MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive, NodeFileSystem.layer)
const aiRuntime = ManagedRuntime.make(AppLive);

describe("GeneratorService", () => {
  const testTemplateId = vitestAvatarConfigMi.templateId;
  const testFileName = 'test_file_20240713000000.asdata';


  it('execGeneratorLoop', async () => {
    await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);

    }).pipe(
      aiRuntime.runPromise,
    )
  })
})
