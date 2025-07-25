import {ContextGenerator, GeneratorTask} from './ContextGenerator.js';
import {AvatarState} from './AvatarState.js';
import {Effect, Option} from 'effect';
import {AsMessage, AsMessageContent, AsOutput, SysConfig} from '../../common/Def.js';
import {DocService} from './DocService.js';
import {McpService} from './McpService.js';
import {ConfigService} from './ConfigService.js';
import {
  ClaudeTextSettings,
  ContextGeneratorInfo,
  ContextGeneratorSetting,
  GeneratorProvider,
} from '../../common/DefGenerators.js';
import dayjs from 'dayjs';
import short from 'short-uuid';
import {z} from 'zod';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {LlmBaseGenerator, LlmInputContent} from './LlmGenerator.js';
import Anthropic from '@anthropic-ai/sdk';


export abstract class ClaudeBaseGenerator extends LlmBaseGenerator {
  protected claudeSettings: ClaudeTextSettings | undefined;
  protected anthropic: Anthropic;
  //protected contextCache: Map<string, Content> = new Map(); aiコンテンツとasMessageが非対応なのでちょっとやり方を考える。。
  protected prevContexts: Anthropic.Messages.MessageParam[] = [];
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

  getGeneratorInfo(): ContextGeneratorInfo {
    return ClaudeBaseGenerator.generatorInfo;
  }

