import {ContextGenerator} from './ContextGenerator.js';
import {AvatarState} from '../AvatarState.js';
import {Chunk, Effect, Schedule, Stream} from 'effect';
import {AsMessage, SysConfig} from '../../../common/Def.js';
import {DocService} from '../DocService.js';
import {McpService} from '../McpService.js';
import {ConfigService} from '../ConfigService.js';
import {
  ContextGeneratorInfo,
  ContextGeneratorSetting,
  GeminiImageSettings,
  GeminiSettings,
  GeminiTextSettings, GeminiVoiceSettings,
  GeneratorProvider,
} from '../../../common/DefGenerators.js';
import short from 'short-uuid';
import {TimeoutException} from 'effect/Cause';
import {
  Content,
  createPartFromUri, FunctionCall,
  GenerateContentResponse,
  GoogleGenAI,
  Modality,
  Part,
} from '@google/genai';
import {GenInner, GenOuter} from '../GeneratorService.js';
import {MediaService} from '../MediaService.js';


export abstract class GeminiBaseGenerator extends ContextGenerator {
  protected geminiSettings: GeminiSettings | undefined;
  protected ai: GoogleGenAI;
  //protected contextCache: Map<string, Content> = new Map(); aiコンテンツとasMessageが非対応なのでちょっとやり方を考える。。
  protected abstract model:string;
  protected abstract genName:GeneratorProvider;

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

  protected makePreviousContext(avatarState: AvatarState) {
    const it = this
    return Effect.gen(function* () {
      const prevMes = yield* avatarState.TalkContextEffect;
      const blocked = it.filterForLlmPrevContext(prevMes).map(a => {
        const role: GeminiRole = it.asRoleToRole(a.asRole);
        return {
          role,
          mes: a,
        };
      }).reduce<{role: GeminiRole; block: {role: GeminiRole; mes: AsMessage}[]}[]>(
        (acc, cur) => {
          const last = acc[acc.length - 1];
          if (last && last.role === cur.role) {
            // 直前のブロックと同じ role → まとめる
            last.block.push(cur);
          } else {
            // 新しいブロックを開始
            acc.push({role: cur.role, block: [cur]});
          }
          return acc;
        },
        [],
      );
      const prev: Content[] = blocked.map(a => {
        const p = a.block.flatMap(value => {
          const parts: Part[] = [];
          if (value.mes.content.text) {
            parts.push({
              text: value.mes.content.text,
            });
          }
          if (value.mes.content.toolData) {
            parts.push({
              functionResponse: {
                name: value.mes.content.toolName,
                response: value.mes.content.toolData,
              },
            });
          }
          //  TODO 現時点画像の過去展開はしていない
          return parts;
        });
        return {
          role: a.role,
          parts: p,
        };
      });
      return prev;
    })
  }

  protected makeCurrentContext(current: GenInner) {
    const it = this;
    return Effect.gen(function* () {
      const mes = {role: 'user', parts: [] as Part[]};
      if (current.input?.text) {
        mes.parts.push({
          text: current.input.text,
        });
      } else if (current.toolCallRes) {
        current.toolCallRes.forEach(value => {
          mes.parts.push({
            functionResponse: {
              name: value.name,
              id: value.callId,
              response: value.results,
            },
          });

        });
      }
      if (current.input?.mediaUrl && current.input?.mimeType && current.input?.mimeType.startsWith('image')) {
        //  geminiの場合、画像ファイルはinput_imageとしてbase64で送る
        const media = yield* DocService.readDocMedia(current.input.mediaUrl);
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.geminiSettings?.inWidth);
        const blob = new Blob([b1], {type: 'image/png'});
        const myfile = yield* Effect.tryPromise(() => it.ai.files.upload({
          file: blob,
          config: {mimeType: 'image/png'},
        }));
        if (myfile.uri && myfile.mimeType) {
          const imagePart = createPartFromUri(myfile.uri, myfile.mimeType);
          mes.parts.push(imagePart);
        }
      }
      return mes;
    })
  }
}

type GeminiRole = 'user' | 'assistant';

