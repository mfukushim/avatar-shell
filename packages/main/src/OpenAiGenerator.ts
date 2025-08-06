import {ContextGenerator, GeneratorOutput, GeneratorTask} from './ContextGenerator.js';
import {AvatarState} from './AvatarState.js';
import {Chunk, Effect, Option, Schedule, Stream} from 'effect';
import {AsMessage, AsMessageContent, AsOutput, SysConfig} from '../../common/Def.js';
import {DocService} from './DocService.js';
import {McpService} from './McpService.js';
import {ConfigService} from './ConfigService.js';
import {
  ContextGeneratorInfo,
  ContextGeneratorSetting, GeneratorProvider,
  OpenAiImageSettings,
  OpenAiSettings,
  OpenAiTextSettings, OpenAiVoiceSettings,
} from '../../common/DefGenerators.js';
import dayjs from 'dayjs';
import short from 'short-uuid';
import OpenAI, {APIError, } from 'openai';
import {ChatCompletion} from 'openai/resources'
import {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming, ResponseInputContent,
  ResponseInputItem, ResponseOutputItem,
  ResponseOutputMessage,
  ResponseOutputText,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import {TimeoutException} from 'effect/Cause';
import {z} from 'zod';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {LlmBaseGenerator} from './LlmGenerator.js';


export abstract class OpenAiBaseGenerator extends LlmBaseGenerator {
  protected openAiSettings: OpenAiSettings | undefined;
  protected openai: OpenAI;
  protected prevContexts: ResponseInputItem[] = [];
  protected abstract model:string;
  protected abstract genName:GeneratorProvider


  // static defaultModel = 'gpt-4.1-mini';

  constructor(ai:OpenAI) {
    super();
    this.openai = ai;
  }

  static generatorInfo: ContextGeneratorInfo = {
    usePreviousContext: true,
    defaultPrevContextSize: 100,
    inputContextTypes: ['image', 'text'],
    outputContextTypes: ['text'],
    contextRole: 'bot',
    addToMainContext: true,
  };


  getGeneratorInfo(): ContextGeneratorInfo {
    return OpenAiBaseGenerator.generatorInfo;
  }

  setPreviousContext(inContext: AsMessage[]): Effect.Effect<void, Error, DocService | ConfigService> {
    //  contextは指定長さで区切る 越えたら TODO 自動サマライズする
    const contextSize = this.openAiSettings?.previousContextSize || OpenAiBaseGenerator.generatorInfo.defaultPrevContextSize;
    if (inContext.length > contextSize) {
      //  TODO 自動サマライズする サマライズ用の指定のLLMとかあるだろうし、勝手にやるとまずいかも

    }
    inContext = inContext.slice(-contextSize).filter(value => ContextGenerator.matchContextType(value.content.mimeType, OpenAiBaseGenerator.generatorInfo.inputContextTypes));
    const state = this;
    return Effect.forEach(inContext, a => {
      return Effect.gen(function* () {
        // const llmData = state.contextCache.get(a.id);
        // if (llmData) {
        //   return llmData;
        // } else {
          //  isExternalの外部からの電文はその加工は送る側で行う形にするか。。セキュリティ的には別途考慮がいるだろうが。。
          return yield* Effect.gen(function* () {
            const llmContentIn: ResponseInputContent[] = [];
            const llmContentOut: (ResponseOutputText)[] = [];
            if (a.content.text) {
              if (a.asRole === 'bot') {
                llmContentOut.push({
                  type: 'output_text',
                  text: a.content.text,
                  annotations: [],
                });
              } else {
                llmContentIn.push({
                  type: 'input_text',
                  text: a.content.text,
                });
              }
            }
/*
TODO 以前の画像は重くなりそうなので外しておく 後で検討
            if (a.content.mediaUrl && a.content.mimeType && a.content.mimeType.startsWith('image')) {
              const media = yield* DocService.readDocMedia(a.content.mediaUrl);
              const b1 = yield* state.shrinkImage(Buffer.from(media, 'base64').buffer, state.openAiSettings?.inWidth);
              const b64 = b1.toString('base64');
              if (a.asRole === 'bot') {
                //  TODO ログ/外部からの画像再現は難しそう
              } else {
                llmContentIn.push({
                  type: 'input_image',
                  image_url: `data:${a.content.mimeType};base64,${b64}`,
                  detail: 'auto',
                });
              }
            }
*/
            if (a.asRole === 'bot') {
              if (llmContentOut.length === 0) {
                return [];
              }
              return [{
                type: 'message',
                role: 'assistant',
                content: llmContentOut,
              } as ResponseOutputItem];
            } else {
              if (llmContentIn.length === 0) {
                return [];
              }
              return [{
                type: 'message',
                role: 'user',
                content: llmContentIn,
              } as ResponseInputItem.Message];
            }
          });
        // }

      });
    }).pipe(Effect.andThen(a => {
      this.prevContexts = a.flat();
    }));
  }

  setCurrentContext(content:AsMessageContent[]): Effect.Effect<{
    task: Option.Option<GeneratorTask>,
    // output: AsOutput[]
  }, Error, DocService | ConfigService> {
    const state = this;
    console.log('current content:', content);
    return Effect.gen(function* () {
      const native = yield* Effect.forEach(content, a => {
        return Effect.gen(function* () {
          let content;
          if (a.text) {
            content = {
              type: 'input_text',
              text: a.text,
            } as ResponseInputContent
          } else if (a.mediaUrl && a.mimeType?.startsWith('image')) {
            //  openAIの場合、画像ファイルはinput_imageとしてbase64で送る
            const media = yield* DocService.readDocMedia(a.mediaUrl);
            const b1 = yield* state.shrinkImage(Buffer.from(media, 'base64').buffer, state.openAiSettings?.inWidth);
            const b64 = b1.toString('base64');
            const imageUrl = `data:${a.mimeType};base64,${b64}`;
            content = {
              type: 'input_image',
              image_url: imageUrl,
              detail: 'auto',
            } as ResponseInputContent
          }
          if (content) {
            // state.contextCache.set(a.id, item);
            return [content];
          }
          return [];
        });
      }).pipe(Effect.andThen(b => b.flat()))
      const item: ResponseInputItem = {
        type: 'message',
        role: 'user',
        content: native,
      };
      // const output = content.map((a, i) =>
      //   AsOutput.makeOutput(a, {
      //     provider: state.genName,
      //     model: state.model,
      //     isExternal: false,
      //   }, i === 0 ? [item] : []))
      return {task: Option.some([item])}
    })
  }

  toAnswerOut(responseOut: GeneratorOutput[], avatarState: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    const state = this;
    return Effect.gen(function* () {
      const textOut = responseOut.filter(b => b.type === 'message').map((b: ResponseOutputMessage) => {
        return AsOutput.makeOutput(AsMessage.makeMessage({
          innerId: b.id,
          from: avatarState.Name,
          //  ここには1回の実行結果が来るので本来 output_text は1件しかない
          text: b.content.filter(c => c.type === 'output_text').map(c => c.text).join('\n'),
        },state.openAiSettings?.toClass || 'talk',state.openAiSettings?.toRole, 'surface'),
          {provider: state.genName, model: state.model, isExternal: false,},[b])
      });
      const imageOut = yield* Effect.forEach(responseOut.filter(b => b.type === 'image_generation_call'), (b: ResponseOutputItem.ImageGenerationCall) => {
        return Effect.gen(function* () {
          const mime = 'image/png';
          const mediaUrl = yield* DocService.saveDocMedia(b.id, mime, b.result, avatarState.TemplateId);
          return AsOutput.makeOutput(AsMessage.makeMessage({
            innerId: b.id,
            from: avatarState.Name,
            mediaUrl: mediaUrl,
            mimeType: mime,
          },state.openAiSettings?.toClass || 'talk',state.openAiSettings?.toRole,'surface'),
            {provider: state.genName, model: state.model, isExternal: false,},[{type: 'image_generation_call', id: b.id,}])
        });
      });
      //  todo 音声合成についてはまたopenAi response APIはまだだそうだ
      const out = textOut.concat(imageOut);
      state.prevContexts.push(...out.flatMap(value => value.genNative as ResponseOutputMessage[]))
      return out
    });
  }

  execFuncCall(responseOut: GeneratorOutput[], avatarState: AvatarState): Effect.Effect<{
    output: AsOutput[],
    nextTask: Option.Option<ResponseInputItem[]>
  }, Error, DocService | McpService> {
    const state = this;
    const next: AsOutput[] = [];
    return Effect.forEach(responseOut.filter(b => b.type === 'function_call'), a1 => {
      //  ツールの実行と実行結果 実行前情報なので依頼としてiteratorに回す
      return Effect.gen(function* () {
        //  ツール依頼 実行後情報なのでここで追加する nativeはその前の
        const funcCall = AsMessage.makeMessage({
          innerId: `${a1.call_id}_in`,
          from: avatarState.Name,
          toolData: a1,
        }, 'physics', 'toolIn','inner');
        state.prevContexts.push(a1);
        next.push(AsOutput.makeOutput(funcCall,{
          provider: state.genName,
          model: state.model,
          isExternal: false,
        }))
        // console.log('a1:', a1);
        const toolRes = yield* McpService.callFunction(avatarState, {
          id: a1.call_id,
          name: a1.name,
          input: a1.arguments ? JSON.parse(a1.arguments) : {},
        },'openAiText').pipe(Effect.catchAll(e => {
          console.log('tool error:', e); //  tool denyの件もここに来る TODO denyと他エラーを分けたほうがよい
          return Effect.succeed({
            call_id: a1.call_id,
            toLlm: {
              content: [
                {
                  type: 'text',
                  text: `tool can not use.`,
                },
              ],
            },
          });
        }));
        console.log('toolRes:'); //  ,JSON.stringify(toolRes) JSON.stringify(a1)
        //  ここでツールが解析した結果のcontentを分離してAsMessageにする 理由として、表示側でコンテンツによって出力結果をフィルタしたいからだ ${toolRes.call_id}_out_0 はLLM付き _out_n は生成コンテンツごとの要素として表示とログに送る
        return yield* Effect.forEach((toolRes.toLlm as z.infer<typeof CallToolResultSchema>).content, a2 => {
          return Effect.gen(function* () {
            const content: any = {
              from: avatarState.Name,
            };
            const nextId = short.generate();
            let llmOut: any = a2;
            if (a2.type === 'text') {
              content.text = a2.text;
            } else if (a2.type === 'image') {
              //  TODO 画像をローカルに保存してurlを確定させる
              //  TODO コンテキストが大きくなり過ぎるので画像を十分小さくする とりあえず 64*64 他のモデルだと行ける?
              //  TODO どうもGPT-4oではresponseで画像を戻す
              //  TODO 一旦GPTでは画像を戻すのはやめる 一方で会話コンテキストモードも設定する
              //  TODO toolsのレスポンスではなく新規の画像の入力として入れる手はあるが
              // const fiber = yield* DocService.saveMedia(nextId, a2.data, a2.mimeType, state);
              content.mediaUrl = yield * DocService.saveDocMedia(nextId, a2.mimeType, a2.data, avatarState.TemplateId);
              // content.mediaUrlLocal = `data:${a2.mimeType};base64,${a2.data}`;  //  ネイティブデータを送る
              content.mimeType = 'image/png';
              //  TODO 一旦GPTでは画像情報はtoolから与えない
              llmOut = undefined;
              // } else if (a2.type === 'audio') {
              //   //  TODO 音声をローカルに保存してurlを確定させる
              //   // const fiber = yield* DocService.saveMedia(nextId, a2.data, a2.mimeType, state);
              //   // content.mediaUrlLocal = `data:${a2.mimeType};base64,${a2.data}`;  //  todo 音声埋め込めるか?
              //   content.mimeType = 'audio/mp3';
            } else if (a2.type === 'resource') {
              //  TODO resourceはuriらしい
              content.mediaUrl = a2.uri;
            }
            //  ツール実行結果なのでここで追加
            return [{
              llmOut: llmOut ? [{
                type: 'function_call_output',
                call_id: toolRes.call_id,
                output: JSON.stringify(llmOut),
                // content:[]
              } as ResponseInputItem] : [],
              mes: {
                id: nextId,
                tick: dayjs().valueOf(),
                asClass: 'physics', //  TODO ちょっと姑息だがtextだったらsystemにする。それ以外imageとかはtalkにする 後で一貫性について検討要
                asRole: 'toolOut',
                asContext:'inner',
                isRequestAction:false,
                content: content,
              } as AsMessage,
            }];
          }).pipe(Effect.catchAll(_ => Effect.succeed([])));
        }).pipe(Effect.andThen(a => a.flat()));
      });
    }).pipe(Effect.andThen(a => {
      const flat = a.flat();
      // const task = flat.flatMap(value => value.llmOut as ResponseInputItem[]);
      let nextTask: Option.Option<ResponseInputItem[]> = Option.none();
      if (flat.length > 0) {
        const task = flat.flatMap(a => a.llmOut);
        nextTask = Option.some(task);
        next.push(AsOutput.makeOutput(flat[0].mes,{provider: state.genName, model: state.model, isExternal: false,},task))
        next.push(...flat.slice(1).map(a => AsOutput.makeOutput(a.mes, {provider: 'openAiText' as GeneratorProvider, model: state.model, isExternal: false,})));
      }
      return Effect.succeed({output: next, nextTask: nextTask});
    }));
  }

  getNativeContext(): Effect.Effect<AsOutput[], void, ConfigService | McpService> {
    return Effect.succeed([]);  //  TODO
  }

}

export class openAiTextGenerator extends OpenAiBaseGenerator {
  protected genName:GeneratorProvider = 'openAiText';
  protected model = 'gpt-4.1-mini';

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<openAiTextGenerator,Error> {
    if (!sysConfig.generators.openAiText?.apiKey) {
      return Effect.fail(new Error('openAi API key is not set.'));
    }
    return Effect.succeed(new openAiTextGenerator(sysConfig, settings as OpenAiTextSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: OpenAiSettings) {
    super( new OpenAI({
      apiKey: sysConfig.generators.openAiText?.apiKey || '',
    }));
    this.openAiSettings = settings;
  }

  override execLlm(inputContext: ResponseInputItem[], avatarState: AvatarState): Effect.Effect<ResponseOutputItem[], void, ConfigService | McpService> {
    const state = this;
    console.log('openAi execLlm input:',inputContext);
    return Effect.gen(this, function* () {
      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      const toolsIn = tools.map(value => {
        return {
          type: 'function',
          name: value.name,
          description: value.description,
          parameters: value.inputSchema,
        };
      }) as OpenAI.Responses.Tool[];
      state.prevContexts.push(...inputContext);
      console.log('openAi execLlm input:',state.prevContexts);
      // console.log('openAi execLlm input:',state.prevContexts.map(value => JSON.stringify(value)).slice(200).join('\n'));

      const body: ResponseCreateParamsStreaming = {
        model: state.model,
        input: state.prevContexts,  //state.contexts.concat(state.currentContexts),
        tools: toolsIn,
        stream: true,
        // store:true,
      };
      const res = yield* Effect.tryPromise({
        try: () => {
          return state.openai.responses.create(body);
        },
        catch: error => {
          const e = error as APIError;
          console.log('error:', e.message);
          return new Error(`openAi API error:${e.message}`);
        },
      }).pipe(
        Effect.timeout('1 minute'),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced('5 seconds')))),
        Effect.catchIf(a => a instanceof TimeoutException, _ => Effect.fail(new Error(`openAI API error:timeout`))),
      );
      //  Stream部分実行をUIに反映
      const stream: Stream.Stream<ResponseStreamEvent, void> =
        Stream.fromAsyncIterable(res, (e) => new Error(String(e))).pipe(
          Stream.tap((ck) => {
            if (ck.type === `response.output_text.delta`) {
              state.sendStreamingText(ck.delta,avatarState)
            // } else if (ck.type === `response.output_text.done`) {
            //   state.clearStreamingText(avatarState)
            } else if (ck.type === `response.completed`) {
              console.log('response.completed');
            } else if (ck.type === `error`) {
              console.log('error');
            }
            return Effect.void;
          }),
        );
      //  確定実行結果取得
      const collect = yield* Stream.runCollect(stream);
      //  outListは1件のはず
      return Chunk.filter(collect, a => a.type === 'response.completed').pipe(
        Chunk.toReadonlyArray,
      ).map(a => a.response.output);
      //}
    }).pipe(Effect.andThen(a => Effect.succeed(a.flat())));
  }


}

