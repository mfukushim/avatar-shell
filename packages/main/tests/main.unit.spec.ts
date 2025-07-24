import {test} from 'vitest';

import {Effect} from 'effect';
import path from 'node:path';
import {runPromise} from 'effect/Effect';
import {ConfigServiceLive} from '../src/ConfigService';
import {MediaService, MediaServiceLive} from '../src/MediaService';


// test('test1', async () => {
//   //  vitest --run --testNamePattern=test1 main.unit.spec.ts
//   console.log(__dirname);
//   const result = Effect.runSync(test1);
// // Output: Hello, World!
//
//   console.log(result);
//   // expect(versions).toBe(process.versions);
// });


// test('mcpTest', async () => {
//   //  vitest --run --testNamePattern=mcpTest unit.spec.ts
//   const s = fs.readFileSync(path.join(__dirname, '../../../tools/testConfig.json'), {encoding: 'utf-8'});
//   const j = JSON.parse(s).sysConfig;
//   console.log(j);
//   const result = await McpService.init().pipe(
//     Effect.tap(a => Effect.log(a)),
//     // Effect.withConfigProvider(ConfigProvider.fromJson(j)),
//     Effect.provide([McpServiceLive, ConfigServiceLive,BuildInMcpServiceLive, Logger.logFmt]),
//     runPromise,
//   );
// // Output: Hello, World!
//
//   // expect(versions).toBe(process.versions);
// }, 5 * 60 * 1000);
// test('getToolDefs', async () => {
//   //  vitest --run --testNamePattern=getToolDefs main.unit.spec.ts
//   // const s = fs.readFileSync(path.join(__dirname, '../../../tools/testConfig.json'), {encoding: 'utf-8'});
//   // const j = JSON.parse(s).sysConfig;
//   return await Effect.gen(function* () {
//     // yield *ConfigService.updateSysConfig((s)=> s)
//     yield* McpService.init();
//     return yield* McpService.getToolDefs({
//       traveler: {
//         enable: true, //  デフォルトは enable=true
//         useTools: {
//           tips: {
//             enable: true,  //  デフォルトは enable:true
//             allow: 'any', // ask,anytime デフォルトはask
//           },
//           set_traveler_info: {
//             enable: false,  //  デフォルトは enable:true
//             allow: 'no', // ask,anytime デフォルトはask
//           },
//         },
//       },
//       memory: {
//         enable: false,
//         useTools: {
//           create_entities: {
//             enable: true,
//             allow: 'no',
//           },
//           create_relations: {
//             enable: false,
//             allow: 'ask',
//           },
//         },
//       },
//     });
//   }).pipe(
//     Effect.tap(a => Effect.log(a)),
//     Effect.provide([McpServiceLive,ConfigServiceLive, DocServiceLive,BuildInMcpServiceLive]),
//     runPromise,
//   );
//
//   // expect(versions).toBe(process.versions);
// }, 5 * 60 * 1000);

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
