import {ContextGenerator, GeneratorOutput, GeneratorTask} from './ContextGenerator.js';
import {AvatarState} from './AvatarState.js';
import {Chunk, Effect, Option, Schedule, Stream} from 'effect';
import {AsMessage, AsMessageContent, AsMessageContentMutable, AsOutput, SysConfig} from '../../common/Def.js';
import {DocService} from './DocService.js';
import {McpService} from './McpService.js';
import {ConfigService} from './ConfigService.js';
import {
  ContextGeneratorInfo,
  ContextGeneratorSetting,
  GeminiImageSettings,
  GeminiSettings,
  GeminiTextSettings, GeminiVoiceSettings,
  GeneratorProvider,
} from '../../common/DefGenerators.js';
import dayjs from 'dayjs';
import short from 'short-uuid';
import {TimeoutException} from 'effect/Cause';
import {z} from 'zod';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {
  Content,
  createPartFromUri,
  FunctionResponse,
  GenerateContentResponse,
  GoogleGenAI,
  Modality,
  Part,
} from '@google/genai';
import {LlmBaseGenerator, LlmInputContent} from './LlmGenerator.js';


export abstract class GeminiBaseGenerator extends LlmBaseGenerator {
  protected geminiSettings: GeminiSettings | undefined;
  protected ai: GoogleGenAI;
  //protected contextCache: Map<string, Content> = new Map(); aiコンテンツとasMessageが非対応なのでちょっとやり方を考える。。
  protected prevContexts: Content[] = [];
  protected abstract model:string;
  protected abstract genName:GeneratorProvider;


  // static defaultModel = 'gemini-2.5-flash';

  static generatorInfo: ContextGeneratorInfo = {
    usePreviousContext: true,
    defaultPrevContextSize: 100,
    inputContextTypes: ['image', 'text'],
    outputContextTypes: ['text'],
    contextRole: 'bot',
    addToMainContext: true,
  };

  constructor(sysConfig: SysConfig, settings?: GeminiSettings) {
    super();
    this.geminiSettings = settings;
    this.ai = new GoogleGenAI({
      apiKey: sysConfig.generators.gemini?.apiKey,
    });
  }

  getGeneratorInfo(): ContextGeneratorInfo {
    return GeminiBaseGenerator.generatorInfo;
  }

