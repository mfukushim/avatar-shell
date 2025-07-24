import {AsOutput, AsMessage, AsMessageContent} from '../../common/Def.js';
import {Effect,Option} from 'effect';
import {ConfigService} from './ConfigService.js';
import {AvatarState} from './AvatarState.js';
import {DocService} from './DocService.js';
import {McpService} from './McpService.js';
import {AsClass, ContextGeneratorInfo, ContextTypes, GeneratorProvider} from '../../common/DefGenerators.js';
import {MediaService} from './MediaService.js';

export type GeneratorTask = any
export type GeneratorOutput = any

export abstract class ContextGenerator {
  // abstract initialize(sysConfig:SysConfig,setting:any)

  abstract getGeneratorInfo():ContextGeneratorInfo

  abstract setPreviousContext(inContext: AsMessage[]):Effect.Effect<void,Error,DocService|ConfigService>

  abstract setCurrentContext(content:AsMessageContent[],asClass:AsClass):Effect.Effect<{task:Option.Option<GeneratorTask>},Error,DocService| ConfigService> //  ,output:AsOutput[]


  abstract generateContext(task:Option.Option<GeneratorTask>,avatarState:AvatarState): Effect.Effect<AsMessage[], Error, ConfigService|McpService|DocService|MediaService>

  abstract getNativeContext():Effect.Effect<AsOutput[],void,ConfigService|McpService>

  static matchContextType(mime:string|undefined,contextType:ContextTypes[]):boolean {
    return contextType.some(value => {
      if (value === 'text') {
        return mime === undefined || mime.startsWith('text/') //  mimeなしはtextデフォルト
      }
      if (value === 'image') {
        return mime?.startsWith('image/')
      }
      return false;
    })
  }

  protected abstract genName: GeneratorProvider;
  protected abstract model: string;

  get Name() {
    return this.genName
  }
  get Model() {
    return this.model
  }

  // static make(settings: ContextGeneratorSetting): any {
  //   //return new OpenAiBaseGenerator(settings as OpenAiSettings);
  // }
}


