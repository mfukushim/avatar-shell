import {AsRole, ContextGeneratorInfo, ContextTypes, GeneratorProvider} from '../../../common/DefGenerators.js';
import {AsMessage, AsMessageContent, AsOutput} from '../../../common/Def.js';
import {Effect, Option} from 'effect';
import {DocService} from '../DocService.js';
import {ConfigService} from '../ConfigService.js';
import {AvatarState} from '../AvatarState.js';
import {McpService} from '../McpService.js';
import {MediaService} from '../MediaService.js';
import {GenInner, GenOuter} from '../GeneratorService.js';
// import {GeneratorTask} from '../ContextGenerator.js';
import sharp from 'sharp';


export abstract class ContextGenerator {
  protected logTag: string;

  constructor() {
    this.logTag = this.constructor.name;
  }

  abstract generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService>

  //   abstract getGeneratorInfo():ContextGeneratorInfo
  //
  // abstract setPreviousContext(inContext: AsMessage[]):Effect.Effect<void,Error,DocService|ConfigService>
  //
  // abstract setCurrentContext(content:AsMessageContent[]):Effect.Effect<{task:Option.Option<GeneratorTask>},Error,DocService| ConfigService> //  ,output:AsOutput[]
  //
  //
  // abstract generateContext(task:Option.Option<GeneratorTask>,avatarState:AvatarState): Effect.Effect<AsMessage[], Error, ConfigService|McpService|DocService|MediaService>
  //
  // abstract generateContext2(current:GenInner,avatarState:AvatarState): Effect.Effect<GenOuter[], Error, ConfigService|McpService|DocService|MediaService>
  //
  // abstract getNativeContext():Effect.Effect<AsOutput[],void,ConfigService|McpService>
  //
  // static matchContextType(mime:string|undefined,contextType:ContextTypes[]):boolean {
  //   return contextType.some(value => {
  //     if (value === 'text') {
  //       return mime === undefined || mime.startsWith('text/') //  mimeなしはtextデフォルト
  //     }
  //     if (value === 'image') {
  //       return mime?.startsWith('image/')
  //     }
  //     return false;
  //   })
  // }

  protected abstract genName: GeneratorProvider;
  protected abstract model: string;

  get Name() {
    return this.genName;
  }

  get Model() {
    return this.model;
  }

  //  安全のため画像を小さくしておく
  shrinkImage(buf: ArrayBuffer, width = 256) {
    return Effect.tryPromise(() => sharp(buf).resize({width}).toBuffer()).pipe(Effect.catchAll(e => Effect.fail(new Error(`image shrink error:${e.message}`))));
  }

  sendStreamingText(text: string, avatarState: AvatarState) {
    avatarState.sendToWindow([AsMessage.makeMessage({
        from: avatarState.Name,
        subCommand: 'addTextParts',
        textParts: [
          text,
        ],
      }, 'system', 'system', 'outer')],
    );
  }

  clearStreamingText(avatarState: AvatarState) {
    avatarState.sendToWindow([AsMessage.makeMessage({subCommand: 'deleteTextParts'}, 'system', 'system', 'outer')]);
    return Effect.void;
  }

  filterForLlmPrevContext(asMes:AsMessage[]) {
    //  TODO ここは妥当な条件を再検討が必要。。
    return asMes.filter(value => {
      if(value.asContext === 'outer') {
        return false;
      }
      if(value.asRole === 'system') {
        return false;
      }
      return true;
    })

  }

  asRoleToRole(asRole: AsRole) {
    switch (asRole) {
      case 'human':
        return 'user';
      case 'bot':
        return 'assistant';
      case 'toolIn':
        return 'assistant';
      case 'toolOut':
        return 'user';
      case 'system':
      default:
        throw new Error("Unknown asRole " + asRole);
    }
  }

}
