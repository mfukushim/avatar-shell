import {describe, it} from '@effect/vitest';
import {vitestAvatarConfigMi, vitestSysConfig} from '../../common/vitestConfig';
import {Effect, Layer, ManagedRuntime} from 'effect';
import {MediaServiceLive} from '../src/MediaService';
import {DocServiceLive} from '../src/DocService';
import {McpService, McpServiceLive} from '../src/McpService';
import {ConfigServiceLive} from '../src/ConfigService';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {NodeFileSystem} from '@effect/platform-node';
import {GeneratorService, GeneratorServiceLive, GenInner} from '../src/GeneratorService';
import {GeneratorProvider} from '../../common/DefGenerators';
import {AsMessageContent} from '../../common/Def';
import {z} from 'zod/index';
import {AvatarState} from '../src/AvatarState';
import {AvatarService, AvatarServiceLive} from '../src/AvatarService';


const inGitHubAction = process.env.GITHUB_ACTIONS === 'true';

const AppLive = Layer.mergeAll(MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive, BuildInMcpServiceLive,GeneratorServiceLive,AvatarServiceLive, NodeFileSystem.layer)
const aiRuntime = ManagedRuntime.make(AppLive);

describe("GeneratorService", () => {
  const testTemplateId = vitestAvatarConfigMi.templateId;
  const testFileName = 'test_file_20240713000000.asdata';


  it('execGeneratorLoop_text', async () => {
    await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield *Effect.sleep('1 seconds');

      yield *AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'})
      const avatarState = yield *AvatarService.makeAvatar(null)
      // const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      yield *Effect.sleep('1 seconds');

      const res = yield *GeneratorService.enterInner({
        avatarId:avatarState.Id,
        toGenerator:'ollamaText',
        input:{
          from: 'user',
          text: 'hello'
        },
        genNum:0,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('30 seconds');

    }).pipe(
      aiRuntime.runPromise,
    )
  })

  it('execGeneratorLoop_text2', async () => {
    await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield *Effect.sleep('1 seconds');

      yield *AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'})
      const avatarState = yield *AvatarService.makeAvatar(null)
      // const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      yield *Effect.sleep('1 seconds');

      const res = yield *GeneratorService.enterInner({
        avatarId:avatarState.Id,
        toGenerator:'ollamaText',
        input:{
          from: 'user',
          text: 'hello'
        },
        genNum:0,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('20 seconds');

      const res2 = yield *GeneratorService.enterInner({
        avatarId:avatarState.Id,
        toGenerator:'ollamaText',
        input:{
          from: 'user',
          text: "What should I do when it's hot?"
        },
        genNum:0,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner2:',res2);

      yield *Effect.sleep('30 seconds');

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

      const res = yield *GeneratorService.enterInner({
        avatarId:avatarState.Id,
        toGenerator:'ollamaText',
        input:{
          from: 'user',
          text: '/get traveler setting'
        },
        genNum:0,
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('30 seconds');

    }).pipe(
      aiRuntime.runPromise,
    )
  })
},5 * 60 * 1000)
