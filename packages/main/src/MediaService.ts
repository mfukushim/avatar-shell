import {Effect} from 'effect';
import path from 'node:path';
import {FileSystem} from '@effect/platform';
import {app} from 'electron';
import {ConfigService, ConfigServiceLive} from './ConfigService.js';
import {NodeFileSystem} from '@effect/platform-node';

//  @ts-ignore
import sound from 'sound-play';

export class MediaService extends Effect.Service<MediaService>()('avatar-shell/MediaService', {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cachePath = app ? path.join(app.getPath('userData'), 'mediaCache') : path.join(__dirname, '../../../tools/mp3');
    yield* fs.makeDirectory(cachePath, {recursive: true});

    function playSound(path: string) {
      console.log('playSound');
      //  TODO linux非対応
      //  TODO たしか再生部分は再生が終わったらここに来るのではなく、OS側に依頼が終わってから来るから、ここで再生データの長さ分だけ待たせないといけない
      return ConfigService.getMutableSetting().pipe(
        Effect.andThen(a => Effect.tryPromise({
        try: () => sound.play(path, a.volume || 1),
        catch: error => console.log(error),
      })),
        Effect.andThen(() => Effect.sleep('1 seconds')));  //  TODO 時間調整
    }

    return {
      playSound,
    };

  }),
  dependencies: [NodeFileSystem.layer,ConfigServiceLive],
}) {
}

export const MediaServiceLive = MediaService.Default;
