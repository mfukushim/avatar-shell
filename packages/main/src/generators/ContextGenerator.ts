import {AsRole, GeneratorProvider} from '../../../common/DefGenerators.js';
import {AsMessage} from '../../../common/Def.js';
import {Effect} from 'effect';
import {DocService} from '../DocService.js';
import {ConfigService} from '../ConfigService.js';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {McpService} from '../McpService.js';
import {MediaService} from '../MediaService.js';
import sharp from 'sharp';
import short from 'short-uuid';


export class ContextGenInstance {
  constructor(
    public previousContexts: {id: string, Context: any}[],
  ) {
  }
}

export abstract class ContextGenerator {
  protected logTag: string;
  protected previousNativeContexts: any[] = []
  protected uniqueId = '';


  constructor() {
    this.logTag = this.constructor.name;
    this.uniqueId = short.generate() as string;
  }

  abstract generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService>

  protected abstract genName: GeneratorProvider;
  protected abstract model: string;

  get Name() {
    return this.genName;
  }

  get Model() {
    return this.model;
  }

  get UniqueId() {
    return this.uniqueId;
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
    avatarState.clearStreamingText()
  }

  filterForLlmPrevContext(asMes:AsMessage[],current?:AsMessage) {
    //  TODO ここは妥当な条件を再検討が必要。。
    //  currentを含まないこと、currentよりもtickが古いこと
    return asMes.filter(value => {
      if(value.asContext === 'outer') {
        return false;
      }
      if(value.asRole === 'system') {
        return false;
      }
      if(value.id === current?.id) {
        return false;
      }
      if(current && value.tick >= current.tick) {
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
