import {ContextGeneratorSetting, GeneratorProvider, OllamaTextSettings} from '../../../common/DefGenerators.js';
import {Chunk, Effect, Stream, Option} from 'effect';
import {GenInner, GenOuter} from '../GeneratorService.js';
import {AvatarState} from '../AvatarState.js';
import {ConfigService} from '../ConfigService.js';
import {McpService} from '../McpService.js';
import {DocService} from '../DocService.js';
import {MediaService} from '../MediaService.js';
import {ContextGenerator} from './ContextGenerator.js';

import {Ollama, Message, ToolCall} from 'ollama';
import {AsMessage} from '../../../common/Def.js';
import short from 'short-uuid';


export abstract class EmptyBaseGenerator extends ContextGenerator {
  protected abstract genName: GeneratorProvider;
  protected model = 'none';

  constructor(settings?: ContextGeneratorSetting) {
    super();
  }

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      //  prev contextを抽出(AsMessage履歴から合成またはコンテキストキャッシュから再生)
      //  入力current GenInnerからcurrent contextを調整(input textまはたMCP responses)
      //  prev+currentをLLM APIに要求、レスポンスを取得
      //  確定実行結果取得
      //  GenOuterを整理生成
      return [{
        avatarId:current.avatarId,
        fromGenerator: it.genName,
        innerId: short.generate() as string,
        outputText: "You haven't configured LLM yet, please do so first./まだLLMを設定していません。最初に設定を行ってください。",
        toolCallParam: undefined,
        setting: current.setting
      }] as GenOuter[];
    })
  }
}

export class EmptyTextGenerator extends EmptyBaseGenerator {
  protected genName: GeneratorProvider = 'emptyText';

  static make(settings?: ContextGeneratorSetting) {
    return Effect.succeed(new EmptyTextGenerator(settings));
  }
}

export class EmptyImageGenerator extends EmptyBaseGenerator {
  protected genName: GeneratorProvider = 'emptyImage';

  static make(settings?: ContextGeneratorSetting) {
    return Effect.succeed(new EmptyTextGenerator(settings));
  }
}

export class EmptyVoiceGenerator extends EmptyBaseGenerator {
  protected genName: GeneratorProvider = 'emptyImage';

  static make(settings?: ContextGeneratorSetting) {
    return Effect.succeed(new EmptyTextGenerator(settings));
  }
}

