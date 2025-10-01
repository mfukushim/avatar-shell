/*
import {ContextGenerator, GeneratorOutput, GeneratorTask} from './ContextGenerator.js';
import {AsMessage, AsMessageContent, AsOutput} from '../../common/Def.js';
import {AvatarState} from './AvatarState.js';
import {Effect, Option, Schedule} from 'effect';
import {DocService} from './DocService.js';
import {McpService} from './McpService.js';
import {ConfigService} from './ConfigService.js';
import {
  ContextGeneratorInfo,
  ContextGeneratorSetting, GeneratorProvider,
  PixAiSettings,
} from '../../common/DefGenerators.js';
import {MediaBaseFragment, PixAIClient, TaskBaseFragment} from '@pixai-art/client';
import WebSocket from 'ws'
import short from 'short-uuid';
import {MediaService} from './MediaService.js';

const defaultPixAiModelId = '1648918127446573124';

export class PixAiImageGenerator extends ContextGenerator{
  private pixAiSettings: PixAiSettings | undefined;
  private prevImage: Buffer<ArrayBufferLike> | undefined;
  private mime:string | undefined;
  private prevText: string | undefined;

  private prompt: string | undefined;
  private pixAiClient:PixAIClient
  //  TODO 内部に状態を持たせているので、都度生成/破棄
  protected override genName: GeneratorProvider = 'pixAi'
  protected override model: string = ''



  static make(sysConfigImage:any,settings?: ContextGeneratorSetting): Effect.Effect<PixAiImageGenerator,Error> {
    if (!sysConfigImage.apiKey) {
      return Effect.fail(new Error('pixAi apiKey is not set'))
    }
    return Effect.succeed(new PixAiImageGenerator(sysConfigImage,settings as PixAiSettings |undefined));
  }

  constructor(sysConfigImage:any,private settings?: PixAiSettings) {
    super();
    this.pixAiClient = new PixAIClient({
      apiKey: sysConfigImage.apiKey || '',
      webSocketImpl: WebSocket
    })
  }

  getGeneratorInfo() {
    return {
      usePreviousContext: true,
      defaultPrevContextSize: 2,
      inputContextTypes: ['image','text'],
      outputContextTypes: ['image'],
      contextRole: 'bot',
    } as ContextGeneratorInfo;
  }

  setPreviousContext(inContext: AsMessage[]):Effect.Effect<void,Error,DocService|ConfigService> {
    const state = this
    return Effect.gen(function* () {
      const imageMes = inContext.flatMap(value => {
        return value.content?.mimeType?.startsWith('image') ? [value] : [] ;
      })
      const textMes = inContext.flatMap(value => {
        return value.content?.text ? [value] : [] ;
      })
      //  imageMesに画像があれば1ファイル固定、textMesにテキストがあれば2テキスト(設定値)で取得
      state.prevImage = yield *Effect.forEach(imageMes.slice(-1),value => {
        return Effect.gen(function*() {
          const url = value.content?.mediaUrl;
          if (!url) {
            return yield *Effect.fail(new Error('no image'))
          }
          state.mime = value.content.mimeType || 'image/png'
          return yield *DocService.readDocMedia(url);
        })
      }).pipe(Effect.andThen(a => Buffer.from(a[0],'base64')))
      state.prevText = textMes.slice(-2).map(value => value.content.text!!).join('\n');
    }).pipe(Effect.catchAll(e => Effect.fail(new Error(e.message))))
  }

  setCurrentContext(content:AsMessageContent[]):Effect.Effect<{task:Option.Option<GeneratorTask>},Error,DocService| ConfigService> {
    const text:string[] = []
    content.forEach(value => {
      //  もしimageが設定されていたら置き換える
      if (value.mimeType?.startsWith('image/')) {
        if (value.mediaBin) {
          this.prevImage = Buffer.from(value.mediaBin); //  TODO これは保存しなくてよいのか
        }
        this.mime = value.mimeType || 'image/png'
      }
      if(value.text) {
        text.push(value.text)
      }
    })
    this.prompt = text.join('\n')
    return Effect.succeed({task: Option.none()});
  }

  execFuncCall(responseOut: GeneratorOutput[], state: AvatarState): Effect.Effect<AsOutput[], Error, DocService | McpService> {
    return Effect.succeed([]);
  }



  generateContext(task:Option.Option<GeneratorTask>,avatarState:AvatarState): Effect.Effect<AsMessage[], Error, ConfigService|McpService|DocService|MediaService> {
    const state = this
    return Effect.gen(function* () {
      const imageOut = yield *Effect.retry(
        Effect.gen(function* () {
          let mediaId
          if (state.prevImage) {
            const blob = new Blob([state.prevImage], {type: state.mime});
            const file = new File([blob], "image", {type:state.mime})
            mediaId = yield* Effect.tryPromise({
              try: () => state.pixAiClient.uploadMedia(file),
              catch: error => new Error(`uploadMedia fail:${error}`)
            }).pipe(Effect.andThen(a1 => {
              return !a1.mediaId ? Effect.fail(new Error(`uploadMedia fail`)) : Effect.succeed(a1.mediaId);
            }))
          }
          return mediaId
        }).pipe(
          Effect.andThen(a => {
            const prompt = [state.prompt]
            if (state.prevText) {
              prompt.push(state.prevText)
            }
            const body = a ? {
              prompts: state.prompt,
              modelId: state.pixAiSettings?.modelId || defaultPixAiModelId,
              width: state.pixAiSettings?.width || 512,
              height: state.pixAiSettings?.height || 512,
              mediaId: a,
            } : {
              prompts: prompt.join('\n'),
              modelId: state.pixAiSettings?.modelId || defaultPixAiModelId,
              width: state.pixAiSettings?.width || 512,
              height: state.pixAiSettings?.height || 512,
            };
            return Effect.tryPromise({
              try: () => state.pixAiClient.generateImage(body,
              ),
              catch: error => new Error(`generateImage fail:${error}`)
            }).pipe(Effect.timeout('1 minute'))
          }),
          Effect.andThen(task => {
            return Effect.tryPromise({
              try: () => state.pixAiClient.getMediaFromTask(task as TaskBaseFragment),
              catch: error => new Error(`getMediaFromTask fail:${error}`)
            })
          }),
          Effect.andThen(media => {
            if (!media) return Effect.fail(new Error(`media fail1:${media}`))
            if (Array.isArray(media)) return Effect.fail(new Error(`media fail2:${media}`))
            return Effect.tryPromise({
              try: () => state.pixAiClient.downloadMedia(media as MediaBaseFragment),
              catch: error => new Error(`downloadMedia fail:${error}`)
            });
          }),
          Effect.andThen(a => Buffer.from(a)),
          Effect.catchAll(e => Effect.fail(new Error(e.message)))
        ), Schedule.recurs(2).pipe(
          Schedule.intersect(Schedule.spaced("10 seconds"))))

      //  nativeは保存しない
      const id = short().generate();
      const mediaUrl = yield* DocService.saveDocMedia(id, 'image/png', imageOut.toString('base64'), avatarState.TemplateId);
      return [ AsMessage.makeMessage({from: avatarState.Name, mediaUrl: mediaUrl,},'talk','bot','outer'),]
    });
  }

  getNativeContext(): Effect.Effect<AsOutput[], void, ConfigService | McpService> {
    return Effect.succeed([]);
  }

}
*/
