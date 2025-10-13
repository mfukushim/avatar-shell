import {ContextGenerator} from './ContextGenerator.js';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {Chunk, Effect, Schedule, Stream} from 'effect';
import {AsMessage, SysConfig} from '../../../common/Def.js';
import {DocService} from '../DocService.js';
import {McpService} from '../McpService.js';
import {ConfigService} from '../ConfigService.js';
import {
  OpenAiTextSettings,
  OpenAiSettings,
  ContextGeneratorInfo,
  ContextGeneratorSetting,
  GeneratorProvider,
} from '../../../common/DefGenerators.js';
import {MediaService} from '../MediaService.js';
import OpenAI, {APIError} from 'openai';
import {
  EasyInputMessage,
  ResponseCreateParams, ResponseCustomToolCallOutput, ResponseFunctionToolCall, ResponseFunctionToolCallItem,
  ResponseInputContent, ResponseInputImage,
  ResponseInputItem,
  ResponseInputText, ResponseOutputItem, ResponseOutputMessage, ResponseOutputRefusal, ResponseOutputText,
} from 'openai/resources/responses/responses';
import ResponseCreateParamsStreaming = ResponseCreateParams.ResponseCreateParamsStreaming;
import FunctionCallOutput = ResponseInputItem.FunctionCallOutput;
import {TimeoutException} from 'effect/Cause';
import short from 'short-uuid';


export abstract class OpenAiBaseGenerator extends ContextGenerator {
  protected openAiSettings: OpenAiSettings | undefined;
  protected openai: OpenAI;
  //protected contextCache: Map<string, Content> = new Map(); aiコンテンツとasMessageが非対応なのでちょっとやり方を考える。。
  protected abstract model: string;
  protected abstract genName: GeneratorProvider;

  static generatorInfo: ContextGeneratorInfo = {
    usePreviousContext: true,
    defaultPrevContextSize: 100,
    inputContextTypes: ['image', 'text'],
    outputContextTypes: ['text'],
    contextRole: 'bot',
    addToMainContext: true,
  };

  constructor(ai: OpenAI) {
    super();
    this.openai = ai;
  }

  filterToolRes(value: any) {
    try {
      console.log('filterToolRes:',value);
      return value.content.flatMap((a:any) => {
        // console.log('contents test:',a);
        //  @ts-ignore
        if (a.type === 'resource' && a.resource?.annotations && a.resource.annotations?.audience) {
          //  @ts-ignore
          if (!a.resource.annotations.audience.includes('assistant')) {
            console.log('contents test no out');
            return [];
          }
        }
        //  @ts-ignore
        if (a?.annotations && a.annotations?.audience) {
          //  @ts-ignore
          if (!a.annotations.audience.includes('assistant')) {
            console.log('contents test no out');
            return [];
          }
        }
        return [a];
      })
    } catch (error) {
      console.log('filterToolRes error:',error);
      throw error;
    }
  }

