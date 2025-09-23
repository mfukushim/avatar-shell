import {ContextGeneratorSetting, GeneratorProvider} from '../../../common/DefGenerators.js';
import {Chunk, Effect, Stream, Option} from 'effect';
import {GenInner, GenOuter} from '../GeneratorService.js';
import {AvatarState} from '../AvatarState.js';
import {ConfigService} from '../ConfigService.js';
import {McpService} from '../McpService.js';
import {DocService} from '../DocService.js';
import {MediaService} from '../MediaService.js';
import {ContextGenerator} from './ContextGenerator.js';

import {Ollama,Message} from 'ollama';


export class OllamaTextGenerator extends ContextGenerator {
  protected genName: GeneratorProvider = 'ollamaText';
  protected model = 'llama3.2';
  private ollama: Ollama;

  static make(settings?: ContextGeneratorSetting) {
    return Effect.succeed(new OllamaTextGenerator(settings));
  }

  constructor(settings?: ContextGeneratorSetting) {
    super();
    this.model = settings?.model || 'llama3.2';
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
      const prev:Message[] = [] // TODO 仮にprevはないものとする
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      const mes:Message = { role: 'user', content: '' };
      if (current.input?.text) {
        mes.content  = current.input.text;
      }
      if (current.input?.mediaUrl && current.input?.mimeType && current.input?.mimeType.startsWith('image')) {
        const media = yield* DocService.readDocMedia(current.input?.mediaUrl);
        const b1 = yield* it.shrinkImage(Buffer.from(media, 'base64').buffer);  //  , it.claudeSettings?.inWidth
        mes.images = [b1.toString('base64')];
      }
      //  prev+currentをLLM APIに要求、レスポンスを取得
      const response = yield *Effect.tryPromise({
        try:_ => it.ollama.chat({
          model: it.model,
          messages: prev.concat(mes),
          stream: true,
        }),
        catch:error => new Error(`ollama error:${error}`),
      })
      const stream =
        Stream.fromAsyncIterable(response, (e) => new Error(String(e))).pipe(
          Stream.tap((ck) => {
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
      //  TODO Ollamaのimagesのレスポンスはちょっとはっきりしていないので今は考えない
      // const images = Chunk.filter(collect,a => a.message.images).pipe(Chunk.map(value => value.value.message.images))

      //  GenOuterを整理生成
      //  ollamaではメッセージを決定するidはないので avatarId+epochを仮に当てる
      const innerId = current.avatarId+'_' + ((Option.getOrUndefined(last)?.created_at || new Date()).getTime()).toString();
      return [{
        avatarId:current.avatarId,
        fromGenerator: it.genName,
        innerId: innerId,
        outputText: text,
      }] as GenOuter[];
    })
  }

}

