import {
  ContextGeneratorSetting,
  GeneratorProvider,
} from '../../../common/DefGenerators.js';
import {Chunk, Effect, Stream, Option} from 'effect';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {ConfigService} from '../ConfigService.js';
import {McpService} from '../McpService.js';
import {DocService} from '../DocService.js';
import {MediaService} from '../MediaService.js';
import {ContextGenerator} from './ContextGenerator.js';
import {Ollama, Message} from 'ollama';
import {SysConfig} from '../../../common/Def.js';


/**
 * OllamaTextジェネレーター
 *
 * OllamaTextGenerator extends the ContextGenerator class to provide text generation functionality
 * using the Ollama service. This class is responsible for managing the context, interacting with
 * the Ollama service, and generating appropriate responses.
 */
export class OllamaTextGenerator extends ContextGenerator {
  protected genName: GeneratorProvider = 'ollamaText';
  protected model = 'llama3.2';
  private ollama: Ollama;
  protected systemPrompt?:Message[];
  //  TODO ollamaの場合最大コンテキストサイズの取得は?

  protected get previousContexts() {
    return this.previousNativeContexts as Message[];
  }

  static make(sysConfig:SysConfig, settings?: ContextGeneratorSetting) {
    return Effect.succeed(new OllamaTextGenerator(sysConfig,settings));
  }

  constructor(setting: SysConfig,settings?: ContextGeneratorSetting) {
    super(setting);
    this.model = settings?.useModel || setting.generators.ollama?.model || 'llama3.1';
    this.ollama = new Ollama({
      host: setting.generators.ollama?.host || 'http://localhost:11434',
      // headers: {
      //   Authorization: "Bearer <api key>",
      // },
    });
  }

  setSystemPrompt(context:string):void {
    this.systemPrompt = [{ role: 'system', content: context }];
  }

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      const prevMes = yield *avatarState.TalkContextEffect
      const prevMake:Message[] = it.filterForLlmPrevContext(prevMes,current.input).flatMap(a => {
        const role = it.asRoleToRole(a.asRole)
        if(!role) return []
        return [{
          role: role,
          content:a.content.text || JSON.stringify(a.content.toolRes) || JSON.stringify(a.content.toolReq),
          images:undefined, //  TODO 画像は送るべきか?
        } as Message]
      })
      const prev = Array.from(it.previousContexts)
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes:Message = { role: 'user', content: '' };
      if (current.input?.content.text) {
        mes.content  = current.input.content.text;
      } else if (current.toolCallRes) {
        //  TODO ollamaでの結果返答のフォーマットがあまりはっきりしない。。
        mes.content = JSON.stringify(current.toolCallRes.map(value => {
          // return value.results;
          return it.filterToolResList(value.results);
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
      const messages = (it.systemPrompt || []).concat(prev, mes);
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
            it.sendStreamingText(ck.message.content, avatarState);
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
      it.previousContexts.push({
        role: mes.role,
        content:mes.content,
      })
      it.previousContexts.push({
        role: 'assistant',
        content:'text',
        tool_calls:toolReq,
      } as Message)
      const inputTokens = Chunk.map(collect,a => a.prompt_eval_count).pipe(Chunk.reduce(0,(init,val) => init+val))
      it.inputTokes = inputTokens;

      //  TODO Ollamaのimagesのレスポンスはちょっとはっきりしていないので今は考えない
      // const images = Chunk.filter(collect,a => a.message.images).pipe(Chunk.map(value => value.value.message.images))

      //  GenOuterを整理生成
      //  ollamaではメッセージを決定するidはないので avatarId+epochを仮に当てる
      const nextGen = current.genNum+1
      const innerId = current.avatarId+'_' + (new Date(Option.getOrUndefined(last)?.created_at?.toString() || new Date()).getTime()).toString();
      return [{
        avatarId:current.avatarId,
        fromGenerator: it.genName,
        fromModelName:it.model,
        inputTokens:inputTokens,
        maxContextSize: it.maxModelContextSize,
        toGenerator: it,
        innerId: innerId,
        outputText: text,
        toolCallParam:toolCallParam.length > 0 ? toolCallParam : undefined,
        setting: current.setting,
        genNum: nextGen,
      }] as GenOuter[];
    }).pipe(Effect.tapError(error => Effect.log('OllamaTextGenerator error:', error.message,error.stack)));
  }

  private debugContext(messages: Message[]) {
    console.log('ollama context start:');
    console.log(messages.map(a => {
      let text = '##'+a.role+':' + a.content?.slice(0,200).replaceAll('\n','');
      if (a.tool_calls) {
        a.tool_calls.forEach(b => {
          text += '\n+#' + JSON.stringify(b).slice(0,200).replaceAll('\n','');
        });
      }
      return text;
    }).join('\n'));
    console.log('ollama context end:');
  }
}