export class GeminiTextGenerator extends GeminiBaseGenerator {
  protected genName:GeneratorProvider = 'geminiText';
  protected model = 'gemini-2.5-flash';

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting) {
    if (!sysConfig.generators.gemini?.apiKey) {
      console.log('gemini api key is not set.');
      return Effect.fail(new Error('gemini api key is not set.'));
    }
    return Effect.succeed(new GeminiTextGenerator(sysConfig, settings as GeminiTextSettings | undefined));
  }

  generateContext(current: GenInner, avatarState: AvatarState,option?:{noTool?:boolean}): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prev = yield* it.makePreviousContext(avatarState);
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes = yield* it.makeCurrentContext(current);

      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);

      //  prev+currentをLLM APIに要求、レスポンスを取得
      const contents = prev.concat(mes);
      const res = yield* Effect.tryPromise({
        try: () => it.ai.models.generateContentStream({
          model: it.model,
          contents: contents,
          config: {
            thinkingConfig: {
              thinkingBudget: 0, // Disables thinking
            },
            tools: tools && !(option?.noTool) ? [{
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
              it.sendStreamingText(ck.text,avatarState)
            }
            return Effect.void;
          }),
        );

      //  確定実行結果取得
      const collect = yield* Stream.runCollect(stream);
      // state.clearStreamingText(avatarState)
      const responseOut = Chunk.toArray(collect);
      const responseId = responseOut.reduce((previousValue, currentValue) => currentValue.responseId,undefined as string|undefined) || short.generate();
      const outText = responseOut.flatMap(b => b.text ? [b.text] : []).join('');
      const outImages = responseOut.flatMap(b => b.data ? [b.data] : []).join('');
      const funcCalls = responseOut.flatMap(b => b.functionCalls && b.functionCalls.length > 0 ? b.functionCalls : []); //  1回のllm実行がstreamで複数分割されているのを結合するが、1回のllm実行で複数のfuncがあることはありうる

      const nextGen = current.genNum+1
      const genOut:GenOuter[] = []
      if (outText) {
        genOut.push({
          avatarId:current.avatarId,
          fromGenerator: it.genName,
          innerId: responseId,
          outputText: outText,
          genNum: nextGen,
        })
      }
      if (outImages) {
        genOut.push({
          avatarId:current.avatarId,
          fromGenerator: it.genName,
          innerId: responseId,
          outputImage: outImages,
          genNum: nextGen,
        })
      }
      if(funcCalls.length > 0) {
        genOut.push({
          avatarId:current.avatarId,
          fromGenerator: it.genName,
          innerId: responseId,
          toolCallParam:funcCalls.map((v:FunctionCall) => {
            return {
              callId: responseId,
              name: v.name || '',
              input: v.args,
            }
          }),
          genNum: nextGen,
        })
      }
      return genOut;
    }).pipe(Effect.catchAll(e => Effect.fail(new Error(`${e}`))));
  }
}

export class GeminiImageGenerator extends GeminiBaseGenerator {
  protected genName:GeneratorProvider = 'geminiImage';
  protected model = 'gemini-2.0-flash-preview-image-generation';

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<GeminiImageGenerator, Error> {
    console.log('geminiImageGenerator make:',sysConfig.generators.gemini);
    if (!sysConfig.generators.gemini?.apiKey) {
      return Effect.fail(new Error('gemini api key is not set.'));
    }
    return Effect.succeed(new GeminiImageGenerator(sysConfig, settings as GeminiImageSettings | undefined));
  }

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prev:Content[] = [] //   yield* it.makePreviousContext(avatarState);  //  TODO 画像生成時はいまのところ履歴は反映させずに直近プロンプトのみ反映
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes = yield* it.makeCurrentContext(current);

      //  prev+currentをLLM APIに要求、レスポンスを取得
      const contents = prev.concat(mes);
      const res = yield* Effect.tryPromise({
        try: () => it.ai.models.generateContentStream({
          model: it.model,
          contents: contents,
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
      const responseOut = Chunk.toArray(collect);
      const outImages = responseOut.flatMap(b => b.data ? [b.data] : []).join('');
      const responseId = responseOut.reduce((previousValue, currentValue) => currentValue.responseId,undefined as string|undefined) || short.generate();

      const nextGen = current.genNum+1
      const genOut:GenOuter[] = []
      if (outImages) {
        genOut.push({
          avatarId:current.avatarId,
          fromGenerator: it.genName,
          innerId: responseId,
          outputImage: outImages,
          genNum: nextGen,
        })
      }
      return genOut;
    }).pipe(Effect.catchAll(e => Effect.fail(new Error(`${e}`))));
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

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prev: Content[] = [] //   yield* it.makePreviousContext(avatarState);  //  TODO 画像生成時はいまのところ履歴は反映させずに直近プロンプトのみ反映
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes = yield* it.makeCurrentContext(current);

      //  音声合成は重いので現時点cutoffTextLimit値で最大文字数を切り捨てる
      if (mes.parts?.[0]?.text) {
        mes.parts[0].text = mes.parts?.[0]?.text?.slice(0,it.cutoffTextLimit);
      }

      //  prev+currentをLLM APIに要求、レスポンスを取得
      const contents = prev.concat(mes);

      //  https://ai.google.dev/gemini-api/docs/speech-generation
      const response = yield* Effect.tryPromise({
        try: () => it.ai.models.generateContent({
          model: it.model,
          contents: contents, //  音声合成は例外的に過去のコンテキストは見ない
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: it.voice },
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
      const snd = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;  //  データはpcmとのこと。。。
      if (snd) {
        const outImages = it.convertBase64PcmToBase64Wav(snd)
        const id = response.responseId || short.generate();
        const mime = 'audio/wav';
        const mediaUrl = yield* DocService.saveDocMedia(id, mime, outImages, avatarState.TemplateId);

        return [
          {
            avatarId: current.avatarId,
            fromGenerator: it.genName,
            innerId: id,
            outputMediaUrl: mediaUrl,
            outputMime: mime,
            genNum: current.genNum+1,
          } as GenOuter
        ]
      }
      return []
    })
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
