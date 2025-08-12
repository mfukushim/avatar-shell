//  注意: インポート順序に順序があるようだ。誤るとAvatarState.makeでエラーになる
import {Effect} from 'effect';
import {runPromise} from 'effect/Effect';
import {it, expect, describe, beforeEach} from '@effect/vitest';
import {AvatarState} from '../src/AvatarState';
import {ConfigServiceLive} from '../src/ConfigService';
import {McpServiceLive} from '../src/McpService';
import {DocServiceLive} from '../src/DocService';
import {MediaServiceLive} from '../src/MediaService';
import {vitestSysConfig} from '../../common/vitestConfig';
import { openAiTextGenerator, openAiImageGenerator, openAiVoiceGenerator } from '../src/OpenAiGenerator';
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
      const ai = yield* openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      return ai.getGeneratorInfo();
    }).pipe(runPromise);


    console.log(res);
    expect(typeof res === 'object').toBe(true);
  });

  it('setPreviousContext', async () => {
    const context: AsMessage[] = [
      {
        id: 'aaa',
        tick: 1,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'user',
          text: 'hello'
        }
      },
      {
        id: 'bbbb',
        tick: 2,
        asClass: 'talk',
        asRole: 'bot',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'mi',
          text: 'hello'
        }
      },
    ]
    const res = await Effect.gen(function* () {
      const ai = yield* openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield* ai.setPreviousContext(context);
      return ai
    }).pipe(
      Effect.provide([DocServiceLive, ConfigServiceLive]),
      runPromise
    );

    console.log(res);
    expect(typeof res === 'object').toBe(true);
    expect(res).toHaveProperty('prevContexts');
  });
  it('setCurrentContext', async () => {
    const context: AsMessage[] = [
      {
        id: 'aaa',
        tick: 1,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'user',
          text: 'hello'
        }
      },
      {
        id: 'bbbb',
        tick: 2,
        asClass: 'talk',
        asRole: 'bot',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'mi',
          text: 'hello'
        }
      },
    ]
    const talk: AsMessage[] = [
      {
        id: 'ccc',
        tick: 3,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'user',
          text: 'How are you?'
        }
      }
    ]
    const res = await Effect.gen(function* () {
      const ai = yield* openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield* ai.setPreviousContext(context);
      return yield* ai.setCurrentContext(talk.flatMap(v => [v.content]));
    }).pipe(
      Effect.provide([DocServiceLive, ConfigServiceLive]),
      runPromise
    );

    console.log(res);
    expect(typeof res === 'object').toBe(true);
    expect(res).toHaveProperty('task');
    expect(res).toHaveProperty('output');
  });

  it('execLlm', async () => {
    //  vitest --run --testNamePattern=execLlm OpenAiGenerator.unit.spec.ts
    const context: AsMessage[] = [
      {
        id: 'aaa',
        tick: 1,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'user',
          text: 'hello'
        }
      },
      {
        id: 'bbbb',
        tick: 2,
        asClass: 'talk',
        asRole: 'bot',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'mi',
          text: 'hello'
        }
      },
    ]
    const talk: AsMessage[] = [
      {
        id: 'ccc',
        tick: 3,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'user',
          text: 'How are you?'
        }
      }
    ]
    const res = await Effect.gen(function* () {
      const ai = yield* openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield* ai.setPreviousContext(context);
      const {task} = yield* ai.setCurrentContext(talk.flatMap(v => [v.content]));
      const taskVal = yield* task

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');

      return yield* ai.execLlm(taskVal as ResponseInputItem[], avatarState);
    }).pipe(
      Effect.provide([
        DocServiceLive, McpServiceLive, ConfigServiceLive, MediaServiceLive]),
      runPromise
    );

    console.log(JSON.stringify(res, null, 2));
    expect(typeof res === 'object').toBe(true);
    expect(Array.isArray(res)).toBe(true);
  });
  it('toAnswerOut', async () => {
    //  vitest --run --testNamePattern=execLlm OpenAiGenerator.unit.spec.ts
    const context: AsMessage[] = [
      {
        id: 'aaa',
        tick: 1,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'user',
          text: 'hello'
        }
      },
      {
        id: 'bbbb',
        tick: 2,
        asClass: 'talk',
        asRole: 'bot',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'mi',
          text: 'hello'
        }
      },
    ]
    const talk: AsMessage[] = [
      {
        id: 'ccc',
        tick: 3,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {
          from: 'user',
          text: 'How are you?'
        }
      }
    ]
    const res = await Effect.gen(function* () {
      const ai = yield* openAiTextGenerator.make(vitestSysConfig, {
        previousContextSize: 0,
        useContextType: ['text']
      });

      yield* ai.setPreviousContext(context);
      const {task} = yield* ai.setCurrentContext(talk.flatMap(v => [v.content]));
      const taskVal = yield* task

      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');

      const res = yield* ai.execLlm(taskVal as ResponseInputItem[], avatarState);
      return yield* ai.toAnswerOut(res, avatarState);
    }).pipe(
      Effect.provide([
        DocServiceLive, McpServiceLive, ConfigServiceLive, MediaServiceLive]),
      runPromise
    );

    console.log(JSON.stringify(res, null, 2));
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

