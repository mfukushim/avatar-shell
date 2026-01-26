import {ContextGenerator} from './ContextGenerator.js';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {Chunk, Effect, Schedule, Stream} from 'effect';
import {SysConfig} from '../../../common/Def.js';
import {DocService} from '../DocService.js';
import {McpService} from '../McpService.js';
import {ConfigService} from '../ConfigService.js';
import {
  OpenAiTextSettings,
  OpenAiSettings,
  ContextGeneratorInfo,
  ContextGeneratorSetting,
  GeneratorProvider, OpenAiImageSettings,
} from '../../../common/DefGenerators.js';
import {MediaService} from '../MediaService.js';
import OpenAI, {APIError} from 'openai';
import {
  ResponseCreateParams,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionToolCall,
  ResponseInputContent,
  ResponseInputImage,
  ResponseInputItem,
  ResponseInputText,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseOutputRefusal,
  ResponseOutputText,
  Response,
} from 'openai/resources/responses/responses';
import ResponseCreateParamsStreaming = ResponseCreateParams.ResponseCreateParamsStreaming;
import {TimeoutException} from 'effect/Cause';
import short from 'short-uuid';

/**
 * OpenAI(GPT)コンテキストジェネレーター基底
 * Abstract base class for generating AI-based responses using OpenAI models.
 * The class extends `ContextGenerator` and provides foundational structures for working with OpenAI APIs.
 * It includes methods for filtering tool responses, generating previous and current context, and handling various input-output content formats.
 *
 * This class must be extended to define specific model configurations and behaviors.
 */
export abstract class OpenAiBaseGenerator extends ContextGenerator {
  protected openAiSettings: OpenAiSettings | undefined;
  protected openai: OpenAI;
  //protected contextCache: Map<string, Content> = new Map(); aiコンテンツとasMessageが非対応なのでちょっとやり方を考える。。
  protected abstract model: string;
  protected abstract genName: GeneratorProvider;
  protected override maxModelContextSize = 128000 //  TODO APIで最大コンテキスト取得が出来ないため 12Kと仮定

  static generatorInfo: ContextGeneratorInfo = {
    usePreviousContext: true,
    defaultPrevContextSize: 100,
    inputContextTypes: ['image', 'text'],
    outputContextTypes: ['text'],
    contextRole: 'bot',
    addToMainContext: true,
  };

  constructor(sysConfig: SysConfig) {
    super(sysConfig);
    this.openai = new OpenAI({
      apiKey: sysConfig.generators.openAiText?.apiKey || '',
    });
  }

  setSystemPrompt(context: string) {

  }

  protected get previousContexts() {
    return this.previousNativeContexts as (ResponseInputItem | null)[];
  }

  // filterToolRes(value: any) {
  //   if (value.type === 'resource' && value.resource?.annotations && value.resource.annotations?.audience) {
  //     //  @ts-ignore
  //     if (!value.resource.annotations.audience.includes('assistant')) {
  //       console.log('contents test no out');
  //       return;
  //     }
  //   }
  //   //  @ts-ignore
  //   if (value?.annotations && value.annotations?.audience) {
  //     //  @ts-ignore
  //     if (!value.annotations.audience.includes('assistant')) {
  //       console.log('contents test no out');
  //       return;
  //     }
  //   }
  //   return value;
  // }
  //
  // filterToolResList(value: any) {
  //   try {
  //     return value.content.flatMap((a: any) => {
  //       const b = this.filterToolRes(a);
  //       return b ? [b]:[]
  //     });
  //   } catch (error) {
  //     console.log('filterToolResList error:', error);
  //     throw error;
  //   }
  // }