  contentToNative(message: AsMessageContent,useMedia: boolean) {
    const it = this
    return Effect.gen(function* () {
      if (message.text) {
        return ([{
          text: message.text,
        } as Part]);
      }
      if (message.mediaUrl && message.mimeType && message.mimeType.startsWith('image')) {
        if(!useMedia) return []
        const media = yield* DocService.readDocMedia(message.mediaUrl);
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.geminiSettings?.inWidth);
        const blob = new Blob([b1], {type: message.mimeType});
        const myfile = yield* Effect.tryPromise(() => it.ai.files.upload({
          file: blob,
          config: {mimeType: message.mimeType},
        }));
        if (myfile.uri && myfile.mimeType) {
          return [createPartFromUri(myfile.uri, myfile.mimeType)]
        }
      }
      return []
    })
  }

  setPreviousContext(inContext: AsMessage[]): Effect.Effect<void, Error, DocService | ConfigService> {
    //  contextは指定長さで区切る 越えたら TODO 自動サマライズする
    console.log('inContext len', inContext.length);
    const contextSize = this.geminiSettings?.previousContextSize || GeminiBaseGenerator.generatorInfo.defaultPrevContextSize;
    console.log('contextSize:', contextSize);
    if (inContext.length > contextSize) {
      //  TODO 自動サマライズする サマライズ用の指定のLLMとかあるだろうし、勝手にやるとまずいかも

    }
    inContext = inContext.slice(-contextSize).filter(value => ContextGenerator.matchContextType(value.content.mimeType, GeminiBaseGenerator.generatorInfo.inputContextTypes));
    console.log('new inContext len:', inContext.length);
    const mergeContents = this.joinRole(inContext);
    const state = this;
    return Effect.forEach(mergeContents, a => {
      return Effect.forEach(a.contents, a1 => {
        return state.contentToNative(a1, false)
      }).pipe(Effect.andThen(a1 => {
        return {
          role: a.asRole === 'bot' ? 'model' : 'user',
          parts: a1.flat()
        } as Content
      }))
    }).pipe(Effect.andThen(a => {
      this.prevContexts = a.flat();
    }));
  }


  setCurrentContext(content:AsMessageContent[]): Effect.Effect<{task:Option.Option<GeneratorTask>}, Error, DocService | ConfigService> {
    const state = this;
    console.log('current content:', content);
    return Effect.gen(function* () {
      const native = yield *Effect.forEach(content, a => {
        return state.contentToNative(a,true)
/*
        return Effect.gen(function* () {
          let content;
          if (a.content.text) {
            content = {
              text: a.content.text,
            } as Part;
          } else if (a.content.mediaUrl && a.content.mimeType?.startsWith('image')) {
            //  geminiの場合、画像ファイルはinput_imageとしてbase64で送る
            const media = yield* DocService.readDocMedia(a.content.mediaUrl);
            const b1 = yield* state.shrinkImage(Buffer.from(media, 'base64').buffer, state.geminiSettings?.inWidth);
            // const b64 = b1.toString('base64');
            const blob = new Blob([b1], {type: a.content.mimeType});
            const myfile = yield* Effect.tryPromise(() => state.ai.files.upload({
              file: blob,
              config: {mimeType: a.content.mimeType},
            }));
            if (myfile.uri && myfile.mimeType) {
              content = createPartFromUri(myfile.uri, myfile.mimeType);
            }
          }
          if (content) {
            // state.contextCache.set(a.id, item);
            return [content];
          }
          return [];
        });
*/
      }).pipe(Effect.andThen(b => b.flat()))
      const item: Content = {
        role: 'user',
        parts: native,
      };

      // const output = content.map( (a,i) =>
      //   AsOutput.makeOutput(a, {
      //     provider: state.genName,
      //     model: state.model,
      //     isExternal: false,
      //   }, i === 0 ? [item] : []))
      return {task:Option.some(item)}
    })
  }

  toAnswerOut(responseOut: GenerateContentResponse[], avatarState: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    const outText = responseOut.flatMap(b => b.text ? [b.text] : []).join('');
    const outImages = responseOut.flatMap(b => b.data ? [b.data] : []).join('');
    console.log('outText:', outText);
    const state = this;
    return Effect.gen(function* () {
      const out: AsOutput[] = [];
      if (outText) {
        const addPrevious: Content = {
          role: 'model',
          parts: [{
            text: outText,
          }],
        };
        state.prevContexts.push(addPrevious);  //  テキストについてはgeminiが言った言葉を過去文脈に追加していく
        out.push(AsOutput.makeOutput(AsMessage.makeMessage({
          from: avatarState.Name,
          text: outText,
        },'talk','bot','surface'),{
          provider: state.genName,
          model: state.model,
          isExternal: false,
        },[addPrevious]))
      }
      if (outImages) {
        const id = short.generate();
        const mime = 'image/png'; //  TODO 音声合成も通るはず
        const mediaUrl = yield* DocService.saveDocMedia(id, mime, outImages, avatarState.TemplateId);
        /*
        todo 重いだろうから一旦gemini側が生成した画像を以前の文脈としてgemini側に送るのは抑制するか。。
                const blob = new Blob([b1], {type: a.content.mimeType});
                const myfile = yield *Effect.tryPromise(() => state.ai.files.upload({
                  file: blob,
                  config: { mimeType: a.content.mimeType },
                }));

                const addPrevious:Content = {
                  role:'model',
                  parts:[{
                    inlineData:
                  }]
                }
                state.prevContexts.push(addPrevious)
        */
        out.push(AsOutput.makeOutput(AsMessage.makeMessage({
          from: avatarState.Name,
          mediaUrl: mediaUrl,
        },state.geminiSettings?.toClass || 'talk',state.geminiSettings?.toRole || 'bot','surface'),
          {
            provider: state.genName,
            model: state.model,
            isExternal: false,
          }))
      }
      return out;
    });
  }

  execFuncCall(responseOut: GeneratorOutput[], avatarState: AvatarState): Effect.Effect<{
    output: AsOutput[],
    nextTask: Option.Option<LlmInputContent>
  }, Error, DocService | McpService | ConfigService> {
    const funcCalls = responseOut.flatMap(b => b.functionCalls && b.functionCalls.length > 0 ? b.functionCalls : []); //  1回のllm実行がstreamで複数分割されているのを結合するが、1回のllm実行で複数のfuncがあることはありうる
    if (funcCalls.length === 0) return Effect.succeed({output: [], nextTask: Option.none()});
    console.log('funcCalls:', funcCalls);
    const state = this;
    //  ツールの実行と実行結果 実行前情報なので依頼としてiteratorに回す
    return Effect.gen(function* () {
      const next: AsOutput[] = [];
      //  ツール依頼 実行後情報なのでここで追加する nativeはその前の
      const funcCall = {
        role: 'model',
        parts: funcCalls.map(b => ({functionCall: b})),
      } as Content;
      state.prevContexts.push(funcCall);  //  1件のリクエストの追記
      next.push(AsOutput.makeOutput(AsMessage.makeMessage({
        from: avatarState.Name,
        toolName: funcCalls.map(value => value.name).join(','),
        toolData: funcCalls.map(value => value),
      },'physics','toolIn','inner'),{
        provider: state.genName,
        model: state.model,
        isExternal: false,
      }))
      console.log('funcCalls:', funcCalls);
      const toLlm = yield* Effect.forEach(funcCalls, a => {
        return Effect.gen(function* () {
          const toolRes = yield* McpService.callFunction(avatarState, {
            id: a.call_id,
            name: a.name,
            input: a.arguments ? JSON.parse(a.arguments) : {},
          },'geminiText').pipe(Effect.catchAll(e => {
            console.log('tool error:', e); //  tool denyの件もここに来る TODO denyと他エラーを分けたほうがよい
            return Effect.succeed({call_id: a.call_id, toLlm: {content: [{type: 'text', text: `tool can not use.`}]}});
          }));

          console.log('toolRes:'); //  ,JSON.stringify(toolRes) JSON.stringify(a1)
          //  ここでツールが解析した結果のcontentを分離してAsMessageにする 理由として、表示側でコンテンツによって出力結果をフィルタしたいからだ ${toolRes.call_id}_out_0 はLLM付き _out_n は生成コンテンツごとの要素として表示とログに送る
          return yield* Effect.forEach((toolRes.toLlm as z.infer<typeof CallToolResultSchema>).content, (a2,idx) => {
            return Effect.gen(function* () {
              const content: AsMessageContentMutable = {
                from: avatarState.Name,
                toolName: a.name
              };
              const nextId = short.generate();
              let llmOut: any = a2;
              if (a2.type === 'text') {
                content.text = a2.text;
              } else if (a2.type === 'image') {
                const mediaUrl = yield* DocService.saveDocMedia(nextId, a2.mimeType, a2.data, avatarState.TemplateId);
                const b1 = yield* state.shrinkImage(Buffer.from(a2.data, 'base64').buffer, state.geminiSettings?.inWidth);
                a2.data = b1.toString('base64'); //  TODO 上書き更新にしている
                content.mediaUrl = mediaUrl;
                content.mimeType = 'image/png';
                //  TODO 一旦GPTでは画像情報はtoolから与えない
                llmOut = a2;
              } else if (a2.type === 'resource') {
                //  TODO resourceはuriらしい resourceはLLMに回さないらしい
                //  MCP UIの拡張uriを受け付ける htmlテキストはかなり大きくなりうるのでimageと同じくキャッシュ保存にする
                content.innerId =`${a.id}_${idx}`
                content.mediaUrl = a2.resource.uri;
                content.mimeType = a2.resource.mimeType
                if(a2.resource.uri && a2.resource.uri.startsWith('ui:/')) {
                  console.log('to save html');
                  //  TODO なんで型があってないんだろう。。
                  yield* DocService.saveMcpUiMedia(a2.resource.uri, a2.resource.text as string);
                }
                //  MCP-UI対応に uriがui:でないものだけ送る
                if (!a2.resource.uri.startsWith('ui:')) {
                  llmOut = {
                    type:'text',
                    text: JSON.stringify(a2.resource),
                  }; // TODO resourceはまだClaudeのtool結果としては戻さない? jsonをテキスト化して送ってみる?
                  // state.contextCache.set(content.innerId,llmOut)
                  // console.log('cache add:',content.innerId,llmOut);
                } else {
                  //  claudeはtool_useに対してかならず対のtool_resultを必要とする
                  llmOut = {
                    type:'text',
                    text:`Executed, ${a2.resource.uri}` // とりあえずダミーとしてui:uriを返す
                  }
                }
                // //  TODO resourceはuriらしい
                // content.mediaUrl = a2.uri;
              }
              //  todo geminiは計算結果をまとめるタイプか、別にするタイプか?
              //  ツール実行結果なのでここで追加
              const function_response_part = {
                name: a.name,
                response: {output: a2},  //  todo 展開を確認したほうがよい
              };
              //  todo geminiの場合、func callで呼び出したコールは入力文脈としてコンテキストには追加しない方向ではないか? なのでpreviousContentには追加しない
              return [
                {
                  toolOneRes: llmOut ? function_response_part as FunctionResponse : undefined,
                  toolId:a.id,  //  todo ちょっとツール集約がおかしい
                  mes: {
                    id: nextId,
                    tick: dayjs().valueOf(),
                    asClass: 'physics', //  TODO ちょっと姑息だがtextだったらsystemにする。それ以外imageとかはtalkにする 後で一貫性について検討要
                    asRole: 'toolOut',
                    asContext:'inner',//  メディアは例外的にext
                    isRequestAction:false,
                    content: content,
                  } as AsMessage,
                }
            ]
/*
              return [{
                llmOut: llmOut ? [function_response_part as FunctionResponse] : [],
                mes: {
                  id: nextId,
                  tick: dayjs().valueOf(),
                  asClass: 'physics', //  TODO ちょっと姑息だがtextだったらsystemにする。それ以外imageとかはtalkにする 後で一貫性について検討要
                  asRole: 'toolOut',
                  asContext:'inner',//  メディアは例外的にext
                  isRequestAction:false,
                  content: content,
                } as AsMessage,
              }];
*/
            }).pipe(Effect.catchAll(_ => Effect.succeed([])));
          }).pipe(Effect.andThen(a => a.flat()));

        });
      }).pipe(Effect.andThen(a => a.flat()));
      //  TODO gptは複数のtool生成結果を次の1回の実行で受け取る。 AsMessageは1メッセージ1コンテンツである。
      //   つまりAsMessageは複数作られる その最初のAsMessageにのみ1件のgpt行きタスクがあり、他のasMessageには含まれない この対応関係はAsMessageを主体とするのかは決めないし、メッセージ再現時にその関係性を厳密には保たない
      let task = Option.none<Content>();
      if (toLlm.length > 0) {
        //  次に回すタスク
        const nextTask = {
          role: 'user',
          parts: toLlm.flatMap(a => a.toolOneRes ? [{ functionResponse:a.toolOneRes}]:[]),   //  1回で送る functionResponseにはidが含まれるので区別はできているはず 1回のllm実行に対して1回のtoolsを返す形
          // parts: toLlm.flatMap(a => a.llmOut).map(b => ({functionResponse: b})),   //  1回で送る functionResponseにはidが含まれるので区別はできているはず 1回のllm実行に対して1回のtoolsを返す形
        } as Content;
        task = Option.some(nextTask);
        //  func call結果(native付き)
        next.push(AsOutput.makeOutput(toLlm[0].mes,{
          provider: state.genName,
          model: state.model,
          isExternal: false,
        },[nextTask]))
        //  func call結果(AsMessageのみ)
        next.push(...toLlm.slice(1).map(a =>
          AsOutput.makeOutput(a.mes, {provider: state.genName, model: state.model, isExternal: false,})));
      }
      //  TODO どうやらgeminiの場合func callはこの中で呼び出しとループが必要っぽい。。
      return {output: next, nextTask: task};
    });
  }

  getNativeContext(): Effect.Effect<AsOutput[], void, ConfigService | McpService> {
    return Effect.succeed([]);  //  TODO
  }

}