//  追加テスト: setPreviousContext が user/assistant に変換されること
  it('setPreviousContext transforms roles into user/assistant messages', async () => {
    const context: AsMessage[] = [
      {
        id: 'h1',
        tick: 1,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {from: 'mfuku', text: 'hi'}
      },
      {
        id: 'b1',
        tick: 2,
        asClass: 'talk',
        asRole: 'bot',
        asContext: 'surface',
        isRequestAction: false,
        content: {from: 'mi', text: 'hello'}
      },
    ];
    const ai = await openAiTextGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['text']
    }).pipe(
      Effect.provide([ConfigServiceLive]),
      runPromise
    );
    await ai.setPreviousContext(context).pipe(
      Effect.provide([DocServiceLive, ConfigServiceLive]),
      runPromise
    );
    // @ts-ignore テストのため内部を確認
    const roles = (ai.prevContexts || []).map((m: any) => m.role);
    expect(roles).toEqual(expect.arrayContaining(['user', 'assistant']));
  });

//  追加テスト: getNativeContext は空配列
  it('getNativeContext returns empty array', async () => {
    const ai = await openAiTextGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['text']
    }).pipe(runPromise);
    const res = await ai.getNativeContext().pipe(
      Effect.provide([ConfigServiceLive, McpServiceLive]),
      runPromise
    );
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
  });

//  追加テスト: toAnswerOut (text のみ) で AsOutput が生成される
  it('toAnswerOut converts text response to outputs', async () => {
    const ai = await openAiTextGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['text']
    }).pipe(runPromise);

    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      const responseOut: any[] = [
        {
          type: 'message',
          id: 'm1',
          role: 'assistant',
          content: [{type: 'output_text', text: 'hello', annotations: []}],
        }
      ];
      return yield* ai.toAnswerOut(responseOut as any[], avatarState);
    }).pipe(
      Effect.provide([DocServiceLive, McpServiceLive, ConfigServiceLive, MediaServiceLive]),
      runPromise
    );

    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThan(0);
  });

//  追加テスト: OpenAiImageGenerator の toAnswerOut で画像出力が保存される
  it('openAiImageGenerator.toAnswerOut saves image and returns output', async () => {
    const ai = await openAiImageGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['image']
    }).pipe(runPromise);

    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      const responseOut: any[] = [
        {type: 'image_generation_call', id: 'img1', result: 'aGVsbG8='}
      ];
      return yield* ai.toAnswerOut(responseOut as any[], avatarState);
    }).pipe(
      Effect.provide([DocServiceLive, McpServiceLive, ConfigServiceLive, MediaServiceLive]),
      runPromise
    );

    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(1);
    expect(typeof res[0]).toBe('object');
  });

//  追加テスト: OpenAiVoiceGenerator の toAnswerOut で音声出力が保存される
  it('openAiVoiceGenerator.toAnswerOut saves audio when present', async () => {
    const ai = await openAiVoiceGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['text']
    }).pipe(runPromise);

    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      const responseOut: any[] = [
        {message: {audio: {data: 'UklGRg=='}}} // ダミーの音声データ
      ];
      return yield* ai.toAnswerOut(responseOut as any[], avatarState);
    }).pipe(
      Effect.provide([DocServiceLive, McpServiceLive, ConfigServiceLive, MediaServiceLive]),
      runPromise
    );

    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(1);
  });

//  追加テスト: execFuncCall 失敗時にフォールバック動作し、nextTask が返る
  it('execFuncCall falls back with text when tool invocation fails', async () => {
    const ai = await openAiTextGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['text']
    }).pipe(runPromise);

    const res = await Effect.gen(function* () {
      const avatarState = yield* AvatarState.make('aaaa', 'vitestDummyId', 'Mix', null, 'user');
      const responseOut: any[] = [
        {
          type: 'function_call',
          call_id: 'call1',
          name: 'unknown_tool_unknown_func',
          arguments: '{"x":1}'
        }
      ];
      return yield* ai.execFuncCall(responseOut as any[], avatarState);
    }).pipe(
      Effect.provide([DocServiceLive, McpServiceLive, ConfigServiceLive, MediaServiceLive]),
      runPromise
    );

    expect(typeof res === 'object').toBe(true);
    expect(Array.isArray(res.output)).toBe(true);
    expect(res).toHaveProperty('nextTask');
  });
//  追加テスト: setPreviousContext が user/assistant に変換されること
  it('setPreviousContext transforms roles into user/assistant messages', async () => {
    const context: AsMessage[] = [
      {
        id: 'h1',
        tick: 1,
        asClass: 'talk',
        asRole: 'human',
        asContext: 'surface',
        isRequestAction: false,
        content: {from: 'user', text: 'hi'}
      },
      {
        id: 'b1',
        tick: 2,
        asClass: 'talk',
        asRole: 'bot',
        asContext: 'surface',
        isRequestAction: false,
        content: {from: 'mi', text: 'hello'}
      },
    ];
    const ai = await openAiTextGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['text']
    }).pipe(
      Effect.provide([ConfigServiceLive]),
      runPromise
    );
    const res = await ai.setPreviousContext(context).pipe(
      Effect.provide([DocServiceLive, ConfigServiceLive]),
      runPromise
    );
    // クラスインスタンスを返さないので ai をそのまま確認
    // 保護プロパティだがテストでは実体を確認する
    // @ts-ignore
    const roles = (ai.prevContexts || []).map((m: any) => m.role);
    expect(roles).toEqual(expect.arrayContaining(['user', 'assistant']));
  });

//  追加テスト: getNativeContext は空配列
  it('getNativeContext returns empty array', async () => {
    const ai = await openAiTextGenerator.make(vitestSysConfig, {
      previousContextSize: 0,
      useContextType: ['text']
    }).pipe(runPromise);
    const res = await ai.getNativeContext().pipe(
      Effect.provide([ConfigServiceLive, McpServiceLive]),
      runPromise
    );
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
  });

//  追加テスト: toAnswerOut (text のみ) で AsOutput が生成される
// it('toAnswerOut converts text response to outputs', async () => {
//   const ai = await openAiTextGenerator.make(vitestSysConfig, {
},5*60*1000);
