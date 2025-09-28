import {Effect, Option, Queue, Schema} from 'effect';
import {McpService, McpServiceLive} from './McpService.js';
import {AvatarState} from './AvatarState.js';
import {AsMessage, AsMessageContent, SysConfig, ToolCallParam} from '../../common/Def.js';
import {ContextGeneratorSetting, GeneratorProvider} from '../../common/DefGenerators.js';
import {AvatarService, AvatarServiceLive} from './AvatarService.js';
import {z} from 'zod';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {ConfigService, ConfigServiceLive} from './ConfigService.js';
// import {GeneratorTask} from './ContextGenerator.js';
import {LlmBaseGenerator} from './LlmGenerator.js';
import {OllamaTextGenerator} from './generators/OllamaGenerator.js';
import {DocService, DocServiceLive} from './DocService.js';
import {NodeFileSystem} from '@effect/platform-node';
import {MediaServiceLive} from './MediaService.js';
import {TimeoutException} from 'effect/Cause';


export interface GenInner {
  avatarId:string;
  toGenerator:GeneratorProvider;
  input?:AsMessageContent;
  toolCallRes?:{
    name: string,
    callId: string,
    results: z.infer<typeof CallToolResultSchema>
    /*
results : {
 content: [{
    type:"text",
    text:"hello"
 },{
  type:"image",
  mimeType:"image/png",
  data:"xxx"
 }
 ],
 isError:false
}
 */

  }[],
  genNum:number,
  setting?:ContextGeneratorSetting,
  // noTool?:boolean
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
  outputImage?:string;
  outputMediaUrl?:string;
  outputMime?:string;
  genNum:number
  setting?:ContextGeneratorSetting,
  //  ToolCallParam
  //  AvatarState
  //  OutputText
}

const MaxGen = 2  //  TODO 世代の最適値は

export class GeneratorService extends Effect.Service<GeneratorService>()('avatar-shell/GeneratorService', {
  accessors: true,
  effect: Effect.gen(function* () {
    const InnerQueue = yield *Queue.bounded<GenInner>(100)
    const OuterQueue = yield *Queue.bounded<GenOuter>(100)

    function enterInner(inner:GenInner) {
      return Effect.gen(function*() {
        return yield *Queue.offer(InnerQueue, inner)
      })
    }

    function execGeneratorLoop() {
      console.log('start execGeneratorLoop');
      return Effect.loop(true,{
        while:a => a,
        body:b => Effect.gen(function*() {
          console.log('gen in queue wait');
          const inner = yield* Queue.take<GenInner>(InnerQueue)
          console.log('genLoop gen in:',inner);
          if (inner.genNum >= MaxGen*2) {
            return  //  func の無限ループを防ぐ
          }
          //  Generator処理
          const avatarState = yield *AvatarService.getAvatarState(inner.avatarId);
          const sysConfig = yield *ConfigService.getSysConfig()
          // const gen = (yield *ConfigService.makeGenerator(inner.toGenerator, sysConfig)) //  settings?: ContextGeneratorSetting // TODO 統合したらすべて合わせる
          const gen = yield *OllamaTextGenerator.make({model:'llama3.1',host:'http://192.168.11.121:11434'})
          const res = yield *gen.generateContext(inner,avatarState) // 処理するコンテキスト、prevとして抽出適用するコンテキストの設定、
          yield *avatarState.appendContextGenIn(inner)  //  innerをcontextに追加するのは生成後、そのまえで付けるとprevに入ってしまう。
          yield *avatarState.appendContextGenOut(res)
          //  TODO 単純テキストをコンソールに出力するのはcontext処理内なのか、io処理内なのか
          console.log('genLoop gen out:',res);
          const io = res.filter(a => a.toolCallParam).map(b => ({
            ...b,
            genNum: inner.genNum + 1,
          }))
          yield *Queue.offerAll(OuterQueue, io);
        }),
        step:b => b,
        discard:true
      })
    }

    function execExternalLoop() {
      console.log('start execExternalLoop');
      return Effect.loop(true,{
        while:a => a,
        body:b => Effect.gen(function*() {
          console.log('IO in queue wait');
          const outer = yield* Queue.take(OuterQueue)
          console.log('IO loop mcp in:',outer);
          //  MCP処理
          const res = yield *solveMcp([outer])
          const r = res.flat()
          console.log('IO loop mcp out:',JSON.stringify(r));
          if (r.length > 0) {
            yield *Queue.offer(InnerQueue, {
              avatarId:outer.avatarId,
              toGenerator:outer.fromGenerator,
              toolCallRes: r,
              genNum: outer.genNum+1
            });
          }
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
              console.log('call:',value1);
              return McpService.callFunction(avatarState, value1).pipe(Effect.catchIf(a => a instanceof Error,e => {
                return Effect.succeed({
                  toLlm: {content: [{type: 'text', text: e.message}]}, call_id: value.innerId, status: 'ok',
                })
              }),
                Effect.andThen(a => {
                  return {
                    name: value1.name,
                    callId: a.call_id,
                    results: a.toLlm as z.infer<typeof CallToolResultSchema>
                  }
                }));
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

    yield *Effect.forkDaemon(execGeneratorLoop())
    yield *Effect.forkDaemon(execExternalLoop())

    return {
      enterInner,
    }
  }),
  dependencies: [AvatarServiceLive,ConfigServiceLive,DocServiceLive,McpServiceLive,MediaServiceLive],

}) {}

export const GeneratorServiceLive = GeneratorService.Default;
