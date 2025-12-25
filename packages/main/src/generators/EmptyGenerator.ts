import {ContextGeneratorSetting, GeneratorProvider} from '../../../common/DefGenerators.js';
import {Effect} from 'effect';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {ConfigService} from '../ConfigService.js';
import {McpService} from '../McpService.js';
import {DocService} from '../DocService.js';
import {MediaService} from '../MediaService.js';
import {ContextGenerator} from './ContextGenerator.js';
import short from 'short-uuid';
import {SysConfig} from '../../../common/Def.js';


/**
 * 汎用ダミーのコンテキストジェネレーター
 * 何もしない。呼び出されたらログを出すのみ。
 * The `EmptyBaseGenerator` class is an abstract base class inheriting from `ContextGenerator`.
 * It provides the infrastructure for generating contexts based on specific implementations
 * of the `genName` generator provider and model configuration.
 *
 * This class is designed for advanced context generation where user-defined settings
 * and input-output modifications are handled seamlessly using provided services.
 *
 * Key Responsibilities:
 * - Abstracts the logic for generating new context data based on the current input state.
 * - Extends and interacts with external services to enable more complex operations.
 * - Provides an overrideable structure for extending generators with specific functionality.
 *
 * Key Properties:
 * - `genName`: Abstract property to be implemented in derived classes to define the generator provider.
 * - `model`: Default value set to 'none', representing the model configuration used in generation processes.
 *
 * Methods:
 * - `generateContext`: A function that generates and returns a modified context based on the
 *   current state of the generator (`GenInner`) and the provided `avatarState`.
 *   It utilizes external services (`ConfigService`, `McpService`, `DocService`, or `MediaService`)
 *   to facilitate and process the generation.
 *
 * Extends:
 * - ContextGenerator: The base class that `EmptyBaseGenerator` extends, inheriting core utility functions and properties.
 *
 * Notes:
 * - The class itself is abstract and requires implementation of `genName` in derived classes.
 * - Parts of the context logic rely on pre-existing states (`prev context`) as well as adjustments derived from input.
 */
export abstract class EmptyBaseGenerator extends ContextGenerator {
  protected abstract genName: GeneratorProvider;
  protected model = 'none';

  constructor(sysConfig:SysConfig, settings?: ContextGeneratorSetting) {
    super(sysConfig);
  }

  setSystemContext(context:string):void {
    console.log('setSystemContext:',context);
  }

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      //  prev+currentをLLM APIに要求、レスポンスを取得
      //  確定実行結果取得
      //  GenOuterを整理生成
      const nextGen = current.genNum + 1;
      return [{
        avatarId:current.avatarId,
        fromGenerator: it.genName,
        fromModelName:it.model,
        toGenerator: it,
        innerId: short.generate() as string,
        outputText: "You haven't configured LLM yet, please do so first./まだLLMを設定していません。最初に設定を行ってください。",
        toolCallParam: undefined,
        setting: {
          ...current.setting,
          toClass: 'system'
        },
        genNum: nextGen
      }] as GenOuter[];
    })
  }
}

export class EmptyTextGenerator extends EmptyBaseGenerator {
  protected genName: GeneratorProvider = 'emptyText';

  static make(sysConfig: SysConfig,settings?: ContextGeneratorSetting) {
    return Effect.succeed(new EmptyTextGenerator(sysConfig, settings));
  }
}

export class EmptyImageGenerator extends EmptyBaseGenerator {
  protected genName: GeneratorProvider = 'emptyImage';

  static make(sysConfig: SysConfig,settings?: ContextGeneratorSetting) {
    return Effect.succeed(new EmptyImageGenerator(sysConfig, settings));
  }
}

export class EmptyVoiceGenerator extends EmptyBaseGenerator {
  protected genName: GeneratorProvider = 'emptyVoice';

  static make(sysConfig: SysConfig,settings?: ContextGeneratorSetting) {
    return Effect.succeed(new EmptyVoiceGenerator(sysConfig, settings));
  }
}