export class GeminiTextGenerator extends GeminiBaseGenerator {
  protected genName:GeneratorProvider = 'geminiText';
  protected model = 'gemini-2.5-flash';


  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<GeminiBaseGenerator, Error> {
    if (!sysConfig.generators.gemini?.apiKey) {
      console.log('gemini api key is not set.');
      return Effect.fail(new Error('gemini api key is not set.'));
    }
    return Effect.succeed(new GeminiTextGenerator(sysConfig, settings as GeminiTextSettings | undefined));
  }

  override execLlm(inputContext: Content, avatarState: AvatarState): Effect.Effect<GenerateContentResponse[], Error, ConfigService | McpService> {
    const state = this;
    let contents = this.prevContexts || []
    if(contents.length > 0 && contents[contents.length - 1].role === 'user') {
      const last = contents[contents.length - 1];
      let lastContent = last.parts;
      let curContent = inputContext.parts;
      contents[contents.length-1] ={
        role: last.role,
        parts: lastContent ? (curContent ? lastContent.concat(curContent):lastContent):curContent ? curContent : undefined,
      }
    } else {
      contents.push(inputContext);
    }

    return Effect.gen(this, function* () {
      // console.log('gemini tools avatar config:',avatarState.Config.mcp);
      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      // console.log('gemini tools:',tools);
      // console.log('gemini in:',JSON.stringify(state.prevContexts),JSON.stringify(inputContext.flatMap(value => value.parts ? [value.parts]:[]).flat()));
      // let res: AsyncGenerator<GenerateContentResponse, any, any>;
      //  tools用処理 集めて1回でよいはずだが
      // state.prevContexts.push(inputContext);
      console.log('gemini :', JSON.stringify(state.prevContexts));
      const res = yield* Effect.tryPromise({
        try: () => state.ai.models.generateContentStream({
          model: state.model,
          contents: contents,
          config: {
            thinkingConfig: {
              thinkingBudget: 0, // Disables thinking
            },
            tools: tools ? [{
              functionDeclarations: tools,
            }] : undefined,
          },
        }),
        catch: error => {
          console.log('gemini llm error:', `${error}`);
          return new Error(`gemini llm error:${(error as any)}`);
        },
      }).pipe(
        Effect.timeout('1 minute'),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced('5 seconds')))),
        Effect.catchIf(a => a instanceof TimeoutException, _ => Effect.fail(new Error(`gemini API error:timeout`))),
      );
      //  Stream部分実行をUIに反映
      const stream =
        Stream.fromAsyncIterable(res, (e) => new Error(String(e))).pipe(
          Stream.tap((ck) => {
            if (ck.text) {
              state.sendStreamingText(ck.text,avatarState)
            }
            return Effect.void;
          }),
        );

