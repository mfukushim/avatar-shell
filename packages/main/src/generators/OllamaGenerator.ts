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
import {Ollama, Message, ToolCall} from 'ollama';


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
          content:a.content.text || JSON.stringify(a.content.toolData),
          images:undefined, //  TODO 画像は送るべきか?
        } as Message]
      })
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes:Message = { role: 'user', content: '' };
      if (current.input?.text) {
        mes.content  = current.input.text;
      } else if (current.toolCallRes) {
        //  TODO ollamaでの結果返答のフォーマットがあまりはっきりしない。。
        mes.content = JSON.stringify(current.toolCallRes.map(value => {
          return value.results;
        }));
        console.log('toolCallRes:',mes.content);
      }
      if (current.input?.mediaUrl && current.input?.mimeType && current.input?.mimeType.startsWith('image')) {
        const media = yield* DocService.readDocMedia(current.input?.mediaUrl);
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
      console.log('messages:',JSON.stringify(messages));
      const response = yield *Effect.tryPromise({
        try:_ => it.ollama.chat({
          model: it.model,
          messages: messages,
          tools: current.setting?.noTool ? undefined: ollamaTools,
          stream: true,
        }),
        catch:error => new Error(`ollama error:${error}`),
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
    })
  }

}

