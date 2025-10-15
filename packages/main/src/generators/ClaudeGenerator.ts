import {ContextGenerator} from './ContextGenerator.js';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {Effect} from 'effect';
import {AsMessage, SysConfig} from '../../../common/Def.js';
import {DocService} from '../DocService.js';
import {McpService} from '../McpService.js';
import {ConfigService} from '../ConfigService.js';
import {
  ClaudeTextSettings,
  ContextGeneratorInfo,
  ContextGeneratorSetting,
  GeneratorProvider,
} from '../../../common/DefGenerators.js';
import Anthropic from '@anthropic-ai/sdk';
import {MediaService} from '../MediaService.js';
import {Content} from '@google/genai';


export abstract class ClaudeBaseGenerator extends ContextGenerator {
  protected claudeSettings: ClaudeTextSettings | undefined;
  protected anthropic: Anthropic;
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

  constructor(sysConfig: SysConfig, settings?: ClaudeTextSettings) {
    super();
    this.claudeSettings = settings;
    this.anthropic = new Anthropic({
      apiKey: sysConfig.generators.anthropic.apiKey,
    });
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
        const p = a.block.flatMap(value => {
          const parts: Anthropic.Messages.ContentBlockParam[] = [];
          if (value.mes.content.text) {
            parts.push({
              type: 'text',
              text: value.mes.content.text,
            });
          }
          if (value.mes.content.toolReq) {
            parts.push({
              type: 'tool_use',
              id: value.mes.content.toolReq.callId,
              input: value.mes.content.toolReq.input,
              name: value.mes.content.toolReq.name,
            });
          }
          if (value.mes.content.toolRes) {
            parts.push({
              type: 'tool_result',
              tool_use_id: value.mes.content.innerId,
              content: it.filterToolRes(value.mes.content.toolRes).map((v:any) => it.claudeAnnotationFilter(v)),
            } as Anthropic.Messages.ToolResultBlockParam);
          }
          //  TODO 現時点画像の過去展開はしていない
          return parts;
        });
        return {
          role: a.role,
          content: p,
        } as Anthropic.MessageParam;
      });
    });
  }

  private claudeAnnotationFilter(v: any) {
    const r = {
      ...v,
    };
    delete r.annotations; //  Claudeではツールレスポンスの annotations は受け入れない
    return r as Anthropic.Messages.ContentBlockParam;
  }

  protected makeCurrentContext(current: GenInner) {
    const it = this;
    return Effect.gen(function* () {
      const mes = {
        role: 'user', content: [] as Anthropic.Messages.ContentBlockParam[]
      };
      if (current.input?.text) {
        mes.content.push({
          type: 'text',
          text: current.input.text,
        } as Anthropic.Messages.ContentBlockParam);
      } else if (current.toolCallRes) {
        current.toolCallRes.forEach(value => {
          mes.content.push({
            type: 'tool_result',
            tool_use_id: value.callId,
            content: it.filterToolRes(value.results).map((v:any) => it.claudeAnnotationFilter(v)),
          });
        });
      }
      if (current.input?.mediaUrl && current.input?.mimeType && current.input?.mimeType.startsWith('image')) {
        //  Claudeの場合、画像ファイルはinput_imageとしてbase64で送る
        const media = yield* DocService.readDocMedia(current.input.mediaUrl);
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.claudeSettings?.inWidth);
        //  縮小した画像をLLMには送る
        mes.content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: b1.toString('base64'),
          },
        } as Anthropic.Messages.ImageBlockParam);

        // const media = yield* DocService.readDocMedia(current.input.mediaUrl);
        // const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.ClaudeSettings?.inWidth);
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
      return mes as Anthropic.MessageParam;
    });
  }

  protected debugContext(messages: Anthropic.Messages.MessageParam[]) {
    console.log('claude context start:');
    console.log(messages.map(a => {
      let text = '##'+a.role+':';
      if (Array.isArray(a.content)) {
        a.content.forEach(b => {
          text += '\n+#' + JSON.stringify(b).slice(0,200);
        });
      } else {
        text+= a.content
      }
      return text;
    }).join('\n'));
    console.log('claude context end:');
    // console.log('gemini context:',contents.map(a => a.parts?.map(b => '##'+JSON.stringify(b).slice(0.200)).join(',')).join('\n'));
    // console.log('gemini context end:');
  }

}