      //  確定実行結果取得
      const collect = yield* Stream.runCollect(stream);
      // state.clearStreamingText(avatarState)
      return Chunk.toArray(collect);
    }).pipe(Effect.catchIf(a => a instanceof Error, e => Effect.succeed([])));
  }


}

export class GeminiImageGenerator extends GeminiBaseGenerator {
  protected genName:GeneratorProvider = 'geminiImage';
  protected model = 'gemini-2.0-flash-preview-image-generation';

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<GeminiBaseGenerator, Error> {
    console.log('geminiImageGenerator make:',sysConfig.generators.gemini);
    if (!sysConfig.generators.gemini?.apiKey) {
      return Effect.fail(new Error('gemini api key is not set.'));
    }
    return Effect.succeed(new GeminiImageGenerator(sysConfig, settings as GeminiImageSettings | undefined));
  }

  override execLlm(inputContext: Content, avatarState: AvatarState): Effect.Effect<GenerateContentResponse[], Error, ConfigService | McpService> {
    const state = this;
    return Effect.gen(this, function* () {
      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      state.prevContexts.push(inputContext);
      console.log('gemini image:', JSON.stringify(state.prevContexts));
      const res = yield* Effect.tryPromise({
        try: () => state.ai.models.generateContentStream({
          model: state.model,
          contents: state.prevContexts,
          config: {
            responseModalities: [Modality.TEXT, Modality.IMAGE],
          },
        }),
        catch: error => {
          console.log('gemini image error:', `${error}`);
          return new Error(`gemini image error:${(error as any)}`);
        },
      }).pipe(
        Effect.timeout('1 minute'),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced('5 seconds')))),
        Effect.catchIf(a => a instanceof TimeoutException, e => Effect.fail(new Error(`gemini API error:timeout`))),
      );
      //  Stream部分実行をUIに反映 画像用だからテキストの生成は拾わない
      const stream: Stream.Stream<GenerateContentResponse, void> =
        Stream.fromAsyncIterable(res, (e) => new Error(String(e)))

