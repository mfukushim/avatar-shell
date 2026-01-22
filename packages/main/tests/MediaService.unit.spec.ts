import {it, describe, vi, beforeEach, afterEach} from '@effect/vitest';
import {Effect} from 'effect';
import {runPromise} from 'effect/Effect';
import {NodeFileSystem} from '@effect/platform-node';
import path from 'path';
import {ConfigServiceLive} from '../src/ConfigService.js';
import {MediaService, MediaServiceLive} from '../src/MediaService.js';
import * as fs from 'fs';


const inGitHubAction = process.env.GITHUB_ACTIONS === 'true';

describe("MediaService", () => {
  // テスト用の一時的な音声ファイルパス
  const testSoundPath = path.join(__dirname, '../../../tools/test.mp3');

  beforeEach(() => {
    // テスト用の音声ファイルが存在することを確認
    if (!fs.existsSync(path.dirname(testSoundPath))) {
      fs.mkdirSync(path.dirname(testSoundPath), { recursive: true });
    }

    // 空のファイルを作成（実際の音声ファイルは必要ない、パスだけ必要）
    if (!fs.existsSync(testSoundPath)) {
      fs.writeFileSync(testSoundPath, '');
    }
  });

  afterEach(() => {
    // テスト後のクリーンアップ（必要に応じて）
    // fs.unlinkSync(testSoundPath);
  });

  it('playSound', async () => {
    //  TODO 今使ってないはず。。
    await Effect.gen(function* () {
      yield* MediaService.playSound(testSoundPath);
    }).pipe(
      Effect.provide([MediaServiceLive, ConfigServiceLive, NodeFileSystem.layer]),
      runPromise,
    );

  });

},5 * 60 * 1000);