  contentToNative(message: AsMessageContent,useMedia: boolean) {
    const it = this
    return Effect.gen(function* () {
      if (message.text) {
        return ([{
          type: 'text',
          text: message.text,
        } as Anthropic.Messages.ContentBlockParam]);
      }
      if (message.mediaUrl && message.mimeType && message.mimeType.startsWith('image')) {
        if(!useMedia) return []
        const media = yield* DocService.readDocMedia(message.mediaUrl);
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.claudeSettings?.inWidth);
        return ([{
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: b1.toString('base64'),
          },
        } as Anthropic.Messages.ContentBlockParam]);
        // if (message.asRole === 'bot') {
        //   //  TODO ログ/外部からの画像再現は難しそう
        // } else {
        //   //  TODO 過去文脈のときの生画像は送るべきか。。。
        // }
      }
      return []
    })
  }

  setPreviousContext(inContext: AsMessage[]): Effect.Effect<void, Error, DocService | ConfigService> {
    //  contextは指定長さで区切る 越えたら TODO 自動サマライズする
    const it = this;
    console.log('inContext len', inContext.length);
    const contextSize = this.claudeSettings?.previousContextSize || ClaudeBaseGenerator.generatorInfo.defaultPrevContextSize;
    console.log('contextSize:', contextSize);
    if (inContext.length > contextSize) {
      //  TODO 自動サマライズする サマライズ用の指定のLLMとかあるだろうし、勝手にやるとまずいかも

    }
    inContext = inContext.slice(-contextSize).filter(value => ContextGenerator.matchContextType(value.content.mimeType, ClaudeBaseGenerator.generatorInfo.inputContextTypes));
    console.log('new inContext len:', inContext.length);
    const mergeContents = this.joinRole(inContext);
    return Effect.forEach(mergeContents, a => {
        return Effect.forEach(a.contents, a1 => {
          return it.contentToNative(a1,false)
          // return Effect.gen(function*(){
          //   if (a1.text) {
          //     return ([{
          //       type: 'text',
          //       text: a1.text,
          //     } as Anthropic.Messages.ContentBlockParam]);
          //   }
          //   if (a1.mediaUrl && a1.mimeType && a1.mimeType.startsWith('image')) {
          //     const media = yield* DocService.readDocMedia(a1.mediaUrl);
          //     const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer, it.claudeSettings?.inWidth);
          //     if (a.asRole === 'bot') {
          //       //  TODO ログ/外部からの画像再現は難しそう
          //     } else {
          //       //  TODO 過去文脈のときの生画像は送るべきか。。。
          //       return ([{
          //         type: 'image',
          //         source: {
          //           type: 'base64',
          //           media_type: 'image/png',
          //           data: b1.toString('base64'),
          //         },
          //       } as Anthropic.Messages.ContentBlockParam]);
          //     }
          //   }
          //   return []
          // })
        }).pipe(Effect.andThen(a1 => {
          const llmContent: Anthropic.Messages.ContentBlockParam[] = a1.flat();
          return {
            role: a.asRole === 'bot'? 'assistant':'user',
            content: llmContent,
          } as Anthropic.Messages.MessageParam;
        }))  //  TODO テキスト項同士はマージしたほうがよいか
    }).pipe(Effect.andThen(a => {
      this.prevContexts = a.flat();
    }));
  }


  setCurrentContext(content: AsMessageContent[]): Effect.Effect<{
    task: Option.Option<GeneratorTask>,
    // output: AsOutput[]
  }, Error, DocService | ConfigService> {
    const state = this;
    console.log('current content:', content);
    return Effect.gen(function* () {
      const native = yield* Effect.forEach(content, a => {
        return state.contentToNative(a,true)
      }).pipe(Effect.andThen(b => b.flat()));
      const item: Anthropic.Messages.MessageParam = {
        role: 'user',
        content: native,
      };
      // const output = content.map((a, i) => {
      //   // console.log('aa',a,state.genName,state.model,item);
      //   return AsOutput.makeOutput(a, {
      //     provider: state.genName,
      //     model: state.model,
      //     isExternal: false,
      //   }, i === 0 ? [item] : []);
      // });
      return {task: Option.some(item)}; //  output
    });
  }

  toAnswerOut(responseOut: Anthropic.Messages.ContentBlock[], avatarState: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    const outText = responseOut.flatMap(b => {
      if (b.type === 'text') {
        return [b.text];
      }
      return [];
    }).join('');
    //  claudeはまだモデルからの直の画像返答はない
    console.log('outText:', outText);
    const state = this;
    return Effect.gen(function* () {
      const out: AsOutput[] = [];
      if (outText) {
        const addPrevious: Anthropic.Messages.MessageParam = {
          role: 'assistant',
          content: [{
            type: 'text',
            text: outText,
          }],
        };
        state.prevContexts.push(addPrevious);  //  テキストについてはgeminiが言った言葉を過去文脈に追加していく
        out.push(AsOutput.makeOutput(AsMessage.makeMessage({
            from: avatarState.Name,
            text: outText,
          }, state.claudeSettings?.toClass || 'talk', state.claudeSettings?.toRole, 'surface'),
          {
            provider: state.genName,
            model: state.model,
            isExternal: false,
          }, [addPrevious]));
      }
      return out;
    });
  }

  execFuncCall(responseOut: Anthropic.Messages.ContentBlock[], avatarState: AvatarState): Effect.Effect<{
    output: AsOutput[],
    nextTask: Option.Option<LlmInputContent>
  }, Error, DocService | McpService> {
    const funcCalls = responseOut.flatMap(b => {
      if (b.type === 'tool_use') {
        return [b];
      }
      return [];
    }); //  1回のllm実行がstreamで複数分割されているのを結合するが、1回のllm実行で複数のfuncがあることはありうる
    if (funcCalls.length === 0) return Effect.succeed({output: [], nextTask: Option.none()});
    console.log('funcCalls:', funcCalls);
    const state = this;
    // return Effect.forEach(funcCalls, a1 => {
    //  ツールの実行と実行結果 実行前情報なので依頼としてiteratorに回す
    return Effect.gen(function* () {
      const next: AsOutput[] = [];
      //  ツール依頼 実行後情報なのでここで追加する nativeはその前の
      const funcCall: Anthropic.Messages.MessageParam = {
        role: 'assistant',
        content: funcCalls,
      };
      state.prevContexts.push(funcCall);  //  1件のリクエストの追記
      next.push(AsOutput.makeOutput(AsMessage.makeMessage({
          from: avatarState.Name,
          toolData: funcCalls.map(value => value),
        }, 'physics', 'toolIn','inner'),
        {
          provider: state.genName,
          model: state.model,
          isExternal: false,
        }));
      console.log('funcCalls:', funcCalls);
      const toLlm = yield* Effect.forEach(funcCalls, a => {
        return Effect.gen(function* () {
          const toolRes = yield* McpService.callFunction(avatarState, a,'claudeText').pipe(Effect.catchAll(e => {
            console.log('tool error:', e); //  tool denyの件もここに来る TODO denyと他エラーを分けたほうがよい
            return Effect.succeed({
              call_id: a.id,
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
              let llmOut: any = a2; //  todo 書式は基本的にMCPとClaudeは合っているはず
              if (a2.type === 'text') {
                content.text = a2.text;
              } else if (a2.type === 'image') {
                const mediaUrl = yield* DocService.saveDocMedia(nextId, a2.mimeType, a2.data, avatarState.TemplateId);
                const b1 = yield* state.shrinkImage(Buffer.from(a2.data, 'base64').buffer, state.claudeSettings?.inWidth);
                // a2.data = b1.toString('base64'); //  TODO 上書き更新にしている
                content.mediaUrl = mediaUrl;
                content.mimeType = 'image/png';
                //  縮小した画像をLLMには送る
                llmOut = {
                  type: 'image',
                  source: {
                    type: 'base64',
                    data: b1.toString('base64'),
                  },
                } as Anthropic.Messages.ImageBlockParam;
              } else if (a2.type === 'resource') {
                //  TODO resourceはuriらしい
                content.mediaUrl = a2.uri;
              }
              //  todo func callで呼び出したコールは入力文脈としてコンテキストには追加しない方向ではないか? なのでpreviousContentには追加しない
              return [{
                llmOut: {
                  type: 'tool_result',
                  tool_use_id: a.id,
                  content: [llmOut],
                } as Anthropic.Messages.ToolResultBlockParam,
                mes: {
                  id: nextId,
                  tick: dayjs().valueOf(),
                  asClass: 'physics', //  TODO ちょっと姑息だがtextだったらsystemにする。それ以外imageとかはtalkにする 後で一貫性について検討要
                  asRole: 'toolOut',
                  asContext:'inner',
                  isRequestAction: false,
                  content: content,
                } as AsMessage,
              }];
            }).pipe(Effect.catchAll(_ => Effect.succeed([])));
          }).pipe(Effect.andThen(a => a.flat()));

        });
      }).pipe(Effect.andThen(a => a.flat()));
      //  TODO gptは複数のtool生成結果を次の1回の実行で受け取る。 AsMessageは1メッセージ1コンテンツである。
      //   つまりAsMessageは複数作られる その最初のAsMessageにのみ1件のgpt行きタスクがあり、他のasMessageには含まれない この対応関係はAsMessageを主体とするのかは決めないし、メッセージ再現時にその関係性を厳密には保たない
      let task = Option.none<Anthropic.Messages.MessageParam>();
      if (toLlm.length > 0) {
        //  次に回すタスク
        const nextTask = {
          role: 'user',
          content: toLlm.flatMap(a => a.llmOut),   //  1回で送る functionResponseにはidが含まれるので区別はできているはず 1回のllm実行に対して1回のtoolsを返す形
        } as Anthropic.Messages.MessageParam;
        task = Option.some(nextTask);
        //  func call結果(native付き)
        next.push(AsOutput.makeOutput(toLlm[0].mes, {
          provider: state.genName,
          model: state.model,
          isExternal: false,
        }, [nextTask]));
        //  func call結果(AsMessageのみ)
        next.push(...toLlm.slice(1).map(a =>
          AsOutput.makeOutput(a.mes, {
            provider: state.genName,
            model: state.model,
            isExternal: false,
          })));
      }
      return {output: next, nextTask: task};
    });
  }

  getNativeContext(): Effect.Effect<AsOutput[], void, ConfigService | McpService> {
    return Effect.succeed([]);  //  TODO
  }

}

