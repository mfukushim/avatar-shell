import {expect, test} from 'vitest';

import {Effect} from 'effect';
import {versions} from '../src';



test('versions', async () => {
  console.log(
    'versions',
    process.versions,
    versions,);
  expect(versions).toBe(process.versions);
});

// test('test1', async () => {
//   const result = Effect.runSync(test1)
// // Output: Hello, World!
//
//   console.log(result)
//   // expect(versions).toBe(process.versions);
// });
//
