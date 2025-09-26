import {GeneratorTask} from './ContextGenerator.js';
import {AvatarState} from './AvatarState.js';
import {Effect, Option} from 'effect';
import {
  AsContents,
  AsMessage,
  AsMessageContent,
  AsMessageContentMutable,
  AsOutput,
  SysConfig,
  ToolCallParam,
} from '../../common/Def.js';
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
import {GenInner, GenOuter} from './GeneratorService.js';
import {MediaService} from './MediaService.js';


export abstract class ClaudeBaseGenerator extends LlmBaseGenerator {
  protected claudeSettings: ClaudeTextSettings | undefined;
  protected anthropic: Anthropic;
  protected contextCache: Map<string, Anthropic.Messages.MessageParam> = new Map(); //  aiコンテンツとasMessageが非対応なのでちょっとやり方を考える。。
  protected contextCache2: Map<string, Anthropic.Messages.MessageParam> = new Map(); //  idはClaude側のネィティブidで、AsMessage側ではinnerIdを集約したものにしてみる
  // protected contextCache: Map<string, Anthropic.Messages.ContentBlockParam> = new Map(); //  aiコンテンツとasMessageが非対応なのでちょっとやり方を考える。。
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
    this.logTag = `Claude_${dayjs().unix()}`;
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
      // console.log('contentToNative:', JSON.stringify(message),);
      // if(message.innerId) {
      //   const out = it.contextCache.get(message.innerId)
      //   return out? [out]:[]
      // }
      // return [] //  TODO claudeは空を受け付けない ダミーを今は入れる でも本質的にはどうしよう。。
      return yield *Effect.fail(new Error('as to native error'))
      // return [
      //   {
      //     type: 'text',
      //     text: '',
      //   }as Anthropic.Messages.ContentBlockParam
      // ]
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
    inContext = inContext.slice(-contextSize) //.filter(value => ContextGenerator.matchContextType(value.content.mimeType, ClaudeBaseGenerator.generatorInfo.inputContextTypes));
    console.log('new inContext len:', inContext.length);
    return Effect.forEach(inContext, mes => {
      const b = it.contextCache.get(mes.id);
      if(b) {
        console.log('cached:',mes.id,b);
        return Effect.succeed([
          {
            role: b.role,
            content: Array.isArray(b.content) ? b.content.map(value => {
              //  TODO
              if (value.type === 'tool_result') {
                console.log('value.content:', value.content);
                return {
                  type:'tool_result',
                  tool_use_id: value.tool_use_id,
                  content: Array.isArray(value.content) ? value.content.map(value1 => {
                    if (value1.type === 'text') {
                      return {
                        type: 'text',
                        text: value1.text,
                      } as Anthropic.Messages.TextBlockParam;
                    }
                    if (value1.type === 'image') {
                      if(value1.source.type === 'base64') {
                        return {
                          type: 'image',
                          source: {
                            type: 'base64',
                            media_type: value1.source.media_type,
                            data: value1.source.data,
                          }
                        } as Anthropic.Messages.ImageBlockParam;
                      }
                      return {
                            type: 'image',
                            source:{
                              type: 'url',
                              url: value1.source.url,
                            }
                      }
                    }
                  }):value.content
                };
              }
              return value;
            }):b.content
          } as Anthropic.Messages.MessageParam,
        ]);
      }
      if (mes.content.text) {
        const c = [{
          type: 'text',
          text: mes.content.text,
        } as Anthropic.Messages.ContentBlockParam];
        const m:Anthropic.Messages.MessageParam = {
          role: mes.asRole === 'bot'? 'assistant':'user',
          content: c,
        }
        return Effect.succeed([m]);
      }
      return Effect.succeed([])
//      return Effect.fail(new Error('context not found'));
    }).pipe(Effect.andThen(a => {
      this.prevContexts = a.flat()
    }))
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

