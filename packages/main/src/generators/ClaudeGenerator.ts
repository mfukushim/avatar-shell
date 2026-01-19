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
import {ContentBlock} from '@modelcontextprotocol/sdk/types.js';


/**
 * Claude用ジェネレーター基底
 * The `ClaudeBaseGenerator` class extends the `ContextGenerator` and provides
 * an abstract base implementation for generating context-based messages
 * compliant with Anthropic's Claude language model.
 *
 * This class defines an infrastructure that handles:
 * - Filtering of tool results to ensure compatibility with the Claude model.
 * - Assembling context blocks for the previous and current messages.
 * - Debugging generated contexts for exploratory purposes.
 *
 * Derived classes are expected to provide specific implementations for the
 * abstract members such as `model` and `genName`.
 */
export abstract class ClaudeBaseGenerator extends ContextGenerator {
  protected claudeSettings: ClaudeTextSettings | undefined;
  protected anthropic: Anthropic;
  protected abstract model: string;
  protected abstract genName: GeneratorProvider;
  protected maxModelContextSize = 200000;  //  TODO Claudeの最大コンテキスト長も20Kぐらいらしい

  // protected get previousContexts() {
  //   return this.previousNativeContexts as Anthropic.Messages.MessageParam[];
  // }

  static generatorInfo: ContextGeneratorInfo = {
    usePreviousContext: true,
    defaultPrevContextSize: 100,
    inputContextTypes: ['image', 'text'],
    outputContextTypes: ['text'],
    contextRole: 'bot',
    addToMainContext: true,
  };

  constructor(sysConfig: SysConfig, settings?: ClaudeTextSettings) {
    super(sysConfig);
    this.claudeSettings = settings;
    this.anthropic = new Anthropic({
      apiKey: sysConfig.generators.anthropic.apiKey,
    });
  }

  getPreviousNativeContexts():(Anthropic.Messages.MessageParam | null)[] {
    return this.previousNativeContexts as (Anthropic.Messages.MessageParam | null)[];
  }

  // filterToolRes(value: ContentBlock ) {
  //   //  sysConfigでexperimental.mcpUiFilterDisabledがtrueの場合フィルタしない
  //   if(this.sysSetting.experimental.mcpUiFilterDisabled) return [value];
  //   //  sysConfigでexperimental.mcpUiFilterDisabledがfalseの場合
  //   //    resource.uriがui://であればLLMに送らない
  //   if(value.type === 'resource' && value.resource.uri.startsWith('ui:/')) {
  //     console.log('contents test no out');
  //     return [];
  //   }
  //   //    resource.anotations.audienceが存在して、その中に'assistant'が含まれないときはLLMに送らない
  //   //  @ts-ignore
  //   if (value.type === 'resource' && value.resource?.annotations && value.resource.annotations?.audience) {
  //     //  @ts-ignore
  //     if (!value.resource.annotations.audience.includes('assistant')) {
  //       console.log('contents test no out');
  //       return [];
  //     }
  //   }
  //   //  @ts-ignore
  //   if (value?.annotations && value.annotations?.audience) {
  //     //  @ts-ignore
  //     if (!value.annotations.audience.includes('assistant')) {
  //       console.log('contents test no out');
  //       return [];
  //     }
  //   }
  //   return [value];
  // }
  // filterToolResList(value: CallToolResult) {
  //   const data = value.content.flatMap((a:ContentBlock) => {
  //     return this.filterToolRes(a);
  //   })
  //   //  フィルタの結果として0件になった場合、ダミーデータを付ける
  //   return data.length > 0 ? data : [{text:'server accepted',type:'text'} as ContentBlock]
  //   // try {
  //   //   const data = value.content.flatMap((a:ContentBlock) => {
  //   //       return this.filterToolRes(a);
  //   //   })
  //   //   //  フィルタの結果として0件になった場合、ダミーデータを付ける
  //   //   return data.length > 0 ? data : [{text:'server accepted',type:'text'} as ContentBlock]
  //   // } catch (error) {
  //   //   console.log('filterToolResList error:',error);
  //   //   throw error;
  //   // }
  // }

