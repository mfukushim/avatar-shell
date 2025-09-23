/*! avatar-shell | Apache-2.0 License | https://github.com/mfukushim/avatar-shell */
import {AsOutput, AsMessage, AsMessageContent} from '../../common/Def.js';
import {Effect,Option} from 'effect';
import {ConfigService} from './ConfigService.js';
import {AvatarState} from './AvatarState.js';
import {DocService} from './DocService.js';
import {McpService} from './McpService.js';
import {ContextGeneratorInfo, ContextTypes, GeneratorProvider} from '../../common/DefGenerators.js';
import {MediaService} from './MediaService.js';
import {GenInner, GenOuter} from './GeneratorService.js';

export type GeneratorTask = any
export type GeneratorOutput = any

export abstract class ContextGenerator {
  protected logTag:string
  constructor() {
    this.logTag = this.constructor.name;
  }

  abstract getGeneratorInfo():ContextGeneratorInfo

  abstract setPreviousContext(inContext: AsMessage[]):Effect.Effect<void,Error,DocService|ConfigService>

  abstract setCurrentContext(content:AsMessageContent[]):Effect.Effect<{task:Option.Option<GeneratorTask>},Error,DocService| ConfigService> //  ,output:AsOutput[]


  abstract generateContext(task:Option.Option<GeneratorTask>,avatarState:AvatarState): Effect.Effect<AsMessage[], Error, ConfigService|McpService|DocService|MediaService>

  abstract generateContext2(current:GenInner,avatarState:AvatarState): Effect.Effect<GenOuter[], Error, ConfigService|McpService|DocService|MediaService>

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

}


