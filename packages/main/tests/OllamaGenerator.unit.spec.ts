//  注意: インポート順序に順序があるようだ。誤るとAvatarState.makeでエラーになる
import {Effect, Layer, ManagedRuntime} from 'effect';
import {runPromise} from 'effect/Effect';
import {it, expect, describe, beforeEach} from '@effect/vitest';
import {AvatarState, GenInner} from '../src/AvatarState';
import {ConfigServiceLive} from '../src/ConfigService';
import {McpServiceLive} from '../src/McpService';
import {DocService, DocServiceLive} from '../src/DocService';
import {MediaServiceLive} from '../src/MediaService';
import {OllamaTextGenerator} from '../src/generators/OllamaGenerator';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {NodeFileSystem} from '@effect/platform-node';
import {FetchHttpClient, FileSystem} from '@effect/platform';
import path from 'node:path';
import {vitestSysConfig} from '../../common/vitestConfig';
import {AvatarServiceLive} from '../src/AvatarService';
import {AsMessage} from '../../common/Def';
import {
  contextStepTest1,
  contextStepTest2,
  contextStepTest3,
  contextStepTest4,
  contextStepTest5, contextStepTest6, contextStepTest7,
} from './CommonGeneratorTest';

const cwd = process.cwd();
let baseDir = cwd;
if (cwd.endsWith('main')) {
  baseDir = path.join(baseDir, '../..');
}

const AppLive = Layer.mergeAll(MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive,
  BuildInMcpServiceLive,AvatarServiceLive, NodeFileSystem.layer,FetchHttpClient.layer)
const aiRuntime = ManagedRuntime.make(AppLive);

describe('OllamaGenerator', () => {
  beforeEach(() => {
  });

  it('make', async () => {
    const ai = await OllamaTextGenerator.make(vitestSysConfig).pipe(runPromise);

    console.log(ai);
    expect(typeof ai === 'object').toBe(true);
  });

  it('generateContext_text', async () => {
    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない

      const ai = yield* OllamaTextGenerator.make(vitestSysConfig);

      return yield* ai.generateContext({
        avatarId: 'aaaa', toGenerator: ai,fromGenerator:'external', input: AsMessage.makeMessage({
          innerId: '1234567890',
          text: 'hello',
        },'talk','human','surface'),
        genNum:0
      } as GenInner, avatarState);
    }).pipe(aiRuntime.runPromise);


    console.log(res);
    expect(typeof res === 'object').toBe(true);
  });

  it('generateContext_image', async () => {
    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない

      const sysConfig = {
        ...vitestSysConfig,
        generators: {
          ...vitestSysConfig.generators,
          ollama: {
            ...vitestSysConfig.generators.ollama,
          }
        }
      }
      sysConfig.generators.ollama.model = 'llava:7b-v1.6';
      const ai = yield* OllamaTextGenerator.make(sysConfig);

      // const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const fs = yield* FileSystem.FileSystem;
      const file = yield* fs.readFile(path.join(baseDir, 'tests_fixtures/1758692794_planeImage.png'));
      const testImageBase64 = Buffer.from(file).toString('base64');

      const url = yield* DocService.saveDocMedia('123', 'image/png', testImageBase64, 'vitestDummyId');
      return yield* ai.generateContext({
        avatarId: 'aaaa', toGenerator: ai,fromGenerator:'external', input: AsMessage.makeMessage({
          innerId: '1234567890',
          mediaUrl: url,
          mimeType: 'image/png',  //  mimeの指定は必須にしている
          text: 'What is in the picture?',
        },'talk','human','surface'),
        genNum:0
      } as GenInner, avatarState);
    }).pipe(aiRuntime.runPromise);

    console.log(res);
    expect(typeof res === 'object').toBe(true);
  });

  it('コンテキストステップ確認1', async () => {
    await contextStepTest1('ollamaText',4)
  });

  it('コンテキストステップ確認2', async () => {
    await contextStepTest2('ollamaText',6)
  });

  it('コンテキストステップ確認3', async () => {
    await contextStepTest3('ollamaText',4)
  });

  it('コンテキストステップ確認4', async () => {
    await contextStepTest4('ollamaText',8)
  });

  it('コンテキストステップ確認5', async () => {
    await contextStepTest5('ollamaText',8)
  });

  it('コンテキストステップ確認6', async () => {
    //  元々Ollama-llama3.1では正常に終わらない
    await contextStepTest6('ollamaText',8)
  });

  it('コンテキストステップ確認7', async () => {
    //  元々Ollama-llama3.1では正常に終わらない
    await contextStepTest7('ollamaText',15)
  });
}, 5 * 60 * 1000);
