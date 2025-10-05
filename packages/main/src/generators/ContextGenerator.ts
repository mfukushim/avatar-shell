import {AsRole, GeneratorProvider} from '../../../common/DefGenerators.js';
import {AsMessage} from '../../../common/Def.js';
import {Effect} from 'effect';
import {DocService} from '../DocService.js';
import {ConfigService} from '../ConfigService.js';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {McpService} from '../McpService.js';
import {MediaService} from '../MediaService.js';
import sharp from 'sharp';


export abstract class ContextGenerator {
  protected logTag: string;

  constructor() {
    this.logTag = this.constructor.name;
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

  filterForLlmPrevContext(asMes:AsMessage[]) {
    //  TODO ここは妥当な条件を再検討が必要。。
    return asMes.filter(value => {
      if(value.asContext === 'outer') {
        return false;
      }
      return value.asRole !== 'system';

    })

  }

  filterToolRes(value: any) {
    try {
      console.log('filterToolRes:',value);
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