export class ClaudeTextGenerator extends ClaudeBaseGenerator {
  protected genName: GeneratorProvider = 'claudeText';
  protected model = 'claude-3-7-sonnet-latest';


  static make(sysConfig: SysConfig, settings?: ContextGeneratorSetting): Effect.Effect<ClaudeBaseGenerator, Error> {
    if (!sysConfig.generators?.anthropic.apiKey) {
      return Effect.fail(new Error('Claude api key is not set.'));
    }
    return Effect.succeed(new ClaudeTextGenerator(sysConfig, settings as ClaudeTextSettings | undefined));
  }

  override execLlm(inputContext: Anthropic.Messages.MessageParam, avatarState: AvatarState): Effect.Effect<Anthropic.Messages.ContentBlock[], void, ConfigService | McpService> {
    const it = this;
    //  it.prevContextsの末尾がuserの場合、マージする TODO テキストレベルでのマージが必要か?
    let contents = this.prevContexts
    if(contents.length > 0 && contents[contents.length - 1].role === 'user') {
      const last = contents[contents.length - 1];
      let lastContent;
      if(typeof last.content === 'string') {
        lastContent = [
            {
              type: 'text',
              text: last.content,
            } as Anthropic.Messages.TextBlockParam
          ]
      } else {
        lastContent = last.content;
      }
      let curContent
      if(typeof inputContext.content === 'string') {
        curContent = [
            {
              type: 'text',
              text: inputContext.content,
            } as Anthropic.Messages.TextBlockParam
          ]
      } else {
        curContent = inputContext.content;
      }
      contents[contents.length-1] ={
        role: last.role,
        content: lastContent.concat(curContent),
      }
    }
    return Effect.gen(this, function* () {
      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      it.prevContexts.push(inputContext);
      console.log('claude :', JSON.stringify(it.prevContexts));
      const body: Anthropic.Messages.MessageCreateParamsStreaming = {
        model: it.model || 'claude-3-5-haiku-latest',
        messages: contents,
        // messages: it.prevContexts,
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
          console.log(text);
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
      // state.clearStreamingText(avatarState)
      console.log(message.content);
      return message.content;
    }).pipe(Effect.catchIf(a => a instanceof Error, _ => Effect.succeed([])));
  }


}