export class openAiImageGenerator extends OpenAiBaseGenerator {
  protected genName:GeneratorProvider = 'openAiImage';
  protected model = 'gpt-4.1-mini';

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<OpenAiBaseGenerator,Error> {
    if (!sysConfig.generators.openAiText?.apiKey) {
      return Effect.fail(new Error('openAi API key is not set.'));
    }
    return Effect.succeed(new openAiImageGenerator(sysConfig, settings as OpenAiImageSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: OpenAiSettings) {
    super(new OpenAI({
      apiKey: sysConfig.generators.openAiText?.apiKey,
    }));
    this.openAiSettings = settings;
  }

  override execLlm(inputContext: ResponseInputItem[], avatarState: AvatarState): Effect.Effect<ResponseOutputItem[], void, ConfigService | McpService> {
    const state = this;
    return Effect.gen(this, function* () {
      // const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      // const toolsIn = tools.map(value => {
      //   return {
      //     type: 'function',
      //     name: value.name,
      //     description: value.description,
      //     parameters: value.inputSchema,
      //   };
      // }) as OpenAI.Responses.Tool[];
      const toolsIn = [(
        {
          type: 'image_generation',
          quality: 'low', //  TODO とりあえず
        })] as OpenAI.Responses.Tool[]
      const body: ResponseCreateParamsNonStreaming = {
        model: state.model,
        input: inputContext,
        tools: toolsIn,
        // store:true,
      };
      const res = yield* Effect.tryPromise({
        try: () => {
          return state.openai.responses.create(body);
        },
        catch: error => {
          const e = error as APIError;
          console.log('error:', e.message);
          return new Error(`openAi API error:${e.message}`);
        },
      }).pipe(
        Effect.timeout('1 minute'),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced('5 seconds')))),
        Effect.catchIf(a => a instanceof TimeoutException, _ => Effect.fail(new Error(`openAI API error:timeout`))),
      );
      return res.output;
    }).pipe(Effect.andThen(a => Effect.succeed(a.flat())));
  }

  override toAnswerOut(responseOut: GeneratorOutput[], avatarState: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    //  画像だけをアウトプットにする
    const state = this;
    return Effect.gen(function* () {
      const imageOut = yield* Effect.forEach(responseOut.filter(b => b.type === 'image_generation_call'), (b: ResponseOutputItem.ImageGenerationCall) => {
        return Effect.gen(function* () {
          const mime = 'image/png';
          const mediaUrl = yield* DocService.saveDocMedia(b.id, mime, b.result, avatarState.TemplateId);
          return AsOutput.makeOutput(AsMessage.makeMessage({
            innerId: b.id,
            from: avatarState.Name,
            mediaUrl: mediaUrl,
            mimeType: mime,
          },state.openAiSettings?.toClass || 'talk',state.openAiSettings?.toRole,'outer'),
            {
              provider: state.genName,
              model: state.model,
              isExternal: false,
            },[{
              type: 'image_generation_call',
              id: b.id,
            }])
        });
      });
      state.prevContexts.push(...imageOut.flatMap(value => value.genNative as ResponseOutputMessage[]))
      return imageOut;
    });
  }
}