  protected makePreviousContext(avatarState: AvatarState) {
    const it = this;
    return Effect.gen(function* () {
      const prevMes = yield* avatarState.TalkContextEffect;
      console.log('OpenAi prevMes:', prevMes.map(a => '##' + JSON.stringify(a).slice(0.200)).join('\n'));
      const out:ResponseInputItem[] = []
      it.filterForLlmPrevContext(prevMes).forEach(a => {
        const role = it.asRoleToRole(a.asRole);
        if(a.asRole === 'human') {
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
          })
          //  TODO 現時点 prevで画像コンテンツは送らない方向にする 過去の参照idだけでやる方法を検討
        } else if(a.asRole === 'bot') {
          const parts: (ResponseOutputText | ResponseOutputRefusal)[] = [];
          if (a.content.text) {
            parts.push({
              type: 'output_text', //value.role === 'user' ? 'input_text':'output_text',
              text: a.content.text,
              annotations:[]  //  TODO 未処理 どうするか
            });
          }
          out.push({
            id:a.content.innerId || '',
            type: 'message',
            role: 'assistant',
            status:'completed',
            content: parts,
          });
          //  TODO 現時点 prevで画像コンテンツは送らない方向にする 過去の参照idだけでやる方法を検討
        } else if(a.asRole === 'toolIn') {
          out.push({
            type: 'function_call',
            call_id: a.content.toolReq.callId,
            arguments: JSON.stringify(a.content.toolReq.input),
            name: a.content.toolReq.name,
          });
        } else if(a.asRole === 'toolOut') {
          out.push({
            type: 'function_call_output',
            call_id: a.content.innerId || '', //  TODO 型定義をunionにしたほうがよいのか。。
            output: JSON.stringify(it.filterToolRes(a.content.toolRes).map((v:any) => it.OpenAiAnnotationFilter(v))),
          });
        } else {
          //  system
          console.log('OpenAi prevMes error:',a);
        }
      })
      return out;
/*
      const blocked = it.filterForLlmPrevContext(prevMes).map(a => {
        const role = it.asRoleToRole(a.asRole);
        return {
          role,
          mes: a,
        };
      }).reduce<{role: string; block: {role: string; mes: AsMessage}[]}[]>(
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
      return blocked.map(a => {
        const toolReqRes:ResponseInputItem[] = []
        // const toolReq:ResponseFunctionToolCall[] = []
        // const toolRes:FunctionCallOutput[] = []
        const p = a.block.flatMap(value => {
          const parts: ResponseInputContent[] = [];
          if (value.mes.content.text) {
            parts.push({
              type: 'input_text', //value.role === 'user' ? 'input_text':'output_text',
              text: value.mes.content.text,
            });
          }
          //  TODO 現時点 prevで画像コンテンツは送らない方向にする 過去の参照idだけでやる方法を検討
          if (value.mes.content.toolReq) {
            toolReqRes.push({
              type: 'function_call',
              call_id: value.mes.content.toolReq.callId,
              arguments: JSON.stringify(value.mes.content.toolReq.input),
              name: value.mes.content.toolReq.name,
            });
          }
          if (value.mes.content.toolRes) {
            toolReqRes.push({
              type: 'function_call_output',
              call_id: value.mes.content.innerId || '', //  TODO 型定義をunionにしたほうがよいのか。。
              output: JSON.stringify(it.filterToolRes(value.mes.content.toolRes).map((v:any) => it.OpenAiAnnotationFilter(v))),
            });
            // const list = it.filterToolRes(value.mes.content.toolRes).map((v:any) => it.OpenAiAnnotationFilter(v));
            // list.forEach((v:any) => {
            //   toolRes.push({
            //     type: 'function_call_output',
            //     call_id: value.mes.content.innerId || '', //  TODO 型定義をunionにしたほうがよいのか。。
            //     output: JSON.stringify(v),
            //   });
            // })
          }
          //  TODO 現時点画像の過去展開はしていない
          return parts;
        });
        const list:ResponseInputItem[] = []
        if(p.length > 0) {
          list.push({
            role: a.role,
            content: p,
          } as EasyInputMessage)
        }
        list.push(...toolReqRes)
        return list
      }).flat() as ResponseInputItem[];
*/
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
      const mesContent = [] as ResponseInputContent[]
      if (current.input?.text) {
        mesContent.push({
          type: 'input_text',
          text: current.input.text,
        } as ResponseInputText);
      } else if (current.toolCallRes) {
        current.toolCallRes.forEach(value => {
          mesList.push({
            type: 'function_call_output',
            call_id: value.callId,
            output: JSON.stringify(it.filterToolRes(value.results).map((v:any) => it.OpenAiAnnotationFilter(v))) //.map((v:any) => it.OpenAiAnnotationFilter(v)),
          });
          // const list = it.filterToolRes(value.results).map((v:any) => it.OpenAiAnnotationFilter(v));
          // list.forEach((v:any) => {
          //   mesList.push({
          //     type: 'function_call_output',
          //     call_id: value.callId,
          //     output: JSON.stringify(v) //.map((v:any) => it.OpenAiAnnotationFilter(v)),
          //   });
          // })
        });
      }
      if (current.input?.mediaUrl && current.input?.mimeType && current.input?.mimeType.startsWith('image')) {
        //  openAIの場合、画像ファイルはinput_imageとしてbase64で送る
        const media = yield* DocService.readDocMedia(current.input.mediaUrl);
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.openAiSettings?.inWidth);
        const b64 = b1.toString('base64');
        const imageUrl = `data:${current.input.mimeType};base64,${b64}`;
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
      if(mesContent.length > 0) {
        return [{
          role: 'user',
          content: mesContent,
        } as ResponseInputItem].concat(mesList)
      }
      return mesList;
    });
  }
}

export class OpenAiTextGenerator extends OpenAiBaseGenerator {
  protected genName: GeneratorProvider = 'openAiText';
  protected model = 'gpt-4.1-mini';

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting) {
    if (!sysConfig.generators.openAiText?.apiKey) {
      return Effect.fail(new Error('OpenAi api key is not set.'));
    }
    return Effect.succeed(new OpenAiTextGenerator(sysConfig, settings as OpenAiTextSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: OpenAiSettings) {
    super(new OpenAI({
      apiKey: sysConfig.generators.openAiText?.apiKey || '',
    }));
    this.openAiSettings = settings;
  }

  generateContext(current: GenInner, avatarState: AvatarState, option?: {
    noTool?: boolean
  }): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prev = yield* it.makePreviousContext(avatarState);
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
      const contents = prev.concat(mes);
      console.log('OpenAi context:\n', contents.map(a => '##' + JSON.stringify(a).slice(0.200)).join('\n'));
      console.log('OpenAi context end:');
      const body: ResponseCreateParamsStreaming = {
        model: it.model,
        input: contents,
        tools: toolsIn,
        stream: true,
        // store:true,
      };

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
      console.log(responseOut);
      const textOut = responseOut.filter(b => b.type === 'message').map((b: ResponseOutputMessage) => {
        //  TODO mesIdは1件のはず?
        return {id:b.id,text:b.content.filter(c => c.type === 'output_text').map(c => c.text).join('\n')}
      });
      if (textOut.length > 1) {
        return yield *Effect.fail(new Error(`response.completed > 1:${textOut.length}`))
      }
      const nextGen = current.genNum + 1;
      const genOut: GenOuter[] = [];
      if (textOut.length === 1) {
        genOut.push({
          avatarId: current.avatarId,
          fromGenerator: it.genName,
          toGenerator: it.genName,
          innerId: textOut[0].id,
          outputText: textOut[0].text,
          genNum: nextGen,
        });
      }
      const funcCallReq:ResponseFunctionToolCall[] = responseOut.filter(b => b.type === 'function_call');
      if (funcCallReq.length > 0) {
        console.log('OpenAi toolCallParam:', JSON.stringify(funcCallReq),textOut);
        //  TODO ここのfunc call の書式がまだ合ってない
        genOut.push({
          avatarId: current.avatarId,
          fromGenerator: it.genName,
          toGenerator: it.genName,
          innerId: (textOut.length > 0 ? textOut[0].id:undefined) || current.input?.innerId ||  short.generate(),  //  ここのinnerIdはどこに合わせるのがよいか。。textOut[0]があればそれに合わせる形かな。。
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

