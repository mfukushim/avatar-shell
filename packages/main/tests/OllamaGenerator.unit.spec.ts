//  注意: インポート順序に順序があるようだ。誤るとAvatarState.makeでエラーになる
import {Effect, Layer, ManagedRuntime, Schema} from 'effect';
import {runPromise} from 'effect/Effect';
import {it, expect, describe, beforeEach} from '@effect/vitest';
import {AvatarState, GenInner} from '../src/AvatarState';
import {ConfigServiceLive} from '../src/ConfigService';
import {McpService, McpServiceLive} from '../src/McpService';
import {DocService, DocServiceLive} from '../src/DocService';
import {MediaServiceLive} from '../src/MediaService';
import {OllamaTextGenerator} from '../src/generators/OllamaGenerator';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {NodeFileSystem} from '@effect/platform-node';
import {FileSystem} from '@effect/platform';
import path from 'node:path';
import {vitestSysConfig} from '../../common/vitestConfig';
import {AvatarService, AvatarServiceLive} from '../src/AvatarService';

const cwd = process.cwd()
let baseDir = cwd;
if (cwd.endsWith('main')) {
  baseDir = path.join(baseDir,'../..');
}

const AppLive = Layer.mergeAll(MediaServiceLive, DocServiceLive, McpServiceLive, ConfigServiceLive,
  BuildInMcpServiceLive, AvatarServiceLive, NodeFileSystem.layer)
const aiRuntime = ManagedRuntime.make(AppLive);

describe('OllamaGenerator', () => {
  beforeEach(() => {
  });

  it('make', async () => {
    const ai = await OllamaTextGenerator.make( {
      host: "http://192.168.11.121:11434",
      model: "llama3.1"
    }).pipe(runPromise);

    console.log(ai);
    expect(typeof ai === 'object').toBe(true);
  });

  it('generateContext_text', async () => {
    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない

      const ai = yield* OllamaTextGenerator.make({
        host: "http://192.168.11.121:11434",
        model: "llama3.1"
      });

      return yield *ai.generateContext({avatarId:'aaaa',toGenerator:'ollamaText',input:{
          innerId: '1234567890',
          text: 'hello',
        }
      } as GenInner, avatarState);
    }).pipe(aiRuntime.runPromise,);


    console.log(res);
    expect(typeof res === 'object').toBe(true);
  });

  it('generateContext_image', async () => {
    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      // console.log(avatarState);
      yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない

      const ai = yield* OllamaTextGenerator.make({
        host: "http://192.168.11.121:11434",
        model: "llava:7b-v1.6"
      });

      // const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const fs = yield* FileSystem.FileSystem;
      const file = yield *fs.readFile(path.join(baseDir,'tests_fixtures/1758692794_planeImage.png'));
      const testImageBase64 = Buffer.from(file).toString('base64');

      const url = yield *DocService.saveDocMedia('123', 'image/png', testImageBase64, 'vitestDummyId')
      return yield *ai.generateContext({avatarId:'aaaa',toGenerator:'ollamaText',input:{
          innerId: '1234567890',
          mediaUrl: url,
          mimeType: 'image/png',  //  mimeの指定は必須にしている
          text: 'What is in the picture?',
        }
      } as GenInner, avatarState);
    }).pipe(aiRuntime.runPromise,);


    console.log(res);
    expect(typeof res === 'object').toBe(true);
  });

  it('コンテキストステップ確認1', async () => {
    await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield *Effect.sleep('1 seconds');

      yield *AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'})
      const avatarState = yield *AvatarService.makeAvatar(null)

      yield *Effect.sleep('1 seconds');

      const res = yield *avatarState.enterInner({
        avatarId:avatarState.Id,
        fromGenerator:'external',
        toGenerator:'ollamaText',
        input:{
          from: 'user',
          text: 'hello',
          isExternal:true,
        },
        genNum:1,
        setting: {
          noTool:true
        }
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('20 seconds');

      console.log('context:',yield *avatarState.TalkContextEffect)

    }).pipe(
      aiRuntime.runPromise,
    )
  });

  it('コンテキストステップ確認2', async () => {
    await Effect.gen(function* () {
      yield* McpService.reset(vitestSysConfig);
      yield *Effect.sleep('1 seconds');

      yield *AvatarService.addAvatarQueue({templateId: 'vitestNoneId', name: 'Mix'})
      const avatarState = yield *AvatarService.makeAvatar(null)

      yield *Effect.sleep('1 seconds');

      const res = yield *avatarState.enterInner({
        avatarId:avatarState.Id,
        fromGenerator:'external',
        toGenerator:'ollamaText',
        input:{
          from: 'user',
          text: '/get traveler tips',
          isExternal:true,
        },
        genNum:1,
        setting: {
        }
      })
      console.log('enterInner:',res);

      yield *Effect.sleep('20 seconds');

      console.log('context:',yield *avatarState.TalkContextEffect)

    }).pipe(
      aiRuntime.runPromise,
    )
  });

  //  現時点ファイルはimageのみ想定っぽい。テキストファイルは展開してプロンプト扱いにしていたはず。
  // it('generateContext_text_file', async () => {
  //   const res = await Effect.gen(function* () {
  //     const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
  //     // console.log(avatarState);
  //     yield* Effect.sleep('5 seconds'); //  avatarState生成直後はスケジュールリストはまだ更新されていない
  //
  //     const ai = yield* OllamaTextGenerator.make({
  //       host: "http://192.168.11.121:11434",
  //       model: "llava:7b-v1.6"
  //     });
  //
  //     // const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  //     const fs = yield* FileSystem.FileSystem;
  //     const file = yield *fs.readFileString(path.join(baseDir,'tests_fixtures/q1.txt'));
  //
  //     const url = yield *DocService.saveDocMedia('123', 'image/png', testImageBase64, 'vitestDummyId')
  //     return yield *ai.generateContext({avatarId:'aaaa',toGenerator:'ollamaText',input:{
  //         innerId: '1234567890',
  //         mediaUrl: url,
  //         mimeType: 'image/png',  //  mimeの指定は必須にしている
  //         text: 'What is in the picture?',
  //       }
  //     } as GenInner, avatarState);
  //   }).pipe(aiRuntime.runPromise,);
  //   console.log(res);
  //   expect(typeof res === 'object').toBe(true);
  // });


//  追加テスト: toAnswerOut (text のみ) で AsOutput が生成される
// it('toAnswerOut converts text response to outputs', async () => {
//   const ai = await openAiTextGenerator.make(vitestSysConfig, {
},5*60*1000);
