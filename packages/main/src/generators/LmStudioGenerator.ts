import {ContextGenerator} from './ContextGenerator.js';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {Chunk, Effect, Schedule, Stream} from 'effect';
import {SysConfig} from '../../../common/Def.js';
import {DocService} from '../DocService.js';
import {McpService} from '../McpService.js';
import {ConfigService} from '../ConfigService.js';
import {
  OpenAiTextSettings,
  ContextGeneratorInfo,
  ContextGeneratorSetting,
  GeneratorProvider, LmStudioSettings,
} from '../../../common/DefGenerators.js';
import {MediaService} from '../MediaService.js';
import OpenAI, {APIError} from 'openai';
import {
  ResponseCreateParams,
  ResponseFunctionToolCall,
  ResponseInputContent,
  ResponseInputImage,
  ResponseInputItem,
  ResponseInputText,
  ResponseOutputMessage,
  ResponseOutputRefusal,
  ResponseOutputText,
} from 'openai/resources/responses/responses';
import ResponseCreateParamsStreaming = ResponseCreateParams.ResponseCreateParamsStreaming;
import {TimeoutException} from 'effect/Cause';
import short from 'short-uuid';
import {HttpClient} from '@effect/platform';


/**
 * OpenAI(GPT)コンテキストジェネレーター基底
 * Abstract base class for generating AI-based responses using OpenAI models.
 * The class extends `ContextGenerator` and provides foundational structures for working with OpenAI APIs.
 * It includes methods for filtering tool responses, generating previous and current context, and handling various input-output content formats.
 *
 * This class must be extended to define specific model configurations and behaviors.
 */
export abstract class LmStudioBaseGenerator extends ContextGenerator {
  protected lmStudioSettings: LmStudioSettings | undefined;
  protected openai: OpenAI;
  //protected contextCache: Map<string, Content> = new Map(); aiコンテンツとasMessageが非対応なのでちょっとやり方を考える。。
  protected abstract model: string;
  protected abstract genName: GeneratorProvider;
  protected override maxModelContextSize = -1;
  protected baseUrl=''

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
    this.baseUrl = new URL(sysConfig.generators.lmStudio?.baseUrl).toString()
    console.log('LmStudioBaseGenerator baseUrl:', this.baseUrl);
    const u = new URL(this.baseUrl)
    u.pathname = '/v1';
    console.log('LmStudioBaseGenerator v1:', u.toString());
    this.openai = new OpenAI({
      apiKey: 'dummy',
      baseURL: u.toString(),
    })
  }

  protected makePreviousContext(avatarState: AvatarState, current: GenInner) {
    const it = this;
    return Effect.gen(function* () {
      const prevMes = yield* avatarState.TalkContextEffect;
      console.log('LmStudio prevMes:', prevMes.map(a => '##' + JSON.stringify(a).slice(0, 200)).join('\n'));
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
          console.log('LmStudio prevMes error:', a);
        }
      })
      console.log('LmStudio prevMes out:', out.map(a => '@@' + JSON.stringify(a).slice(0, 200)).join('\n'));
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
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.lmStudioSettings?.inWidth);
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
export class LmStudioTextGenerator extends LmStudioBaseGenerator {
  protected genName: GeneratorProvider = 'lmStudioText';
  protected model = 'openai/gpt-oss-20b';
  protected systemPrompt?: OpenAI.Responses.ResponseInputItem[]

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting) {
    if (!sysConfig.generators.lmStudio?.baseUrl) {
      return Effect.fail(new Error('lm studio baseUrl is not set.'));
    }
    return Effect.succeed(new LmStudioTextGenerator(sysConfig, settings as OpenAiTextSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: LmStudioSettings) {
    super(sysConfig);
    this.lmStudioSettings = settings;
    this.model = settings?.useModel || sysConfig.generators.lmStudio?.model || 'openai/gpt-oss-20b';
  }

  setSystemPrompt(context: string) {
    this.systemPrompt = [{
      role:'developer',
      content:[{type:'input_text',text:context}]
    }]
  }

  generateContext(current: GenInner, avatarState: AvatarState, option?: {
    noTool?: boolean
  }): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService|HttpClient.HttpClient> {
    const it = this;
    console.log('current:', JSON.stringify(current.input));
    return Effect.gen(function* () {
      //  モデルの最大コンテキスト長をまだ未取得だったら取得する make内では依存関係で呼ぶと形がずれるので。。
      if (it.maxModelContextSize === -1) {
        const client = yield* HttpClient.HttpClient;
        const u = new URL(it.baseUrl)
        u.pathname += 'api/v0/models/'+it.model;
        const response:any = yield* client.get(
          u.toString()
        ).pipe(Effect.andThen(a => a.json),
          Effect.catchAll(e => {
            console.log('error:', e);
            return Effect.fail(new Error(`lmStudio error:${e}`));
          }));
        console.log('LmStudioTextGenerator model:', response);
        it.maxModelContextSize = response.max_context_length;
      }

      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prevMake = yield* it.makePreviousContext(avatarState, current);
      const prev = Array.from(it.previousNativeContexts).filter(value => !(value.type === 'message' && value.role === 'developer'))
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
      const contents = (it.systemPrompt || []).concat(prev,mes);
      console.log('LmStudio context:\n', contents.map(a => '##' + JSON.stringify(a).slice(0, 300)).join('\n'));
      console.log('LmStudio context end:');
      console.log('toolsIn',avatarState.Config.mcp,JSON.stringify(toolsIn));
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
          return new Error(`LmStudio API error:${e.message}`);
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
        console.log('LmStudio toolCallParam:', JSON.stringify(funcCallReq), textOut);
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
      console.log('LmStudioTextGenerator generatorContext error:', e);
      return Effect.fail(new Error(`${e}`));
    }));
  }

}
