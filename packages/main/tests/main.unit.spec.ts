import {test} from 'vitest';

import {Effect} from 'effect';
import path from 'node:path';
import {runPromise} from 'effect/Effect';
import {ConfigServiceLive} from '../src/ConfigService';
import {MediaService, MediaServiceLive} from '../src/MediaService';


test('MediaService_playSound', async () => {
  //  vitest --run --testNamePattern=MediaService_playSound main.unit.spec.ts
  console.log(__dirname);
  return await Effect.gen(function* () {
    // const sysConfig = yield* SubscriptionRef.make(sysInit);
    // const sys = yield* SubscriptionRef.get(sysConfig);
    yield* MediaService.playSound(path.join(__dirname, '../../../tools/test.mp3'));
  }).pipe(
    Effect.tap(a => Effect.log(a)),
    Effect.provide([MediaServiceLive,ConfigServiceLive]),
    runPromise,
  );

  // expect(versions).toBe(process.versions);
}, 5 * 60 * 1000);
