import {Effect} from 'effect';
// import {AvatarState} from './AvatarState.js';
// import dayjs from 'dayjs';
import {McpConfig, McpToolInfo} from '../../common/Def.js';
// import short from 'short-uuid';
// import {GeneratorProvider} from '../../common/DefGenerators.js';
// import {DocService} from './DocService.js';
// import {McpService} from './McpService.js';
// import {MediaService} from './MediaService.js';
// import {ConfigService} from './ConfigService.js';


// interface BuildInMcpDef {
//   def: McpToolInfo,
//   func: (args: any) => Effect.Effect<any, any, any>
// }

export const EchoSchedulerId = 'echoScheduler';  //  他のMCPと重ならないユニーク名

export const setTaskWhenIdling = {
  def: {
    name: 'set_task_when_idling', //
    description: 'Set what to do when idle time is reached',
    inputSchema: {
      type: 'object',
      properties: {
        instructions: {
          type: 'string',
          description: 'Instructions to do',
        },
        minutesToDetectIdling: {
          type: 'integer',
          description: 'Number of minutes to detect idling, default number of minutes if not specified.',
        },
        // useContent: {
        //   type: 'string', //  TODO
        //   description: '',
        //   enum: ["text", "image"],
        // },
        // media: {
        //   type: 'string', //  TODO
        //   description: '',
        //   enum: ["none", "image"],
        // },
      },
      required: ['instructions'],
    },
  },
  /*
        func: (state: AvatarState, args: any,callGenerator:GeneratorProvider) => {
          //  ここはllmからタイマータスクへの設定指示 タイマー実行はAvatarStateなど 指示内容はここの文章
          console.log('echoIdle:',args,state,callGenerator);
          const inst = args.instructions;
          if (!inst) {
            return Effect.succeed({content: [{type: 'text', text: 'fail to set the instruction'}]});
          }
          const duringMin = Number.parseFloat(args.minutesToDetectIdling) || undefined;
          return state.addOnceEcho({
            id: short.generate(),
            name: `echoIdle${dayjs().valueOf()}`, //  ユニーク名を決めてよいな
            isEnabled: true,
            trigger:{
              triggerType:'TalkAfterMin',
              condition:{
                min:duringMin
              }
            },
            exec:{
              generator: callGenerator || 'emptyText',  //  TODO ここのデフォルトtext generatorは何にすべきか
              templateGeneratePrompt:inst,
              addDaemonGenToContext:true,
              setting:{
                toClass: 'daemon',
                toRole: 'assistant',
              }
            }
            // // isOnetime: true,
            // prompt: inst,
            // duringMin: duringMin,
            // generateMedia: (args.media || 'none') as GenerateMedia,
            // useContent: (args.useContent || 'text') as UseContent
          }).pipe(
            Effect.andThen(a => Effect.succeed({content: [{type: 'text', text: 'set the instruction'}]})),
            Effect.catchAll(e => Effect.succeed({content: [{type: 'text', text: `fail to set the instruction. reason: ${e.message}`}]}))
            );
        },
  */
};
export const setTaskAfterMinutes = {
  def: {
    name: 'set_task_after_minutes',
    description: 'Set a task to be performed after a certain time',
    inputSchema: {
      type: 'object',
      properties: {
        instructions: {
          type: 'string',
          description: 'Instructions to do',
        },
        minutes: {
          type: 'integer',
          description: 'Minutes till run',
        },
        useContent: {
          type: 'string', //  TODO
          description: '',
          enum: ["text", "image"],
        },
        media: {
          type: 'string', //  TODO
          description: '',
          enum: ["none", "image"],
        },
      },
      required: ['instructions', 'minutes'],
    },
  },
  /*
        func: (state: AvatarState, args: any,callGenerator:GeneratorProvider) => {
          //  ここはllmからタイマータスクへの設定指示 タイマー実行はAvatarStateなど 指示内容はここの文章
          //  todo ここのすることはスタートアップタスクのプロンプト等を検証してoneTimeとしてavatarConfigに書き込むこと
          console.log('echoMin:',args,state,callGenerator);
          const inst = args.instructions;
          if (!inst) {
            return Effect.succeed({content: [{type: 'text', text: 'fail to set the instruction. no instructions'}]});
          }
          const min = Number.parseFloat(args.minutes);
          if (Number.isNaN(min)) {
            return Effect.succeed({content: [{type: 'text', text: 'fail to set the instruction. minutes not set.'}]});
          }
          return state.addOnceEcho({
            id:short.generate(),
            name: `echoIdle${dayjs().valueOf()}`, //  ユニーク名を決めてよいな
            isEnabled: true,
            trigger:{
              triggerType:'TimerMin',
              condition:{
                min:min
              }
            },
            exec:{
              generator: callGenerator || 'emptyText',  //  TODO ここのデフォルトtext generatorは何にすべきか
              templateGeneratePrompt:inst,
              addDaemonGenToContext:true,
              setting:{
                toClass: 'daemon',
                toRole: 'assistant',
              }
            }
            // prompt: inst,
            // minInDate: dayjs().startOf('date').add(min,'minutes').format('HH:mm:ss'),
            // generateMedia: (args.media || 'none') as GenerateMedia,
            // useContent: (args.useContent || 'text') as UseContent
          }).pipe(
            Effect.andThen(a => Effect.succeed({content: [{type: 'text', text: 'set the instruction'}]})),
            Effect.catchAll(e => Effect.succeed({content: [{type: 'text', text: `fail to set the instruction. reason: ${e.message}`}]}))
          );
        },
  */
};

