import {AsRole, GeneratorProvider} from '../../../common/DefGenerators.js';
import {AsMessage, SysConfig} from '../../../common/Def.js';
import {Effect} from 'effect';
import {DocService} from '../DocService.js';
import {ConfigService} from '../ConfigService.js';
import {AvatarState, GenInner, GenOuter} from '../AvatarState.js';
import {McpService} from '../McpService.js';
import {MediaService} from '../MediaService.js';
import sharp from 'sharp';
import short from 'short-uuid';
import {CallToolResult, ContentBlock} from '@modelcontextprotocol/sdk/types.js';


/**
 * コンテキストジェネレーター基底
 */
export abstract class ContextGenerator {
  protected logTag: string;
  protected previousNativeContexts: any[] = []  //  各LLMでの過去コンテキストのキャッシュ
  protected uniqueId = '';
  protected sysSetting:SysConfig


  constructor(sysSetting:SysConfig) {
    this.logTag = this.constructor.name;
    this.uniqueId = short.generate() as string;
    this.sysSetting = sysSetting
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

  //  ストリーミング部分送信
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

  //  ストリーミングクリア
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

  filterToolRes(value: ContentBlock ) {
    //  sysConfigでexperimental.mcpUiFilterDisabledがtrueの場合フィルタしない
    if(this.sysSetting.experimental.mcpUiFilterDisabled) return [value];
    //  sysConfigでexperimental.mcpUiFilterDisabledがfalseの場合
    //    resource.uriがui://であればLLMに送らない
    if(value.type === 'resource' && value.resource.uri.startsWith('ui:/')) {
      console.log('contents test no out');
      return [];
    }
    //    resource.anotations.audienceが存在して、その中に'assistant'が含まれないときはLLMに送らない
    //  @ts-ignore
    if (value.type === 'resource' && value.resource?.annotations && value.resource.annotations?.audience) {
      //  @ts-ignore
      if (!value.resource.annotations.audience.includes('assistant')) {
        console.log('contents test no out');
        return [];
      }
    }
    //  @ts-ignore
    if (value?.annotations && value.annotations?.audience) {
      //  @ts-ignore
      if (!value.annotations.audience.includes('assistant')) {
        console.log('contents test no out');
        return [];
      }
    }
    return [value];
  }


  filterToolResList(value: CallToolResult) {
    const data = value.content.flatMap((a:ContentBlock) => {
      return this.filterToolRes(a);
    })
    //  フィルタの結果として0件になった場合、ダミーデータを付ける
    return data.length > 0 ? data : [{text: 'server accepted', type: 'text'} as ContentBlock];
  }

  //  asRoleから一般LLM向けロールへ
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

/**
 * コンテキストのコピー設定
 * 主にouterからsurfaceにコンテキストをコピーして個々のLLMの入力としてピックするためのコンテキストジェネレーター
 * The CopyGenerator class is responsible for creating a simple copy-based
 * generation context for GenOuter types. It extends the ContextGenerator class
 * and employs the 'copy' generation mechanism to create an output context
 * based on the provided input.
 *
 * The main functionality of this class includes:
 * - Generating the next generation context with 'copy' as the source generator.
 * - Copying specific input content such as text, media URL, and MIME type to
 *   the generated context if present within the input.
 */
export class CopyGenerator extends ContextGenerator {
  protected genName: GeneratorProvider = 'copy';
  protected model = 'none';

  static make(sysConfig: SysConfig) {
    return Effect.succeed(new CopyGenerator(sysConfig));
  }

  generateContext(current: GenInner, avatarState: AvatarState): Effect.Effect<GenOuter[], Error, ConfigService | McpService | DocService | MediaService> {
    const nextGen = current.genNum + 1;
    const out:GenOuter = {
      avatarId: current.avatarId,
      fromGenerator: 'copy',
      toGenerator: this,
      innerId: short.generate() as string,
      genNum: nextGen,
      setting: {
        ...current.setting,
      },
    };
    if (current.input?.content.from) {
      out.outputFrom = current.input?.content.from;
    }
    if (current.input?.content.text) {
      out.outputText = current.input?.content.text;
    }
    if(current.input?.content.mediaUrl && current.input?.content.mimeType && current.input?.content.mimeType.startsWith('image')) {
      out.outputMediaUrl = current.input.content.mediaUrl;
      out.outputMime = current.input.content.mimeType;
    }
    return Effect.succeed([out]);
  }
}