      //  確定実行結果取得
      const collect = yield* Stream.runCollect(stream);
      return Chunk.toArray(collect);
    }).pipe(Effect.catchAll(e => Effect.fail(new Error(`${e}`))));
  // }).pipe(Effect.catchIf(a => a instanceof Error, e => Effect.succeed([])));
  }

  override toAnswerOut(responseOut: GenerateContentResponse[], avatarState: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    //  geminiImageとして呼んだ場合は画像しか取り出さない
    const outImages = responseOut.flatMap(b => b.data ? [b.data] : []).join('');
    const state = this;
    return Effect.gen(function* () {
      const out: AsOutput[] = [];
      if (outImages) {
        const id = short.generate();
        const mime = 'image/png'; //  TODO 音声合成も通るはず
        const mediaUrl = yield* DocService.saveDocMedia(id, mime, outImages, avatarState.TemplateId);
        /*
        todo 重いだろうから一旦gemini側が生成した画像を以前の文脈としてgemini側に送るのは抑制するか。。
                const blob = new Blob([b1], {type: a.content.mimeType});
                const myfile = yield *Effect.tryPromise(() => state.ai.files.upload({
                  file: blob,
                  config: { mimeType: a.content.mimeType },
                }));

                const addPrevious:Content = {
                  role:'model',
                  parts:[{
                    inlineData:
                  }]
                }
                state.prevContexts.push(addPrevious)
        */
        out.push(AsOutput.makeOutput(AsMessage.makeMessage({
          from: avatarState.Name,
          mediaUrl: mediaUrl,
          mimeType: mime,
        },state.geminiSettings?.toClass || 'talk',state.geminiSettings?.toRole,'outer'),
          {provider: state.genName, model: state.model, isExternal: false,}))
      }
      return out;
    });
  }

}

