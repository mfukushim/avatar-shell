import {
  GeneratorProvider,
  OllamaSysConfig,
} from '../../../common/DefGenerators.js';
import {Chunk, Effect, Stream, Option} from 'effect';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {ConfigService} from '../ConfigService.js';
import {McpService} from '../McpService.js';
import {DocService} from '../DocService.js';
import {MediaService} from '../MediaService.js';
import {ContextGenerator} from './ContextGenerator.js';
import {Ollama, Message} from 'ollama';
import {AsMessage} from '../../../common/Def.js';


export class OllamaTextGenerator extends ContextGenerator {
  protected genName: GeneratorProvider = 'ollamaText';
  protected model = 'llama3.2';
  private ollama: Ollama;

  static make(settings?: OllamaSysConfig) {
    return Effect.succeed(new OllamaTextGenerator(settings));
  }

  constructor(settings?: OllamaSysConfig) {
    super();
    this.model = settings?.model || 'llama3.1';
    this.ollama = new Ollama({
      host: settings?.host || 'http://localhost:11434',
      // headers: {
      //   Authorization: "Bearer <api key>",
      // },
    });
  }

  filterToolRes(value: any) {
    try {
      return {
        ...value,
        content: value.content.flatMap((a:any) => {
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
        }),
      };
    } catch (error) {
      console.log('filterToolRes error:',error);
      throw error;
    }
  }

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prevMes = yield *avatarState.TalkContextEffect
      const prev:Message[] = it.filterForLlmPrevContext(prevMes).flatMap(a => {
        const role = it.asRoleToRole(a.asRole)
        if(!role) return []
        return [{
          role: role,
          content:a.content.text || JSON.stringify(a.content.toolRes) || JSON.stringify(a.content.toolReq),
          images:undefined, //  TODO 画像は送るべきか?
        } as Message]
      })
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes:Message = { role: 'user', content: '' };
      if (current.input?.content.text) {
        mes.content  = current.input.content.text;
      } else if (current.toolCallRes) {
        //  TODO ollamaでの結果返答のフォーマットがあまりはっきりしない。。
        mes.content = JSON.stringify(current.toolCallRes.map(value => {
          // return value.results;
          return it.filterToolRes(value.results);
        }));
        console.log('toolCallRes:',mes.content);
      }
      if (current.input?.content.mediaUrl && current.input?.content.mimeType && current.input?.content.mimeType.startsWith('image')) {
        const media = yield* DocService.readDocMedia(current.input.content.mediaUrl);
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer);  //  , it.claudeSettings?.inWidth
        mes.images = [b1.toString('base64')];
      }

      const tools = yield* McpService.getToolDefs(avatarState.Config.mcp);
      const ollamaTools = tools.map(value => {
        return {
          type: 'function',
          function: {
            name: value.name,
            description: value.description,
            parameters: value.inputSchema,
          },
        };
      })
      //  prev+currentをLLM APIに要求、レスポンスを取得
      const messages = prev.concat(mes);
      it.debugContext(messages);
      const response = yield *Effect.tryPromise({
        try:_ => it.ollama.chat({
          model: it.model,
          messages: messages,
          tools: current.setting?.noTool ? []: ollamaTools,
          stream: true,
        }),
        catch:error => {
          console.log(`ollama error:${error}`);
          return new Error(`ollama error:${error}`);
        },
      })
      const stream =
        Stream.fromAsyncIterable(response, (e) => new Error(String(e))).pipe(
          Stream.tap((ck) => {
            // console.log('ck:',ck);
            it.sendStreamingText(ck.message.content, avatarState);
            // if (ck.done === false) {
            //   it.sendStreamingText(ck.message.content, avatarState);
            // } else if (ck.type === `error`) {
            //   console.log('error');
            // }
            return Effect.void;
          }),
        );
      //  確定実行結果取得
      const collect = yield* Stream.runCollect(stream);
      const last = Chunk.filter(collect, a => a.done === true).pipe(Chunk.last);
      const text = Chunk.filter(collect,a => a.message.content !== undefined).pipe(Chunk.map(value => value.message.content),Chunk.join(''))
      const toolReq = Chunk.filter(collect,a => a.message.tool_calls !== undefined).pipe(Chunk.map(value => value.message.tool_calls!!),Chunk.toReadonlyArray).flat()
      const toolCallParam = toolReq.map(value => {
        return {
          id:value.function.name,
          name:value.function.name,
          input:value.function.arguments,
        }
      })
      // console.log('toolcall:',JSON.stringify(toolCallParam));
      //  TODO Ollamaのimagesのレスポンスはちょっとはっきりしていないので今は考えない
      // const images = Chunk.filter(collect,a => a.message.images).pipe(Chunk.map(value => value.value.message.images))

      //  GenOuterを整理生成
      //  ollamaではメッセージを決定するidはないので avatarId+epochを仮に当てる
      // console.log('last:',last);
      // it.clearStreamingText(avatarState)
      const innerId = current.avatarId+'_' + (new Date(Option.getOrUndefined(last)?.created_at?.toString() || new Date()).getTime()).toString();
      return [{
        avatarId:current.avatarId,
        fromGenerator: it.genName,
        toGenerator: it.genName,
        innerId: innerId,
        outputText: text,
        toolCallParam:toolCallParam.length > 0 ? toolCallParam : undefined,
        setting: current.setting
      }] as GenOuter[];
    }).pipe(Effect.tapError(error => Effect.log('OllamaTextGenerator error:', error.message,error.stack)));
  }

  private debugContext(messages: Message[]) {
    console.log('ollama context start:');
    console.log(messages.map(a => {
      let text = '##'+a.role+':' + a.content?.slice(0,200);
      if (a.tool_calls) {
        a.tool_calls.forEach(b => {
          text += '\n+#' + JSON.stringify(b).slice(0,200);
        });
      }
      return text;
    }).join('\n'));
    console.log('ollama context end:');
  }
}

