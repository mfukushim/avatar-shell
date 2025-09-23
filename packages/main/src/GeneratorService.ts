import {Effect, Option, Queue, Schema} from 'effect';
import {McpService} from './McpService.js';
import {AvatarState} from './AvatarState.js';
import {AsMessage, AsMessageContent, SysConfig, ToolCallParam} from '../../common/Def.js';
import {ContextGeneratorSetting, GeneratorProvider} from '../../common/DefGenerators.js';
import {AvatarService} from './AvatarService.js';
import {z} from 'zod';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {ConfigService} from './ConfigService.js';
import {GeneratorTask} from './ContextGenerator.js';
import {LlmBaseGenerator} from './LlmGenerator.js';
import {OllamaTextGenerator} from './generators/OllamaGenerator.js';


export interface GenInner {
  avatarId:string;
  toGenerator:GeneratorProvider;
  input?:AsMessageContent;
  toolCallRes?:{
    results:{
      toLlm: z.infer<typeof CallToolResultSchema>,
      // callId: string,
      status:string
    }[],
    callId: string,
  }
  //  GeneratorOutput
  //  AvatarState
  //  InputText
}

export interface GenOuter {
  avatarId:string;
  fromGenerator:GeneratorProvider;
  innerId:string;
  toolCallParam?:ToolCallParam[];
  outputText?:string;
  //  ToolCallParam
  //  AvatarState
  //  OutputText
}


export class GeneratorService extends Effect.Service<GeneratorService>()('avatar-shell/GeneratorService', {
  accessors: true,
  effect: Effect.gen(function* () {
    const InnerQueue = yield *Queue.bounded<GenInner>(100)
    const OuterQueue = yield *Queue.bounded<GenOuter>(100)

    function enterInner(inner:GenInner) {

    }

    function execGeneratorLoop() {
      return Effect.loop(true,{
        while:a => a,
        body:b => Effect.gen(function*() {
          const inner = yield* Queue.take<GenInner>(InnerQueue)
          //  Generator処理
          const avatarState = yield *AvatarService.getAvatarState(inner.avatarId)
          const sysConfig = yield *ConfigService.getSysConfig()
          // const gen = (yield *ConfigService.makeGenerator(inner.toGenerator, sysConfig)) //  settings?: ContextGeneratorSetting // TODO 統合したらすべて合わせる
          const gen = yield *OllamaTextGenerator.make({model:'llama3.2',host:'http://192.168.11.121:11434'})
          const res = yield *gen.generateContext(inner,avatarState) // 処理するコンテキスト、prevとして抽出適用するコンテキストの設定、
          avatarState.appendContext(res)
          yield *Queue.offerAll(OuterQueue, res);
        }),
        step:b => b,
        discard:true
      })
    }

    function execExternalLoop() {
      return Effect.loop(true,{
        while:a => a,
        body:b => Effect.gen(function*() {
          const outer = yield* Queue.take(OuterQueue)
          //  MCP処理
          const res = yield *solveMcp([outer])
          const r = res.flat()
          yield *Queue.offer(InnerQueue, {
            avatarId:outer.avatarId,
            toGenerator:outer.fromGenerator,
            toolCallRes: {
              results:r.map(b =>({toLlm:b.toLlm as z.infer<typeof CallToolResultSchema>,status:''})),
              callId: r[0].call_id
            }
          })
        }),
        step:b => b,
        discard:true
      })
    }

    function solveMcp(list:GenOuter[]) {
      return Effect.gen(function*() {
        // yield *Effect.forEach(list.filter(value => value.outputText),a => AvatarService.getAvatarState(a.avatarId).pipe(
        //   Effect.andThen(a1 => {
        //     const mes = AsMessage.makeMessage({
        //       innerId: a.innerId,
        //         from: a1.Name,
        //       text: a.outputText,
        //       // subCommand: SubCommandSchema,
        //       // mediaUrl: Schema.String,
        //       // mediaBin: Schema.Any, //  ArrayBuffer
        //       // mimeType: Schema.String,
        //       // toolName: Schema.String,
        //       // toolData: Schema.Any,
        //       // textParts: Schema.Array(Schema.String),
        //       // llmInfo: Schema.String,
        //       // isExternal: Schema.Boolean,
        //     },'talk','bot','surface')
        //     a1.sendToWindow([mes]);
        //   })
        // ))
        const list3 = list.filter(value => value.toolCallParam !== undefined).map(value => {
          return Effect.gen(function*() {
            const avatarState = yield *AvatarService.getAvatarState(value.avatarId)
            const x=  value.toolCallParam!!.map(value1 => {
              return McpService.callFunction(avatarState, value1);
            })
            return yield *Effect.all(x)
          })
          // return AvatarService.getAvatarState(value.avatarId).pipe(
          //   Effect.andThen(a => {
          //     const x = value.toolCallParam?.map(value1 => {
          //       return McpService.callFunction(a, value1);
          //     })
          //   }));
        })
        // const list2 = Effect.forEach(list.filter(value => value.toolCallParam !== undefined),value => {
        //   return AvatarService.getAvatarState(value.avatarId).pipe(
        //     Effect.andThen(a => McpService.callFunction(a, value.toolCallParam!!))
        //   )
        // })

        return yield *Effect.all(list3)
      })
    }

    yield *Effect.fork(execGeneratorLoop())
    yield *Effect.fork(execExternalLoop())

    return {
      enterInner,
    }
  })
}) {}