export const buildInMcpList = [
  setTaskWhenIdling,
  setTaskAfterMinutes,
];

export class BuildInMcpService extends Effect.Service<BuildInMcpService>()('avatar-shell/BuildInMcpService', {
  accessors: true,
  effect: Effect.gen(function* () {
    // const setTaskWhenStartupTool = { //  現状揮発とするのでstartupはない
    //   def: {
    //     name: "set_task_when_startup",
    //     description: "Set what to do when avatar start up",
    //     inputSchema: {
    //       type: "object",
    //       properties: {
    //         instructions: {
    //           type: "string",
    //           description: "Instructions to do"
    //         },
    //       },
    //       required: ["instructions"]
    //
    //     }
    //   },
    //   func:(args:any) => {
    //     //  ここはllmからタイマータスクへの設定指示 タイマー実行はAvatarStateなど 指示内容はここの文章
    //     //  todo ここのすることはスタートアップタスクのプロンプト等を検証してoneTimeとしてavatarConfigに書き込むこと
    //     return Effect.succeed({content:[{type:'text',text:'set the instruction'}]}) //  todo 仮
    //   }
    // };

    // let targetGenerator:GeneratorProvider = 'emptyText'
    // const callToolEffect = (params: {
    //   state: AvatarState,
    //   name: string,
    //   arguments: any
    // }): Effect.Effect<{content: {type: string, text: string}[]}, Error, ConfigService | DocService | McpService | MediaService> => {
    //   return callToolImpl(params,targetGenerator)
    // };
    // //  TODO ちょっときたないが。。
    // const setGenerator = (callGenerator:GeneratorProvider) => {
    //   targetGenerator = callGenerator
    // }

    function getDefines() {

      const echoScheduler:McpConfig = {
        id: EchoSchedulerId,
        notice:'注意: Echo Scheduler組み込みMCPは強力ですがセキュリティと動作安全性の上でリスクがあります。リスクを判断の上、使用するか判断してください。',
        client: {
          connect: () => {
          },
          getServerCapabilities: () => {
            return {
              tools: {},
            };
          },
          listTools: async () => {
          },
          listPrompts: async () => {
          },
          listResources: async () => {
          },
          // setGenerator: setGenerator,
        },
        tools: [
          // setTaskWhenStartupTool.def,
          setTaskWhenIdling.def,
          setTaskAfterMinutes.def,
        ] as McpToolInfo[],
        prompts: [],
        resources: [],
        buildIn:true,
      };
      return [echoScheduler];
    }

/*
    function callBuildInTool(id:string,params: {
      state:AvatarState,
      name: string,
      arguments: any
    },callGenerator:GeneratorProvider) {
      console.log('callBuildInTool:',params,callGenerator);
      const find = buildInMcpList.find(value => value.def.name === params.name);
      let a
      if (find && find.func) {
        return find.func(params.state, params.arguments,callGenerator);
      }
      return Effect.fail(new Error('function unknown'))
      // return Effect.succeed({
      //   content: [{
      //     type: 'text',
      //     text: 'function unknown',
      //   }],  //  TODO エラーで上げたほうがよいか?
      // });
    }
*/


    return {
      getDefines,
      //callBuildInTool
    };
  }),
}) {
}

export const BuildInMcpServiceLive = BuildInMcpService.Default;