export class openAiVoiceGenerator extends OpenAiBaseGenerator {
  protected genName:GeneratorProvider = 'openAiVoice';
  protected model = 'gpt-4o-audio-preview';
  protected voice = 'alloy';
  protected cutoffTextLimit = 150;

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<OpenAiBaseGenerator,Error> {
    if (!sysConfig.generators.openAiText?.apiKey) {
      return Effect.fail(new Error('openAi API key is not set.'));
    }
    return Effect.succeed(new openAiVoiceGenerator(sysConfig, settings as OpenAiVoiceSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: OpenAiVoiceSettings) {
    super(new OpenAI({
      apiKey: sysConfig.generators.openAiText?.apiKey,
    }));
    this.openAiSettings = settings;
    this.voice = sysConfig.generators.openAiVoice?.voice || 'alloy';
    this.cutoffTextLimit = sysConfig.generators.openAiVoice.cutoffTextLimit || 150;
  }

  execLlm(inputContext: ResponseInputItem[], avatarState: AvatarState): Effect.Effect<GeneratorOutput[], void, ConfigService | McpService> {
    const state = this;
    let text = inputContext.flatMap(value => {
      if (value.type === 'message') {
        if(typeof value.content === 'string') {
          return [value.content]
        }
        return value.content.filter(a => a.type === 'input_text').map(a => a.text)
      }
      return [];
    }).join(' ')
    if (text) {
      text = text.slice(0,state.cutoffTextLimit);
    }
    // if(inputContext.type !== 'message' || !Array.isArray(inputContext.content)) {
    //   return Effect.fail(new Error(`openAiVoiceGenerator only support message input.`));
    // }

    // const text = data.filter(a => a.type === 'input_text').map(a => a.text).join(' ')
    return Effect.gen(this, function* () {
      const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: state.model,
        modalities: ["text", "audio"],
        audio: { voice: state.voice, format: "wav" },
        messages: [
          {
            role: "user",
            content: text
          }
        ],
        // store:true,
      };
      const res = yield* Effect.tryPromise({
        try: () => {
          return state.openai.chat.completions.create(body);
        },
        catch: error => {
          const e = error as APIError;
          console.log('error:', e.message);
          return new Error(`openAi API error:${e.message}`);
        },
      }).pipe(
        Effect.timeout('1 minute'),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced('5 seconds')))),
        Effect.catchIf(a => a instanceof TimeoutException, _ => Effect.fail(new Error(`openAI API error:timeout`))),
      );
      return res.choices;
    });
  }

  override toAnswerOut(responseOut:  ChatCompletion.Choice[], avatarState: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    //  Voiceとして呼んだ場合は音声しか取り出さない
    const snd = responseOut[0].message.audio?.data;
    const state = this;
    return Effect.gen(function* () {
      const out: AsOutput[] = [];
      if (snd) {
        console.log('outImages:', snd.slice(0, 100));
        const id = short.generate();
        const mime = 'audio/wav';
        const mediaUrl = yield* DocService.saveDocMedia(id, mime, snd, avatarState.TemplateId);
        /*
        todo gemini側が生成した音声を以前の文脈としてgemini側に送るのは抑制まだ抑制しておく
        */
        out.push(AsOutput.makeOutput(AsMessage.makeMessage({from: avatarState.Name, mediaUrl: mediaUrl, mimeType: mime,}
        ,state.openAiSettings?.toClass || 'talk',state.openAiSettings?.toRole,'outer'),
          {provider: state.genName, model: state.model, isExternal: false,}))
      }
      return out;
    });
  }

}