  toAnswerOut(responseOut: Anthropic.Message, avatarState: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    const outText = responseOut.content.flatMap(b => {
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
        // state.prevContexts.push(addPrevious);  //  テキストについてはgeminiが言った言葉を過去文脈に追加していく
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

  execFuncCall(responseOut: Anthropic.Message, avatarState: AvatarState): Effect.Effect<{
    output: AsOutput[],
    nextTask: Option.Option<LlmInputContent>
  }, Error, DocService | McpService|ConfigService> {
    const funcCalls = responseOut.content.flatMap(b => {
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
      // state.prevContexts.push(funcCall);  //  1件のリクエストの追記
      const innerId = short.generate();
      const req = {
        from: avatarState.Name,
        innerId: innerId,
        toolName: funcCalls.map(value => value.name).join(','),
        toolData: funcCalls.map(value => value),
      };
      const mes1 = AsMessage.makeMessage(req, 'physics', 'toolIn','inner');
      state.contextCache.set(mes1.id,funcCall)  //  TODO ここは直すべき
      next.push(AsOutput.makeOutput(mes1,
        {
          provider: state.genName,
          model: state.model,
          isExternal: false,
        }));
      console.log('funcCalls:', funcCalls);
      const toLlm = yield* Effect.forEach(funcCalls, a => {
        return state.execOneFuncCall(avatarState, a)
        // return Effect.gen(function* () {
        //   const toolRes = yield* McpService.callFunction(avatarState, a,'claudeText').pipe(Effect.catchAll(e => {
        //     console.log('tool error:', e); //  tool denyの件もここに来る TODO denyと他エラーを分けたほうがよい
        //     return Effect.succeed({
        //       call_id: a.id,
        //       toLlm: {
        //         content: [
        //           {
        //             type: 'text',
        //             text: `tool can not use.`,
        //           },
        //         ],
        //       },
        //     });
        //   }));
        //
        //   console.log('toolRes:'); //  ,JSON.stringify(toolRes) JSON.stringify(a1)
        //   //  ここでツールが解析した結果のcontentを分離してAsMessageにする 理由として、表示側でコンテンツによって出力結果をフィルタしたいからだ ${toolRes.call_id}_out_0 はLLM付き _out_n は生成コンテンツごとの要素として表示とログに送る
        //   return yield* Effect.forEach((toolRes.toLlm as z.infer<typeof CallToolResultSchema>).content, a2 => {
        //     return Effect.gen(function* () {
        //       const content: any = {
        //         from: avatarState.Name,
        //       };
        //       const nextId = short.generate();
        //       let llmOut: (Anthropic.Messages.TextBlockParam|Anthropic.Messages.ImageBlockParam)[] = [] // = a2; //  todo 書式は基本的にMCPとClaudeは合っているはず
        //       if (a2.type === 'text') {
        //         content.text = a2.text;
        //         llmOut = [a2]
        //       } else if (a2.type === 'image') {
        //         const mediaUrl = yield* DocService.saveDocMedia(nextId, a2.mimeType, a2.data, avatarState.TemplateId);
        //         const b1 = yield* state.shrinkImage(Buffer.from(a2.data, 'base64').buffer, state.claudeSettings?.inWidth);
        //         // a2.data = b1.toString('base64'); //  TODO 上書き更新にしている
        //         content.mediaUrl = mediaUrl;
        //         content.mimeType = 'image/png';
        //         //  縮小した画像をLLMには送る
        //         llmOut = [{
        //           type: 'image',
        //           source: {
        //             type: 'base64',
        //             media_type: content.mimeType,
        //             data: b1.toString('base64'),
        //           },
        //         }] as Anthropic.Messages.ImageBlockParam[];
        //       } else if (a2.type === 'resource') {
        //         //  TODO resourceはuriらしい resourceはLLMに回さないらしい
        //         //  MCP UIの拡張uriを受け付ける htmlテキストはかなり大きくなりうるのでimageと同じくキャッシュ保存にする
        //         content.innerId = a.id
        //         content.mediaUrl = a2.resource.uri;
        //         content.mimeType = a2.resource.mimeType
        //         if(a2.resource.uri && a2.resource.uri.startsWith('ui:/')) {
        //           console.log('to save html');
        //           //  TODO なんで型があってないんだろう。。
        //           yield* DocService.saveMcpUiMedia(a2.resource.uri, a2.resource.text as string);
        //         }
        //       }
        //       //  todo func callで呼び出したコールは入力文脈としてコンテキストには追加しない方向ではないか? なのでpreviousContentには追加しない
        //       return [{
        //         toolOneRes: llmOut,
        //         toolId:a.id,  //  todo ちょっとツール集約がおかしい
        //         mes: {
        //           id: nextId,
        //           tick: dayjs().valueOf(),
        //           asClass: 'physics', //  TODO ちょっと姑息だがtextだったらsystemにする。それ以外imageとかはtalkにする 後で一貫性について検討要
        //           asRole: 'toolOut',
        //           asContext:'inner',
        //           isRequestAction: false,
        //           content: content,
        //         } as AsMessage,
        //       }];
        //     }).pipe(Effect.catchAll(_ => Effect.succeed([])));
        //   }).pipe(Effect.andThen(a => a.flat()));
        //
        // });
      })  //.pipe(Effect.andThen(a => a.flat()));
      //  Claudeはtool_useに対してかならず対のtool_resultが必要
      //  TODO gptは複数のtool生成結果を次の1回の実行で受け取る。 AsMessageは1メッセージ1コンテンツである。
      //   つまりAsMessageは複数作られる その最初のAsMessageにのみ1件のgpt行きタスクがあり、他のasMessageには含まれない この対応関係はAsMessageを主体とするのかは決めないし、メッセージ再現時にその関係性を厳密には保たない
      let task = Option.none<Anthropic.Messages.MessageParam>();
      if (toLlm.length > 0) {
        //  次に回すタスク
        const content = [{
          type: 'tool_result',
          tool_use_id: toLlm[0].toolId,
          content: toLlm.flatMap(a => a.toolRes),
        } as Anthropic.Messages.ToolResultBlockParam];
        const nextTask = {
          role: 'user',
          content: content
        } as Anthropic.Messages.MessageParam;
        state.contextCache.set(toLlm[0].mes[0].id,nextTask) //  TODO
        console.log('cache add:',toLlm[0].mes[0].id,nextTask);

        task = Option.some(nextTask);
        //  func call結果(native付き)
        const mes = toLlm.flatMap(v => v.mes);
        next.push(AsOutput.makeOutput(mes[0], {
          provider: state.genName,
          model: state.model,
          isExternal: false,
        }, [nextTask]));
        //  func call結果(AsMessageのみ)
        mes.slice(1).forEach(a =>
          next.push(AsOutput.makeOutput(a, {
            provider: state.genName,
            model: state.model,
            isExternal: false,
          })))
        // next.push(...toLlm.slice(1).map(a =>
        //   AsOutput.makeOutput(a.mes, {
        //     provider: state.genName,
        //     model: state.model,
        //     isExternal: false,
        //   })));
      }
      return {output: next, nextTask: task};
    });
  }

  execOneFuncCall(avatarState: AvatarState, a: ToolCallParam) {
    const state = this;
    const toolId = a.callId;
    return Effect.gen(function* () {
      const toolRes = yield* McpService.callFunction(avatarState, a,'claudeText').pipe(Effect.catchAll(e => {
        console.log('tool error:', e); //  tool denyの件もここに来る TODO denyと他エラーを分けたほうがよい
        return Effect.succeed({
          call_id: toolId,
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
      return yield* Effect.forEach((toolRes.toLlm as z.infer<typeof CallToolResultSchema>).content, (a2,idx) => {
        return Effect.gen(function* () {
          const content: AsMessageContentMutable = {
            from: avatarState.Name,
            toolName:a.name
          };
          const nextId = short.generate();
          let llmOut: Anthropic.Messages.ContentBlockParam|undefined = undefined // = a2; //  todo 書式は基本的にMCPとClaudeは合っているはず
          if (a2.type === 'text') {
            content.text = a2.text;
            llmOut = {
              type:'text',
              text: a2.text
            }
            // llmOut = a2
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
                media_type: content.mimeType,
                data: b1.toString('base64'),
              },
            } as Anthropic.Messages.ImageBlockParam;
          } else if (a2.type === 'resource') {
            //  TODO resourceはuriらしい resourceはLLMに回さないらしい
            //  MCP UIの拡張uriを受け付ける htmlテキストはかなり大きくなりうるのでimageと同じくキャッシュ保存にする
            content.innerId =`${a.callId}_${idx}`
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
          }
          //  todo func callで呼び出したコールは入力文脈としてコンテキストには追加しない方向ではないか? なのでpreviousContentには追加しない
          return {
            toolOneRes: llmOut,
            // toolId:a.id,  //  todo ちょっとツール集約がおかしい
            mes: {
              id: nextId,
              tick: dayjs().valueOf(),
              asClass: 'physics', //  TODO ちょっと姑息だがtextだったらsystemにする。それ以外imageとかはtalkにする 後で一貫性について検討要
              asRole: 'toolOut',
              asContext:'inner',
              isRequestAction: false,
              content: content,
            } as AsMessage,
          };
        })  //.pipe(Effect.catchAll(_ => Effect.succeed([])));
      }).pipe(Effect.andThen(a => {
        //  TODO
        const toolRes:Anthropic.Messages.ContentBlockParam[] = []
        const mes:AsMessage[] = []
        a.forEach(value => {
          if (value.toolOneRes) {
            toolRes.push(value.toolOneRes)
          }
          if (value.mes) {
            mes.push(value.mes)
          }
        })
        return {
          toolId:toolId,
          toolRes,
          mes
        }
      }));
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

  asMessageToNative(asMessage: AsMessage[]) {
    const it = this;
    return Effect.forEach(asMessage, mes => {
      const b = it.contextCache.get(mes.id);
      if(b) {
        console.log('cached:',mes.id,b);
        return Effect.succeed([
          {
            role: b.role,
            content: Array.isArray(b.content) ? b.content.map(value => {
              //  TODO
              if (value.type === 'tool_result') {
                console.log('value.content:', value.content);
                return {
                  type:'tool_result',
                  tool_use_id: value.tool_use_id,
                  content: Array.isArray(value.content) ? value.content.map(value1 => {
                    if (value1.type === 'text') {
                      return {
                        type: 'text',
                        text: value1.text,
                      } as Anthropic.Messages.TextBlockParam;
                    }
                    if (value1.type === 'image') {
                      if(value1.source.type === 'base64') {
                        return {
                          type: 'image',
                          source: {
                            type: 'base64',
                            media_type: value1.source.media_type,
                            data: value1.source.data,
                          }
                        } as Anthropic.Messages.ImageBlockParam;
                      }
                      return {
                        type: 'image',
                        source:{
                          type: 'url',
                          url: value1.source.url,
                        }
                      }
                    }
                  }):value.content
                };
              }
              return value;
            }):b.content
          } as Anthropic.Messages.MessageParam,
        ]);
      }
      if (mes.content.text) {
        const c = [{
          type: 'text',
          text: mes.content.text,
        } as Anthropic.Messages.ContentBlockParam];
        const m:Anthropic.Messages.MessageParam = {
          role: mes.asRole === 'bot'? 'assistant':'user',
          content: c,
        }
        return Effect.succeed([m]);
      }
      return Effect.succeed([])
//      return Effect.fail(new Error('context not found'));
    }).pipe(Effect.andThen(a => a.flat() )) //  Anthropic.Messages.ContentBlockParam[]
  }

  joinNativeRole(inContext: Anthropic.Messages.MessageParam[], margeText = true): Anthropic.Messages.MessageParam[] {
    return inContext.reduce((previousValue, currentValue) => {
      if (previousValue.length > 0) {
        const last = previousValue[previousValue.length - 1];
        if (currentValue.role === last.role) {
          if(Array.isArray(last.content)) {
            last.content.push(...(typeof currentValue.content === 'string' ? [{text:currentValue.content,type:'text'} as  Anthropic.Messages.TextBlockParam]:currentValue.content));
          }
          return previousValue;
        }
      }
      previousValue.push({
        role: currentValue.role,
        content: typeof currentValue.content === 'string' ? [{text:currentValue.content,type:'text'}]:currentValue.content,
      });
      return previousValue;
    }, [] as Anthropic.Messages.MessageParam[]);
    // //  さらに同じコンテンツ内のtextを連結して1つのtextブロックにする
    // if (!margeText) {
    //   return merge;
    // }
    // return merge.map(value => {
    //   const textContents = value.contents.filter(value1 => value1.text);
    //   if (textContents.length > 1) {
    //     const text = textContents.map(value1 => value1.text).join('\n');
    //     const list = value.contents.filter(value1 => !value1.text);
    //     return {
    //       asRole: value.asRole,
    //       contents: [
    //         {text},
    //         ...list,
    //       ],
    //     };
    //   }
    //   return value;
    // });
  }


/*
  override generateContext2(current: GenInner,avatarState:AvatarState,contextConfig?:{prevLen:number;}) {
    const it = this;
    return Effect.gen( function* () {
      const content:Anthropic.Messages.ContentBlockParam[] = []
      if (current.toolCallRes) {
        const t:Anthropic.Messages.ToolResultBlockParam[] = current.toolCallRes.results.map(value =>{
          return {
            ...value.toLlm,
            tool_use_id: current.toolCallRes?.callId || '',
            type: 'tool_result',
          } as Anthropic.Messages.ToolResultBlockParam
        })
        content.push(...t)
      }
      if (current.input) {
        content.push(...(yield *it.contentToNative(current.input,false)))
      }
      const prev = (yield *avatarState.TalkContextEffect)
      const prevContents = contextConfig?.prevLen ? prev.slice(-contextConfig.prevLen) : prev;  //  TODO contextlineによるフィルタがいるはず
      const contents = yield *it.asMessageToNative(prevContents).pipe(Effect.andThen(a => it.joinNativeRole(a)));

      contents.push({
        role: 'user',
        content: content,
      });

      return yield *Effect.gen( function* () {
        yield *DocService.saveNativeLog(it.logTag,'textExecLlm_context',contents);
        const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
        console.log('tools:', tools.length);
        console.log('claude :', contents.map(value => JSON.stringify(value,null,2).slice(0,250)).join('\n'));
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
        console.log(message);
        yield *DocService.saveNativeLog(it.logTag,'textExecLlm_out',message);

        // it.prevContexts.push({
        //   role: 'assistant',
        //   content: message.content,
        // }) //  直に送らず不要分の削除がいるらしい
        return message;
      }).pipe(
        Effect.andThen(a => {
          return a.content.map(value => {
            if (value.type === 'text') {
              return [{
                avatarId:current.avatarId,
                fromGenerator:'claudeText',
                outputText:value.text,
              } as GenOuter]
            }
            if(value.type === 'tool_use') {
              return [{
                avatarId:current.avatarId,
                fromGenerator:'claudeText',
                toolCallRes:value,
              } as GenOuter]
            }
            return []
          }).flat()
        }),
        // Effect.catchIf(a => a instanceof Error, _ => Effect.succeed([])));
      )

      // return {task: Option.some(item)}; //  output

    })
  }
*/

  override execLlm(inputContext: Anthropic.Messages.MessageParam, avatarState: AvatarState): Effect.Effect<Anthropic.Message, Error, ConfigService | McpService |DocService> {
    const it = this;
    //  it.prevContextsの末尾がuserの場合、マージする TODO テキストレベルでのマージが必要か?
    let contents = this.prevContexts || []
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
    } else {
      contents.push(inputContext);
    }
    return Effect.gen( function* () {
      yield *DocService.saveNativeLog(it.logTag,'textExecLlm_context',contents);
      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      console.log('tools:', tools.length);
      console.log('claude :', contents.map(value => JSON.stringify(value,null,2).slice(0,250)).join('\n'));
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
      console.log(message);
      yield *DocService.saveNativeLog(it.logTag,'textExecLlm_out',message);

      it.prevContexts.push({
        role: 'assistant',
        content: message.content,
      }) //  直に送らず不要分の削除がいるらしい
      return message;
    }) //.pipe(Effect.catchIf(a => a instanceof Error, _ => Effect.succeed([])));
  }


}