export class ClaudeTextGenerator extends ClaudeBaseGenerator {
  protected genName: GeneratorProvider = 'claudeText';
  protected model = 'claude-3-7-sonnet-latest';

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting) {
    if (!sysConfig.generators?.anthropic.apiKey) {
      return Effect.fail(new Error('Claude api key is not set.'));
    }
    return Effect.succeed(new ClaudeTextGenerator(sysConfig, settings as ClaudeTextSettings | undefined));
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

      //  prev+currentをLLM APIに要求、レスポンスを取得
      const contents = prev.concat(mes);
      it.debugContext(contents);
      const body: Anthropic.Messages.MessageCreateParamsStreaming = {
        model: it.model || 'claude-3-5-haiku-latest',
        messages: contents,
        tools: tools.map(a => {
          return {
            name: a.name,
            description: a.description,
            input_schema: a.inputSchema,
          } as Anthropic.Tool;
        }),
        stream: true,
        max_tokens: 1024,
        // store:true,
      };
      const stream = it.anthropic.messages.stream(body)
        .on('text', (text: string) => {
          it.sendStreamingText(text, avatarState);
        });
      //  確定実行結果取得
      const message = yield* Effect.tryPromise({
        try: () => stream.finalMessage(),
        catch: error => {
          console.log('error:', error);
          return new Error(`claude error:${error}`);
        },
      });
      // console.log(message);

      /*
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
                console.log('Claude llm error:', `${error}`);
                return new Error(`Claude llm error:${(error as any)}`);
              },
            }).pipe(
              Effect.timeout('1 minute'),
              Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced('5 seconds')))),
              Effect.catchIf(a => a instanceof TimeoutException, _ => Effect.fail(new Error(`Claude API error:timeout`))),
            );
            //  Stream部分実行をUIに反映
            const stream =
              Stream.fromAsyncIterable(res, (e) => new Error(String(e))).pipe(
                Stream.tap((ck) => {
                  if (ck.text) {
                    it.sendStreamingText(ck.text, avatarState);
                  }
                  return Effect.void;
                }),
              );

            //  確定実行結果取得
            const collect = yield* Stream.runCollect(stream);
      */
      const outText = message.content.flatMap(b => {
        if (b.type === 'text') {
          return [b.text];
        }
        return [];
      }).join('');
      const funcCalls = message.content.flatMap(b => {
        if (b.type === 'tool_use') {
          return [b];
        }
        return [];
      }); //  1回のllm実行がstreamで複数分割されているのを結合するが、1回のllm実行で複数のfuncがあることはありうる
      const nextGen = current.genNum + 1;
      const genOut: GenOuter[] = [];
      if (outText) {
        genOut.push({
          avatarId: current.avatarId,
          fromGenerator: it.genName,
          toGenerator: it.genName,
          innerId: message.id,
          outputText: outText,
          genNum: nextGen,
        });
      }
      if (funcCalls.length > 0) {
        console.log('Claude toolCallParam:', JSON.stringify(funcCalls));
        //  TODO ここのfunc call の書式がまだ合ってない
        genOut.push({
          avatarId: current.avatarId,
          fromGenerator: it.genName,
          toGenerator: it.genName,
          innerId: message.id,
          toolCallParam: funcCalls.map((v) => {
            return {
              callId: v.id,
              name: v.name || '',
              input: v.input || {},
            };
          }),
          genNum: nextGen,
        });
      }
      return genOut;
    }).pipe(Effect.catchAll(e => Effect.fail(new Error(`${e}`))));
  }
}

