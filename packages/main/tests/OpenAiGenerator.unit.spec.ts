//  注意: インポート順序に順序があるようだ。誤るとAvatarState.makeでエラーになる
import {Effect} from 'effect';
import {runPromise} from 'effect/Effect';
import {it, expect, describe, beforeEach} from '@effect/vitest';
import {AvatarState} from '../src/AvatarState';
import {ConfigServiceLive} from '../src/ConfigService';
import {McpService, McpServiceLive} from '../src/McpService';
import {DocServiceLive} from '../src/DocService';
import {MediaServiceLive} from '../src/MediaService';
import {BuildInMcpServiceLive} from '../src/BuildInMcpService';
import {vitestSysConfig} from '../../../tools/vitestConfig';
import { openAiTextGenerator } from '../src/OpenAiGenerator';
import {ResponseInputItem} from 'openai/resources/responses/responses';
import {AsMessage} from '../../common/Def';

describe('OpenAiGenerator', () => {
  beforeEach(() => {
  });

  it('make', async () => {
    const ai = await openAiTextGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['text']
    }).pipe(runPromise);

    expect(typeof ai === 'object').toBe(true);
  });

  it('getGeneratorInfo', async () => {
    const res = await Effect.gen(function* () {
      const ai = yield *openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      return ai.getGeneratorInfo();
    }).pipe(runPromise);


    console.log(res);
    expect(typeof res === 'object').toBe(true);
  });

  it('setPreviousContext', async () => {
    const context:AsMessage[] = [
      {
        id:'aaa',
        tick:1,
        asClass:'talk',
        asRole:'human',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'user',
          text:'hello'
        }
      },
      {
        id:'bbbb',
        tick:2,
        asClass:'talk',
        asRole:'bot',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'mi',
          text:'hello'
        }
      },
    ]
    const res = await Effect.gen(function* () {
      const ai = yield *openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield *ai.setPreviousContext(context);
      return ai
    }).pipe(
      Effect.provide([DocServiceLive,ConfigServiceLive]),
      runPromise
    );

    console.log(res);
    expect(typeof res === 'object').toBe(true);
    expect(res).toHaveProperty('prevContexts');
  });
  it('setCurrentContext', async () => {
    const context:AsMessage[] = [
      {
        id:'aaa',
        tick:1,
        asClass:'talk',
        asRole:'human',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'user',
          text:'hello'
        }
      },
      {
        id:'bbbb',
        tick:2,
        asClass:'talk',
        asRole:'bot',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'mi',
          text:'hello'
        }
      },
    ]
    const talk:AsMessage[] = [
      {
        id:'ccc',
        tick:3,
        asClass:'talk',
        asRole:'human',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'user',
          text:'How are you?'
        }
      }
    ]
    const res = await Effect.gen(function* () {
      const ai = yield *openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield *ai.setPreviousContext(context);
      return yield *ai.setCurrentContext(talk.flatMap(v=>[v.content]));
    }).pipe(
      Effect.provide([DocServiceLive,ConfigServiceLive]),
      runPromise
    );

    console.log(res);
    expect(typeof res === 'object').toBe(true);
    expect(res).toHaveProperty('task');
    expect(res).toHaveProperty('output');
  });

  it('execLlm', async () => {
    //  vitest --run --testNamePattern=execLlm OpenAiGenerator.unit.spec.ts
    const context:AsMessage[] = [
      {
        id:'aaa',
        tick:1,
        asClass:'talk',
        asRole:'human',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'user',
          text:'hello'
        }
      },
      {
        id:'bbbb',
        tick:2,
        asClass:'talk',
        asRole:'bot',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'mi',
          text:'hello'
        }
      },
    ]
    const talk:AsMessage[] = [
      {
        id:'ccc',
        tick:3,
        asClass:'talk',
        asRole:'human',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'user',
          text:'How are you?'
        }
      }
    ]
    const res = await Effect.gen(function* () {
      const ai = yield *openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield *ai.setPreviousContext(context);
      const {task} = yield *ai.setCurrentContext(talk.flatMap(v=>[v.content]));
      const taskVal =yield *task

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');

      return yield *ai.execLlm(taskVal as ResponseInputItem[], avatarState);
    }).pipe(
      Effect.provide([
        DocServiceLive,McpServiceLive, ConfigServiceLive,MediaServiceLive]),
      runPromise
    );

    console.log(JSON.stringify(res,null,2));
    expect(typeof res === 'object').toBe(true);
    expect(Array.isArray(res)).toBe(true);
  });
  it('toAnswerOut', async () => {
    //  vitest --run --testNamePattern=execLlm OpenAiGenerator.unit.spec.ts
    const context:AsMessage[] = [
      {
        id:'aaa',
        tick:1,
        asClass:'talk',
        asRole:'human',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'user',
          text:'hello'
        }
      },
      {
        id:'bbbb',
        tick:2,
        asClass:'talk',
        asRole:'bot',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'mi',
          text:'hello'
        }
      },
    ]
    const talk:AsMessage[] = [
      {
        id:'ccc',
        tick:3,
        asClass:'talk',
        asRole:'human',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'user',
          text:'How are you?'
        }
      }
    ]
    const res = await Effect.gen(function* () {
      const ai = yield *openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield *ai.setPreviousContext(context);
      const {task} = yield *ai.setCurrentContext(talk.flatMap(v=>[v.content]));
      const taskVal =yield *task

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');

      const res = yield *ai.execLlm(taskVal as ResponseInputItem[], avatarState);
      return yield *ai.toAnswerOut(res, avatarState);
    }).pipe(
      Effect.provide([
        DocServiceLive,McpServiceLive, ConfigServiceLive,MediaServiceLive]),
      runPromise
    );

    console.log(JSON.stringify(res,null,2));
    expect(typeof res === 'object').toBe(true);
    expect(Array.isArray(res)).toBe(true);
  });
/*
  it('execFuncCall', async () => {
    //  vitest --run --testNamePattern=execLlm OpenAiGenerator.unit.spec.ts
    const context:AsMessage[] = []
    const talk:AsMessage[] = [
      {
        id:'ccc',
        tick:3,
        asClass:'talk',
        asRole:'human',
        asContext:'surface',
        isRequestAction:false,
        content:{
          from:'user',
          text:'get_traveler_view_info'
        }
      }
    ]
    const res = await Effect.gen(function* () {
      yield* McpService.initial();

      const ai = yield *openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield *ai.setPreviousContext(context);
      const {task} = yield *ai.setCurrentContext(talk.flatMap(v=>[v.content]));
      const taskVal =yield *task

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId','Mix',null,'user');

      const res = yield *ai.execLlm(taskVal as ResponseInputItem[], avatarState);
      console.log('execLlm',res);
      const ans = yield *ai.toAnswerOut(res, avatarState);
      console.log('ans',ans);
      return yield *ai.execFuncCall(res, avatarState);
    }).pipe(
      Effect.provide([
        DocServiceLive,McpServiceLive, ConfigServiceLive,BuildInMcpServiceLive,MediaServiceLive]),
      runPromise
    );

    console.log(JSON.stringify(res,null,2));
    expect(typeof res === 'object').toBe(true);
    expect(Array.isArray(res.output)).toBe(true);
    expect(res).toHaveProperty('nextTask');
  });
*/


},5*60*1000);