  protected makePreviousContext(avatarState: AvatarState, current: GenInner) {
    const it = this;
    return Effect.gen(function* () {
      const prevMes = yield* avatarState.TalkContextEffect;
      console.log('OpenAi prevMes:', prevMes.map(a => '##' + JSON.stringify(a).slice(0, 200)).join('\n'));
      const out: ResponseInputItem[] = [];
      const toolOutMap: Map<string, ResponseInputItem.FunctionCallOutput> = new Map();
      it.filterForLlmPrevContext(prevMes, current.input).forEach(a => {
        const role = it.asRoleToRole(a.asRole);
        if (a.asRole === 'human') {
          const parts: ResponseInputContent[] = [];
          if (a.content.text) {
            parts.push({
              type: 'input_text', //value.role === 'user' ? 'input_text':'output_text',
              text: a.content.text,
            });
          }
          out.push({
            role: role,
            content: parts,
          });
          //  TODO 現時点 prevで画像コンテンツは送らない方向にする 過去の参照idだけでやる方法を検討
        } else if (a.asRole === 'bot') {
          const parts: (ResponseOutputText | ResponseOutputRefusal)[] = [];
          if (a.content.text) {
            parts.push({
              type: 'output_text', //value.role === 'user' ? 'input_text':'output_text',
              text: a.content.text,
              annotations: [],  //  TODO 未処理 どうするか
            });
          }
          out.push({
            id: a.content.innerId || '',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: parts,
          });
          //  TODO 現時点 prevで画像コンテンツは送らない方向にする 過去の参照idだけでやる方法を検討
        } else if (a.asRole === 'toolIn') {
          out.push({
            type: 'function_call',
            call_id: a.content.toolReq.callId,
            arguments: JSON.stringify(a.content.toolReq.input),
            name: a.content.toolReq.name,
          });
        } else if (a.asRole === 'toolOut') {
          //  TODO toolOutはinnerIdで一旦グループマージしてその結果をjson結合して、outputにマージする必要がある。。。
          const r = it.filterToolRes(a.content.toolRes)
          if (r && a.content.innerId) {
            const r1 = it.OpenAiAnnotationFilter(r);
            const m = toolOutMap.get(a.content.innerId)
            if (m) {
              m.output = JSON.parse(m.output).push(r1); //  TODO ちょっとゴリ押し。。
            } else {
              const items:ResponseInputItem.FunctionCallOutput = {
                type: 'function_call_output',
                call_id: a.content.innerId,
                output: JSON.stringify([r1]),
              };
              out.push(items);
              toolOutMap.set(a.content.innerId, items);
            }
          }
        } else {
          //  system
          console.log('OpenAi prevMes error:', a);
        }
      })
      console.log('OpenAi prevMes out:', out.map(a => '@@' + JSON.stringify(a).slice(0, 200)).join('\n'));
      return out;
    });
  }

  private OpenAiAnnotationFilter(v: any) {
    const r = {
      ...v,
    };
    delete r.annotations; //  TODO ツールレスポンスの annotations は受け入れない でよいか
    return r;
  }

  protected makeCurrentContext(current: GenInner) {
    const it = this;
    return Effect.gen(function* () {
      const mesList: ResponseInputItem[] = [];
      const mesContent = [] as ResponseInputContent[];
      if (current.input?.content.text) {
        mesContent.push({
          type: 'input_text',
          text: current.input.content.text,
        } as ResponseInputText);
      } else if (current.toolCallRes) {
        current.toolCallRes.forEach(value => {
          const callOut = it.filterToolResList(value.results).map((v: any) => it.OpenAiAnnotationFilter(v));
          //  結果として0件になった場合は登録しない(resource/uri=ui:など
          if (callOut.length > 0){
            mesList.push({
              type: 'function_call_output',
              call_id: value.callId,
              output: JSON.stringify(callOut), //.map((v:any) => it.OpenAiAnnotationFilter(v)),
            });
          }
        });
      }
      if (current.input?.content.mediaUrl && current.input?.content.mimeType && current.input?.content.mimeType.startsWith('image')) {
        //  openAIの場合、画像ファイルはinput_imageとしてbase64で送る
        const media = yield* DocService.readDocMedia(current.input.content.mediaUrl);
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.openAiSettings?.inWidth);
        const b64 = b1.toString('base64');
        const imageUrl = `data:${current.input.content.mimeType};base64,${b64}`;
        //  縮小した画像をLLMには送る
        mesContent.push({
          type: 'input_image',
          image_url: imageUrl,
          detail: 'auto',
        } as ResponseInputImage);

        // const media = yield* DocService.readDocMedia(current.input.mediaUrl);
        // const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.OpenAiSettings?.inWidth);
        // const blob = new Blob([b1], {type: 'image/png'});
        // const myfile = yield* Effect.tryPromise(() => it.ai.files.upload({
        //   file: blob,
        //   config: {mimeType: 'image/png'},
        // }));
        // if (myfile.uri && myfile.mimeType) {
        //   const imagePart = createPartFromUri(myfile.uri, myfile.mimeType);
        //   mes.parts.push(imagePart);
        // }
      }
      if (mesContent.length > 0) {
        return [{
          type: 'message',
          role: 'user',
          content: mesContent,
        } as ResponseInputItem].concat(mesList);
      }
      return mesList;
    });
  }
}

/**
 * GPT textコンテキストジェネレーター
 */
