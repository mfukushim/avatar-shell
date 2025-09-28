/*
import {ContextGenerator, GeneratorOutput, GeneratorTask} from './ContextGenerator.js';
import {AvatarState} from './AvatarState.js';
import {Effect, Option} from 'effect';
import {AsOutput, AsMessage, AsMessageContent, AsContents} from '../../common/Def.js';
import {DocService} from './DocService.js';
import {McpService} from './McpService.js';
import {ConfigService} from './ConfigService.js';
import {
  ContextGeneratorInfo, ContextGeneratorSetting, GeneratorProvider,
} from '../../common/DefGenerators.js';
import {MediaService} from './MediaService.js';
import sharp from 'sharp';
import {GenInner, GenOuter} from './GeneratorService.js';


export type LlmInputContent = any

export abstract class LlmBaseGenerator extends ContextGenerator {
  abstract execLlm(inputContext: LlmInputContent, avatarState: AvatarState): Effect.Effect<GeneratorOutput, Error, ConfigService | McpService | DocService>

  abstract toAnswerOut(responseOut: GeneratorOutput, state: AvatarState): Effect.Effect<AsOutput[], Error, DocService>

  abstract execFuncCall(responseOut: GeneratorOutput, state: AvatarState): Effect.Effect<{
    output: AsOutput[],
    nextTask: Option.Option<LlmInputContent>
  }, Error, DocService | McpService|ConfigService>

  override generateContext(task: Option.Option<GeneratorTask>, avatarState: AvatarState): Effect.Effect<AsMessage[], Error, ConfigService | McpService | DocService | MediaService> {
    const state = this;
    const ansList: AsMessage[] = [];
    return Effect.iterate(task, {
      while: a => Option.isSome(a),
      body: b => {
        // console.log('body ', b.map(value => 'llmMes:' + JSON.stringify(value.llmMes).slice(0, 512) + '\nmes:' + JSON.stringify(value.mes).slice(0, 512)).join('\n'));
        // console.log('tools ', tools);
        //  TODO どうも定期的に手動でサマライズするのがよさそう https://community.openai.com/t/responses-api-question-about-managing-conversation-state-with-previous-response-id/1141633/13
        return Effect.gen(function* () {
          const taskData = yield* b;
          console.log('llmIn:', JSON.stringify(taskData).slice(0, 200));
          const outputLlm = yield* state.execLlm(taskData, avatarState);
          console.log('outputLlm:', JSON.stringify(outputLlm).slice(0, 200));
          //  確定実行分を結果出力に回す。ツール実行分をMCP実行し、結果を再実行に回す
          const outText = yield* state.toAnswerOut(outputLlm, avatarState);
          console.log('outText:', outText.map(value => JSON.stringify(value).slice(0, 200)).join('\n'));
          // const nextContexts = outContents.flatMap(value => value.llmMes)
          ansList.push(...outText.flatMap(value => value.mes));
          yield* DocService.addLog(outText, avatarState);
          console.log('generateContext a:', ansList.map(value => JSON.stringify(value).slice(0, 200)).join('\n'));
          //  MCP結果はさらにLLMへの依頼戻しとしてiteratorに回す
          const {output, nextTask} = yield* state.execFuncCall(outputLlm, avatarState);
          console.log('outFunc:', output.map(a => JSON.stringify(a).slice(0, 200)).join('\n'));
          // nextIn.push(...outFunc.flatMap(value => value.genNative));
          ansList.push(...output.flatMap(value => value.mes));
          yield* DocService.addLog(output, avatarState);
          return nextTask;
          // return output.length > 0 ? Option.some(output.flatMap(v => v.genNative)) : Option.none();  //  outFuncがあればまだ実行する必要がある
        });
      },
    }).pipe(
      Effect.tap(() => state.clearStreamingText(avatarState)),
      Effect.tapError(() => state.clearStreamingText(avatarState)),
      Effect.catchAll(e => {
        console.log('llm error:', e);
        return state.clearStreamingText(avatarState).pipe(Effect.andThen(() => Effect.fail(new Error(`${e}`))));
      }),
      Effect.andThen(() => ansList),
    );
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
      }, 'system', 'system','outer')],
    );

  }

  clearStreamingText(avatarState: AvatarState) {
    avatarState.sendToWindow([AsMessage.makeMessage({subCommand: 'deleteTextParts'}, 'system', 'system','outer')]);
    return Effect.void;
  }

  joinRole(inContext: AsMessage[], margeText = true): AsContents[] {
    const merge = inContext.reduce((previousValue, currentValue) => {
      if (previousValue.length > 0) {
        const last = previousValue[previousValue.length - 1];
        if (currentValue.asRole === last.asRole) {
          last.contents.push(currentValue.content);
          return previousValue;
        }
      }
      previousValue.push({
        asRole: currentValue.asRole,
        contents: [currentValue.content],
      });
      return previousValue;
    }, [] as AsContents[]);
    //  さらに同じコンテンツ内のtextを連結して1つのtextブロックにする
    if (!margeText) {
      return merge;
    }
    return merge.map(value => {
      const textContents = value.contents.filter(value1 => value1.text);
      if (textContents.length > 1) {
        const text = textContents.map(value1 => value1.text).join('\n');
        const list = value.contents.filter(value1 => !value1.text);
        return {
          asRole: value.asRole,
          contents: [
            {text},
            ...list,
          ],
        };
      }
      return value;
    });
  }

}


export abstract class EmptyLlmGenerator extends LlmBaseGenerator {
  protected settings: ContextGeneratorSetting | undefined;
  protected override genName: GeneratorProvider = 'emptyText'
  protected override model: string = ''


  constructor(settings?: ContextGeneratorSetting) {
    super();
    this.settings = settings;
  }

  getGeneratorInfo(): ContextGeneratorInfo {
    return {
      usePreviousContext: false,
      defaultPrevContextSize: 0,
      inputContextTypes: ['text', 'image'],
      outputContextTypes: [],
      contextRole: 'bot',
      addToMainContext: true,
    };
  }

  setPreviousContext(inContext: AsMessage[]): Effect.Effect<void, Error, DocService | ConfigService> {
    console.log('empty setPreviousContext:');
    return Effect.succeed(undefined);
  }

  setCurrentContext(content: AsMessageContent[]): Effect.Effect<{
    task: Option.Option<GeneratorTask>,
    // output: AsOutput[]
  }, Error, DocService | ConfigService> {
    console.log('empty setCurrentContext:');
    // if (this.settings?.debug) {
    //   //  ダミーlogに出力する
    //   return Effect.succeed({
    //     task: Option.none(), output: content.map(value =>
    //       AsOutput.makeOutput(value, {provider: this.genName, model: this.model, isExternal: false,})),
    //   });
    // }
    return Effect.succeed({task: Option.none()}); //, output: []
  }


  override generateContext(task: Option.Option<GeneratorTask>, avatarState: AvatarState): Effect.Effect<AsMessage[], Error, ConfigService | McpService | DocService | MediaService> {
    const it = this;
    return Effect.gen(function* () {
      const mes = AsMessage.makeMessage({
        from: avatarState.Name,
        text: 'You haven\'t configured LLM yet, please do so first./まだLLMを設定していません。最初に設定を行ってください。',
      }, 'talk', 'bot','outer');
      if (it.settings?.debug) {
        yield* DocService.addLog([AsOutput.makeOutput(mes, {
          provider: it.genName,
          model: it.model,
          isExternal: false,
        })], avatarState);
      }
      return [mes];
    });
  }

  execLlm(inputContext: any, avatarState: AvatarState): Effect.Effect<GeneratorOutput, Error, ConfigService | McpService> {
    console.log('empty execLlm:');
    return Effect.succeed([]);
  }

  toAnswerOut(responseOut: GeneratorOutput, state: AvatarState): Effect.Effect<AsOutput[], Error, DocService> {
    console.log('empty toAnswerOut:');
    return Effect.succeed([
      AsOutput.makeOutput(AsMessage.makeMessage({
        from: state.Name,
        text: 'You haven\'t configured LLM yet, please do so first./まだLLMを設定していません。最初に設定を行ってください。',
      }, 'talk', 'bot','outer'), {provider: this.genName, model: this.model, isExternal: false})]);
  }

  execFuncCall(responseOut: GeneratorOutput, state: AvatarState): Effect.Effect<{
    output: AsOutput[],
    nextTask: Option.Option<LlmInputContent>
  }, Error, DocService | McpService> {
    return Effect.succeed({output: [], nextTask: Option.none()});
  }

  getNativeContext(): Effect.Effect<AsOutput[], void, ConfigService | McpService> {
    return Effect.succeed([]);
  }


}


export class EmptyTextGenerator extends EmptyLlmGenerator {
  protected genName: GeneratorProvider = 'emptyText';
  protected model = 'none';

  static make(settings?: ContextGeneratorSetting) {
    return Effect.succeed(new EmptyTextGenerator(settings));
  }

}

export class EmptyImageGenerator extends EmptyLlmGenerator {
  protected genName: GeneratorProvider = 'emptyImage';
  protected model = 'none';

  static make(settings?: ContextGeneratorSetting) {
    console.log('EmptyImageGenerator.make:');
    return Effect.succeed(new EmptyImageGenerator(settings));
  }

}

export class EmptyVoiceGenerator extends EmptyLlmGenerator {
  protected genName: GeneratorProvider = 'emptyVoice';
  protected model = 'none';

  static make(settings?: ContextGeneratorSetting) {
    return Effect.succeed(new EmptyVoiceGenerator(settings));
  }

}
*/