export class GeminiVoiceGenerator extends GeminiBaseGenerator {
  protected genName:GeneratorProvider = 'geminiVoice';
  protected model = 'gemini-2.5-flash-preview-tts';
  protected voice = 'Kore';
  protected cutoffTextLimit = 150;

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<GeminiBaseGenerator, Error> {
    console.log('GeminiVoiceGenerator make:',sysConfig.generators.gemini);
    if (!sysConfig.generators.gemini?.apiKey) {
      return Effect.fail(new Error('gemini api key is not set.'));
    }
    return Effect.succeed(new GeminiVoiceGenerator(sysConfig, settings as GeminiVoiceSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: GeminiVoiceSettings) {
    super(sysConfig,settings);
    this.voice = sysConfig.generators.geminiVoice.voice || 'Kore';
    this.cutoffTextLimit = sysConfig.generators.geminiVoice.cutoffTextLimit || 150;
  }

  override execLlm(inputContext: Content, avatarState: AvatarState): Effect.Effect<GenerateContentResponse[], Error, ConfigService | McpService> {
    const state = this;
    return Effect.gen(this, function* () {
      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      state.prevContexts.push(inputContext);
      console.log('gemini voice:', JSON.stringify(inputContext));
      //  音声合成は重いので現時点cutoffTextLimit値で最大文字数を切り捨てる
      if (inputContext.parts?.[0]?.text) {
        inputContext.parts[0].text = inputContext.parts?.[0]?.text?.slice(0,state.cutoffTextLimit);
      }

      //  https://ai.google.dev/gemini-api/docs/speech-generation
      const response = yield* Effect.tryPromise({
        try: () => state.ai.models.generateContent({
          model: state.model,
          contents: [inputContext], //  音声合成は例外的に過去のコンテキストは見ない
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: state.voice },
              },
            },
          },
        }),
        catch: error => {
          console.log('gemini voice error:', `${error}`);
          return new Error(`gemini voice error:${(error as any)}`);
        },
      }).pipe(
        Effect.timeout('1 minute'),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced('5 seconds')))),
        Effect.catchIf(a => a instanceof TimeoutException, e => Effect.fail(new Error(`gemini API error:timeout`))),
      );
      return [response];
    }).pipe(Effect.catchIf(a => a instanceof Error, e => Effect.succeed([])));
  }

  override toAnswerOut(responseOut: GenerateContentResponse[], avatarState: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    //  geminiVoiceとして呼んだ場合は音声しか取り出さない
    const snd = responseOut[0].candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;  //  データはpcmとのこと。。。
    const state = this;
    return Effect.gen(function* () {
      const out: AsOutput[] = [];
      if (snd) {
        const outImages = state.convertBase64PcmToBase64Wav(snd)
        console.log('outImages:', outImages.slice(0, 100));
        const id = short.generate();
        const mime = 'audio/wav';
        const mediaUrl = yield* DocService.saveDocMedia(id, mime, outImages, avatarState.TemplateId);
        /*
        todo gemini側が生成した音声を以前の文脈としてgemini側に送るのは抑制まだ抑制しておく
        */
        out.push(AsOutput.makeOutput(AsMessage.makeMessage({
            from: avatarState.Name,
            mediaUrl: mediaUrl,
            mimeType: mime,
          }, state.geminiSettings?.toClass || 'talk', state.geminiSettings?.toRole,'outer'),
          {
            provider: state.genName,
            model: state.model,
            isExternal: false,
          }))
      }
      return out;
    });
  }


  convertBase64PcmToBase64Wav(base64Pcm:string, sampleRate = 24000, numChannels = 1) {
    const bitsPerSample = 16;
    const pcmBuffer = Buffer.from(base64Pcm, 'base64');
    const dataSize = pcmBuffer.length;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const chunkSize = 36 + dataSize;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(chunkSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size
    header.writeUInt16LE(1, 20);  // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    const wavBuffer = Buffer.concat([header, pcmBuffer]);
    return wavBuffer.toString('base64');
  }
}