export class OpenAiTextGenerator extends OpenAiBaseGenerator {
  protected genName: GeneratorProvider = 'openAiText';
  protected model = 'gpt-4.1-mini';
  protected systemPrompt?: [OpenAI.Responses.ResponseInputItem]

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting) {
    if (!sysConfig.generators.openAiText?.apiKey) {
      return Effect.fail(new Error('OpenAi api key is not set.'));
    }
    //  TODO 現時点OpenAIのAPIでモデルのコンテキスト長を取得するAPIはない。。
    return Effect.succeed(new OpenAiTextGenerator(sysConfig, settings as OpenAiTextSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: OpenAiSettings) {
    super(sysConfig);
    this.openAiSettings = settings;
    this.model = settings?.useModel || sysConfig.generators.openAiText?.model || 'gpt-4.1-mini';
  }

  setSystemPrompt(context: string) {
    this.systemPrompt = [{role:'developer', content:[{type:'input_text', text:context}]}];
  }

  generateContext(current: GenInner, avatarState: AvatarState, option?: {
    noTool?: boolean
  }): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prevMake = yield* it.makePreviousContext(avatarState, current);
      let prev:ResponseInputItem[] = []
      const lessCutoff = it.sysSetting.generators.openAiText.common?.cutoffChatLimit || Number.MAX_SAFE_INTEGER;
      if (lessCutoff !== Number.MAX_SAFE_INTEGER) {
        const sum = Array.from(it.previousContexts).reduce((previousValue, currentValue) => {
          if(currentValue === null){
            previousValue.list.push(previousValue.buf)
            return {list:previousValue.list,buf:[]}
          }
          return {list:previousValue.list,buf:previousValue.buf.concat(currentValue)}
        },{list:[] as ResponseInputItem[][],buf:[] as ResponseInputItem[]})
        if(sum.buf.length > 0) {
          sum.list.push(sum.buf)
        }

        const cutoff = sum.list.reverse().reduce((previousValue, currentValue) => {
          if (previousValue.count <= 0) {
            return previousValue;
          }
          const next = previousValue.out.concat(currentValue.reverse());
          previousValue.count-= currentValue.length
          return {out:next,count:previousValue.count}
        },{out:[] as ResponseInputItem[][],count:lessCutoff})
        prev = cutoff.out.reverse().flat().filter(value => !(value.type === 'message' && value.role === 'developer'))
      } else {
        prev = Array.from(it.previousContexts).filter((value):value is ResponseInputItem  => value !== null && !(value.type === 'message' && value.role === 'developer'))
        // prev = Array.from(it.getPreviousNativeContexts()).filter((value):value is  Anthropic.Messages.MessageParam => value !== null);  // ユーザからのmcpExternalで
      }
      // const prev = Array.from(it.previousContexts).filter(value => !(value.type === 'message' && value.role === 'developer')) //  古いsys promptは除去
      //  TODO prevMakeとprevの差分チェックは後々必要
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes = yield* it.makeCurrentContext(current);

      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      const toolsIn = tools.map(value => {
        return {
          type: 'function',
          name: value.name,
          description: value.description,
          parameters: value.inputSchema,
        };
      }) as OpenAI.Responses.Tool[];
      //  prev+currentをLLM APIに要求、レスポンスを取得
      const contents = (it.systemPrompt || [] as OpenAI.Responses.ResponseInputItem[]).concat(prev, mes);
      console.log('OpenAi context:\n', contents.map(a => '##' + JSON.stringify(a).slice(0, 300)).join('\n'));
      console.log('OpenAi context end:');
      const body: ResponseCreateParamsStreaming = {
        model: it.model,
        input: contents,
        tools: toolsIn,
        stream: true,
        // store:true,
      };
      mes.forEach(a => {
        it.previousNativeContexts.push(a)
      })

      const res = yield* Effect.tryPromise({
        try: () => {
          return it.openai.responses.create(body);
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
      const stream =
        Stream.fromAsyncIterable(res, (e) => new Error(String(e))).pipe(
          Stream.tap((ck) => {
            if (ck.type === `response.output_text.delta`) {
              it.sendStreamingText(ck.delta, avatarState);
              // } else if (ck.type === `response.completed`) {
              //   console.log('response.completed');
            } else if (ck.type === `error`) {
              console.log('error');
            }
            return Effect.void;
          }),
        );
      //  確定実行結果取得
      const collect = yield* Stream.runCollect(stream);
      const responseOut = Chunk.filter(collect, a => a.type === 'response.completed').pipe(
        Chunk.toReadonlyArray,
      ).map(a => a.response.output).flat();
      console.log('responseOut:', JSON.stringify(responseOut));
      responseOut.forEach(a => {
        it.previousNativeContexts.push(a) //  TODO ResponseOutputItemをResponseInputItemに変換する必要があるケースがあったはず。。
      })
      const textOut = responseOut.filter(b => b.type === 'message').map((b: ResponseOutputMessage) => {
        //  TODO mesIdは1件のはず?
        return {id: b.id, text: b.content.filter(c => c.type === 'output_text').map(c => c.text).join('\n')};
      });
      console.log('textOut:', JSON.stringify(textOut));
      const responseUsage = Chunk.filter(collect, a => a.type === 'response.completed').pipe(
        Chunk.toReadonlyArray,
      ).map(a => a.response.usage).flat().filter((value):value is OpenAI.Responses.ResponseUsage => value !== undefined).map(a => a.input_tokens)
      const inputTokens = responseUsage.reduce((a, b) => a + b, 0)

      //  TODO 2つのレスポンスがある場合がとりあえず0番目に絞る。。
      // if (textOut.length > 1) {
      //   return yield* Effect.fail(new Error(`response.completed > 1:${textOut.length}`));
      // }
      const nextGen = current.genNum + 1;
      const genOut: GenOuter[] = [];
      if (textOut.length >= 1) {
        it.inputTokens = inputTokens;
        genOut.push({
          avatarId: current.avatarId,
          fromGenerator: it.genName,
          fromModelName:it.model,
          inputTokens: inputTokens,
          maxContextSize: it.maxModelContextSize,
          toGenerator: it,
          innerId: textOut[0].id,
          outputText: textOut[0].text,
          genNum: nextGen,
        });
      }
      const funcCallReq: ResponseFunctionToolCall[] = responseOut.filter(b => b.type === 'function_call');
      if (funcCallReq.length > 0) {
        console.log('OpenAi toolCallParam:', JSON.stringify(funcCallReq), textOut);
        //  TODO ここのfunc call の書式がまだ合ってない
        genOut.push({
          avatarId: current.avatarId,
          fromGenerator: it.genName,
          fromModelName:it.model,
          inputTokens: inputTokens,
          maxContextSize: it.maxModelContextSize,
          toGenerator: it,
          innerId: (textOut.length > 0 ? textOut[0].id : undefined) || current.input?.content.innerId || short.generate(),  //  ここのinnerIdはどこに合わせるのがよいか。。textOut[0]があればそれに合わせる形かな。。
          toolCallParam: funcCallReq.map((v) => {
            return {
              callId: v.call_id,
              name: v.name || '',
              input: v.arguments ? JSON.parse(v.arguments) : {},
            };
          }),
          genNum: nextGen,
        });
      }
      return genOut;
    }).pipe(Effect.catchAll(e => {
      console.log('OpenAiTextGenerator generatorContext error:', e);
      return Effect.fail(new Error(`${e}`));
    }));
  }
}

/**
 * GPT 画像合成
 * 画像と一緒に説明テキストを追加してしまうので、現時点テキストを外す。
 */
export class OpenAiImageGenerator extends OpenAiBaseGenerator {
  protected genName: GeneratorProvider = 'openAiImage';
  protected model = 'gpt-4.1-mini';

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<OpenAiImageGenerator, Error> {
    if (!sysConfig.generators.openAiText?.apiKey) {
      return Effect.fail(new Error('openAi API key is not set.'));
    }
    return Effect.succeed(new OpenAiImageGenerator(sysConfig, settings as OpenAiImageSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: OpenAiSettings) {
    super(sysConfig)
    this.openAiSettings = settings;
    this.model = settings?.useModel || sysConfig.generators.openAiImage?.model || 'gpt-4.1-mini';
  }

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prev: ResponseInputItem[] = []; //   yield* it.makePreviousContext(avatarState);  //  TODO 画像生成時はいまのところ履歴は反映させずに直近プロンプトのみ反映
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes = yield* it.makeCurrentContext(current);

      //  prev+currentをLLM APIに要求、レスポンスを取得
      const contents = prev.concat(mes);
      const body: ResponseCreateParamsNonStreaming = {
        model: it.model,
        input: contents,
        tools: [({type: 'image_generation', quality: 'low'})] as OpenAI.Responses.Tool[],
        // store:true,
      };
      const responseOut: Response = yield* Effect.tryPromise({
        try: () => it.openai.responses.create(body),
        catch: error => {
          const e = error as APIError;
          // console.log('error:', e.message);
          return new Error(`openAi API error:${e.message}`);
        },
      }).pipe(
        Effect.timeout('1 minute'),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced('5 seconds')))),
        Effect.catchIf(a => a instanceof TimeoutException, _ => Effect.fail(new Error(`openAI API error:timeout`))),
      );

      //  確定実行結果取得
      const resImage = responseOut.output.filter(b => b.type === 'image_generation_call').flatMap((b: ResponseOutputItem.ImageGenerationCall) => {
        return {img: b.result, id: b.id};
      });
      const resText = responseOut.output.filter(b => b.type === 'message').flatMap((b: ResponseOutputMessage) => {
        return b.content.map(value => {
          if (value.type === 'output_text') {
            return {text: value.text, id: b.id};
          }
          return {text: value.refusal, id: b.id};
        });
      });

      const nextGen = current.genNum + 1;
      const genOut: GenOuter[] = [];
      if (resImage.length > 0) {
        resImage.forEach(value => {
          genOut.push({
            avatarId: current.avatarId,
            fromGenerator: it.genName,
            fromModelName:it.model,
            inputTokens: responseOut?.usage?.input_tokens,
            maxContextSize: it.maxModelContextSize,
            toGenerator: it,
            innerId: value.id,
            outputRaw: value.img!,
            outputMime: 'image/png',
            genNum: nextGen,
          });
        });
      }
      //  TODO 画像と一緒に説明テキストを追加してしまうので、現時点テキストを外す。
      // if (resText.length > 0) {
      //   resText.forEach(value => {
      //     genOut.push({
      //       avatarId: current.avatarId,
      //       fromGenerator: it.genName,
      //       toGenerator: 'openAiText',  //  TODO ここはテキストエンジンじゃないといけないが。。。
      //       innerId: value.id,
      //       outputText: value.text,
      //       genNum: nextGen,
      //     });
      //   });
      // }
      return genOut;
    }).pipe(Effect.catchAll(e => Effect.fail(new Error(`${e}`))));
  }

}