  protected makePreviousContext(avatarState: AvatarState,current: GenInner) {
    const it = this;
    return Effect.gen(function* () {
      const prevMes = yield* avatarState.TalkContextEffect;
      const blocked = it.filterForLlmPrevContext(prevMes,current.input).map(a => {
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
        const toolOutMap: Map<string, Anthropic.Messages.ContentBlockParam[]> = new Map();
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
            const r = it.filterToolRes(value.mes.content.toolRes)
            if (r.length > 0 && value.mes.content.innerId) {
              const m = toolOutMap.get(value.mes.content.innerId)
              const textBlockParams = r.map(value1 => it.claudeAnnotationFilter(value1));
              if (m) {
                textBlockParams.forEach(value2 => m.push(value2))
                // const r1 = it.claudeAnnotationFilter(r)
                // m.push(r1)
              } else {
                toolOutMap.set(value.mes.content.innerId,textBlockParams)
              }
            }
          }
          //  TODO 現時点画像の過去展開はしていない
          return parts;
        });
        toolOutMap.forEach((value, key) => {
          p.push({
            type: 'tool_result',
            tool_use_id: key,
            content: value,
          } as Anthropic.Messages.ToolResultBlockParam);
        })
        return {
          role: a.role,
          content: p,
        } as Anthropic.MessageParam;
      });
    });
  }

  private claudeAnnotationFilter(v: ContentBlock) {
    const r = {
      ...v,
    };
    // @ts-ignore
    delete r.annotations; //  Claudeではツールレスポンスの annotations は受け入れない
    return r as Anthropic.Messages.TextBlockParam;
  }

  protected makeCurrentContext(current: GenInner) {
    const it = this;
    return Effect.gen(function* () {
      const mes = {
        role: 'user', content: [] as Anthropic.Messages.ContentBlockParam[]
      };
      if (current.input?.content.text) {
        mes.content.push({
          type: 'text',
          text: current.input.content.text,
        } as Anthropic.Messages.ContentBlockParam);
      } else if (current.toolCallRes) {
        current.toolCallRes.forEach(value => {
          const content = it.filterToolResList(value.results).map((v:ContentBlock) => it.claudeAnnotationFilter(v));
          if (content.length > 0) {
            mes.content.push({
              type: 'tool_result',
              tool_use_id: value.callId,
              content: content,
            });
          }
        });
      }
      if (current.input?.content.mediaUrl && current.input?.content.mimeType && current.input?.content.mimeType.startsWith('image')) {
        //  Claudeの場合、画像ファイルはinput_imageとしてbase64で送る
        const media = yield* DocService.readDocMedia(current.input.content.mediaUrl);
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
          const c = {
            ...b,
            source: b.type === 'image' && b.source ? 'image' : undefined,
            content: b.type === 'tool_result' && b.content ? b.content : undefined,
          }
          text += '\n+#' + JSON.stringify(c)//.slice(0,200);
        });
      } else {
        text+= a.content
      }
      return text;
    }).join('\n'));
    console.log('claude context end:');
  }

}

export class ClaudeTextGenerator extends ClaudeBaseGenerator {
  protected genName: GeneratorProvider = 'claudeText';
  protected model = 'claude-3-7-sonnet-latest';
  protected systemPrompt?: string;

  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting) {
    if (!sysConfig.generators?.anthropic.apiKey) {
      return Effect.fail(new Error('Claude api key is not set.'));
    }
    return Effect.succeed(new ClaudeTextGenerator(sysConfig, settings as ClaudeTextSettings | undefined));
  }

  constructor(sysConfig: SysConfig, settings?: ClaudeTextSettings) {
    super(sysConfig, settings);
    this.model = settings?.useModel || sysConfig.generators.anthropic?.model || 'claude-3-7-sonnet-latest';
  }

  setSystemPrompt(context:string) {
    this.systemPrompt = context
  }

  generateContext(current: GenInner, avatarState: AvatarState, option?: {
    noTool?: boolean
  }): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  TODO prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prevMake = yield* it.makePreviousContext(avatarState,current);
      let prev: Anthropic.Messages.MessageParam[] = []
      if (current.setting?.cutoffChatLimit) {
        const sum = Array.from(it.getPreviousNativeContexts()).reduce((previousValue, currentValue) => {
          if(currentValue === null){
            return {list:previousValue.list.concat(previousValue.buf),buf:[]}
          }
          return {list:previousValue.list,buf:previousValue.buf.concat(currentValue)}
        },{list:[] as Anthropic.Messages.MessageParam[][],buf:[] as Anthropic.Messages.MessageParam[]})
        const cutoff = sum.list.reverse().reduce((previousValue, currentValue) => {
          if (previousValue.count <= 0) {
            return previousValue;
          }
          const next = previousValue.out.concat(currentValue);
          previousValue.count-= currentValue.length
          return {out:next,count:previousValue.count}
        },{out:[] as Anthropic.Messages.MessageParam[][],count:current.setting?.cutoffChatLimit})
        prev = cutoff.out.reverse().flat()
      } else {
        prev = Array.from(it.getPreviousNativeContexts()).filter((value):value is  Anthropic.Messages.MessageParam => value !== null);  // ユーザからのmcpExternalで
      }
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes = yield* it.makeCurrentContext(current);

      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);

      console.log('claude mes:',JSON.stringify(mes));
      //  prev+currentをLLM APIに要求、レスポンスを取得
      const contents = prev.concat(mes);
      it.debugContext(contents);
      const body: Anthropic.Messages.MessageCreateParamsStreaming = {
        model: it.model || 'claude-3-7-haiku-latest',
        system: it.systemPrompt,
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

      it.getPreviousNativeContexts().push({
        role: mes.role,
        content:mes.content,
      })
      it.getPreviousNativeContexts().push({
        role: message.role,
        content:message.content,
      } as Anthropic.Messages.MessageParam)

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
        it.inputTokens = message.usage.input_tokens;
        genOut.push({
          avatarId: current.avatarId,
          fromGenerator: it.genName,
          fromModelName:it.model,
          inputTokens: message.usage.input_tokens,
          maxContextSize: it.maxModelContextSize,
          toGenerator: it,
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
          fromModelName:it.model,
          inputTokens: message.usage.input_tokens,
          maxContextSize: it.maxModelContextSize,
          toGenerator: it,
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