/**
 * GPT 音声合成
 * gpt-4o-audio-preview だと会話を造ってしまうので daemonのテンプレートで ""を読み上げてください の形にする必要がある
 */
export class OpenAiVoiceGenerator extends OpenAiBaseGenerator {
  protected genName: GeneratorProvider = 'openAiVoice';
  protected model = 'gpt-4o-audio-preview';
  protected voice = 'alloy';
  protected cutoffTextLimit = 150;

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<OpenAiVoiceGenerator, Error> {
    if (!sysConfig.generators.openAiText?.apiKey) {
      return Effect.fail(new Error('openAi API key is not set.'));
    }
    return Effect.succeed(new OpenAiVoiceGenerator(sysConfig, settings as OpenAiImageSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: OpenAiSettings) {
    super(sysConfig);
    this.openAiSettings = settings;
    this.voice = sysConfig.generators.openAiVoice?.voice || 'alloy';
    this.cutoffTextLimit = sysConfig.generators.openAiVoice.cutoffTextLimit || 150;
    this.model = settings?.useModel || sysConfig.generators.openAiVoice?.model || 'gpt-4o-audio-preview';
  }

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes = yield* it.makeCurrentContext(current);
      let text = mes.flatMap(value => {
        if (value.type === 'message') {
          if (typeof value.content === 'string') {
            return [value.content];
          } else {
            return value.content.filter(a => a.type === 'input_text').map(a => a.text);
          }
        }
        return [];
      }).join(' ');
      if (text) {
        text = text.slice(0, it.cutoffTextLimit);
      }

      //  prev+currentをLLM APIに要求、レスポンスを取得
      const responseOut = yield* Effect.tryPromise({
        try: () => it.openai.chat.completions.create({
          model: it.model,
          modalities: ['text', 'audio'],
          audio: {voice: it.voice, format: 'wav'},
          messages: [
            {
              role: 'user',
              content: text,
            },
          ],
          // store:true,
        }),
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
      //  Voiceとして呼んだ場合は音声しか取り出さない
      //  TODO openAiのvoiceはまだResponse非対応
      const genOut: GenOuter[] = [];
      const snd = (responseOut).choices[0].message.audio?.data;
      if (snd) {
        const nextGen = current.genNum + 1;
        genOut.push({
          avatarId: current.avatarId,
          fromGenerator: it.genName,
          fromModelName:it.model,
          inputTokens: responseOut?.usage?.prompt_tokens,
          maxContextSize: it.maxModelContextSize,
          toGenerator: it,
          innerId: responseOut.id,
          outputRaw: snd,
          outputMime: 'audio/wav',
          genNum: nextGen,
        });
      }
      return genOut;
    }).pipe(Effect.catchAll(e => Effect.fail(new Error(`${e}`))));
  }

}
