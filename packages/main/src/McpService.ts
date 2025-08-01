import {Effect, SynchronizedRef} from 'effect';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  AlertTask,
  AvatarMcpSettingList,
  AvatarMcpSettingMutable,
  DaemonTrigger,
  McpConfigList,
  type McpEnable,
  McpInfo,
  McpServerDef,
  SysConfig,
} from '../../common/Def.js';
import {ConfigService} from './ConfigService.js';
import {
  BuildInMcpService,
  BuildInMcpServiceLive,
  setTaskAfterMinutes,
  setTaskWhenIdling,
} from './BuildInMcpService.js';
import {AvatarState} from './AvatarState.js';
import short from 'short-uuid';
import {BrowserWindow} from 'electron';
import {GeneratorProvider} from '../../common/DefGenerators.js';
import dayjs from 'dayjs';
import {ReadResourceResult} from '@modelcontextprotocol/sdk/types.js';
// import electronLog from 'electron-log';


export interface ToolCallParam {
  id: string,
  name: string,
  input: any,
}


export class McpService extends Effect.Service<McpService>()('avatar-shell/McpService', {
  accessors: true,
  effect: Effect.gen(function* () {
    let clientInfoList: McpConfigList = [];  //  client:Client,,prompts:McpPromptInfo[],resources:McpResourceInfo[]
    const latchSet = yield* SynchronizedRef.make<Map<string, {answer: string, latch: Effect.Latch}>>(new Map<string, {
      answer: string,
      latch: Effect.Latch
    }>());

/*
    function updateSysConfig(sys: SysConfig) {
      return reset(sys).pipe(Effect.catchAll(cause => {
        console.log('mcp error', cause);
        dialog.showErrorBox('MCP 初期化エラー', String(`${cause.message}`));
        return Effect.void;
      }));
    }
*/

    function reset(sysConfig: SysConfig) {
      console.log('McpService reset:');
      //  mcp定義からtransportを作って、clientを作って、初期プラグイン等をロードする
      //  avatar-sightが使う組み込みサーバーもここで定義する
      return Effect.gen(function* () {
        // const sysConfig = yield* ConfigService.getSysConfig();
        clientInfoList = yield* Effect.forEach(Object.entries(sysConfig.mcpServers), a1 => {
          return Effect.gen(function* () {
            const client = new Client(
              {
                name: 'avatar-shell-client',
                version: '1.0.0',
              },
            );
            const transport = new StdioClientTransport(a1[1] as McpServerDef);
            yield* Effect.tryPromise({
              try: () => client.connect(transport),
              catch: error => new Error(`MCP ${a1[0]}.connect:\n${error}`),
            });
            const capabilities = client.getServerCapabilities();
            const tools = (capabilities?.tools ? yield* Effect.tryPromise({
              try: () => client.listTools(),
              catch: error => new Error(`MCP ${a1[0]}.tools: ${error}`),
            }) : {tools: []});
            const prompts = capabilities?.prompts ? yield* Effect.tryPromise({
              try: () => client.listPrompts(),
              catch: error => new Error(`MCP ${a1[0]}.prompts: ${error}`),
            }) : {prompts: []};
            const resources = capabilities?.resources ? yield* Effect.tryPromise({
              try: () => client.listResources(),
              catch: error => new Error(`MCP ${a1[0]}.resources: ${error}`),
            }) : {resources: []};

            return {
              id: a1[0],
              client,
              tools: tools.tools,
              prompts: prompts.prompts,
              resources: resources.resources,
              buildIn: false,
            };  //  client,,prompts:prompts.prompts,resources:resources.resources,tools:tools.tools,prompts:prompts.prompts,
          });
        });
        const buildInList = yield* BuildInMcpService.getDefines();
        clientInfoList.push(...buildInList);
        // console.log('mcpinfo', clientInfoList);
      });
    }

/*
    function initial() {
      return Effect.gen(function* () {
        const sysConfig = yield* ConfigService.getSysConfigPub();
        yield* sysConfig.pipe(SubscriptionRef.get, Effect.andThen(a => updateSysConfig(a)));
        yield* Effect.forkDaemon(sysConfig.changes.pipe(Stream.runForEach(a => {
          console.log('McpService sys change:');
          return updateSysConfig(a);
        })));
      });
    }
*/

    function getMcpServerInfos() {
      return clientInfoList.map(v => {
        return {
          id: v.id,
          notice: v.notice,
          tools: v.tools,
          resources: v.resources,
          prompts: v.prompts,
        } as McpInfo;
      });
    }

    function readMcpResource(name: string, uri: string) {
      return Effect.gen(function* () {
        const info = clientInfoList.find(v => v.id === name);
        if (info) {
          return yield* Effect.tryPromise({
            try: () => info.client.readResource({uri}),
            catch: error => console.log(error),
          }).pipe(
            Effect.tap(a => console.log(a)),
          Effect.andThen(a => a as ReadResourceResult)) //  TODO {contents: {uri:string,mimeType:string,text:string}[]})
        }
      });
    }
    /*
    {
  contents: [
    {
      uri: 'file:///roleWithSns.txt',
      mimeType: 'text/plain',
      text: 'Please speak to the user frankly in 2 lines or fewer. Since you are close, please omit honorifics.\n' +

     */

    function getToolDefs(mcpList: AvatarMcpSettingList) {
      //  このあたりはopenAiもanthropicも同様書式のはず
      return Object.entries(mcpList).flatMap(a => {
        const find = clientInfoList.find(c => c.id === a[0]);
        if (find) {
          if (!a[1].enable) {
            return [];
          }
          return Object.entries(a[1].useTools).flatMap(d => {
            if (d[1].enable) {
              const f = find.tools.find(e => e.name === d[0]);
              if (f) {
                //  ツールの個別関数が使えることが確定
                //  プラグインの定義名を足す必要がある
                return [
                  {
                    ...f,
                    name: `${find.id}_${f.name}`,
                  },
                ];
              }
            }
            return [];
          });
        }
        return [];
      });

    }

    function updateAvatarMcpSetting(templateId: string) {
      return Effect.gen(function* () {
        const config = yield* ConfigService.getAvatarConfig(templateId);
        const mcpServers = getMcpServerInfos();
        const generatorList = [''].concat(yield* ConfigService.getGeneratorList());
        const mcps: Record<string, AvatarMcpSettingMutable> = {};
        mcpServers.forEach(value => {
          const useTools: Record<string, {enable: boolean, allow: McpEnable}> = {};
          value.tools.map(tool => {
            useTools[tool.name] = {
              enable: true,
              allow: 'ask',
              // info: tool,
            };
          });
          mcps[value.id] = {
            enable: config.mcp[value.id]?.enable === undefined ? true : config.mcp[value.id]?.enable,
            notice: value.notice,
            useTools: {
              ...useTools,
              ...config.mcp[value.id]?.useTools,
            },
          };
        });
        return deepMerge(mcps, config.mcp as Record<string, AvatarMcpSettingMutable>);
      }).pipe(Effect.catchAll(e => Effect.fail(new Error(e.message))));
    }

    function deepMerge<T extends object, U extends object>(target: T, source: U): T & U {
      const output = {...target} as T & U;

      for (const key in source) {
        const sourceValue = source[key];
        const targetValue = (target as any)[key];

        if (
          typeof sourceValue === 'object' &&
          sourceValue !== null &&
          !Array.isArray(sourceValue) &&
          typeof targetValue === 'object' &&
          targetValue !== null &&
          !Array.isArray(targetValue)
        ) {
          output[key] = deepMerge(targetValue, sourceValue);
        } else {
          output[key] = sourceValue as any;
        }
      }

      return output;
    }


    function callFunction(state: AvatarState, params: ToolCallParam, callGenerator: GeneratorProvider) {
      return Effect.gen(function* () {
        const names = params.name.split('_');  //  TODO 区切り文字を_にするなら プラグ名に_が含まれないようにする必要がある
        if (names.length < 2) return yield* Effect.fail(new Error('function name not found1'));
        const toolName = names.shift();
        if (!toolName) return yield* Effect.fail(new Error('function name not found2'));
        const funcName = names.join('_');
        const find = clientInfoList.find(p => p.id === toolName);
        if (!find) return yield* Effect.fail(new Error('function name not found3'));
        const find1 = find.tools.find(f => f.name === funcName);
        if (!find1) return yield* Effect.fail(new Error('function name not found4'));
        //  このfunctionに実行許可があるか確認する askの場合問い合わせさせる
        const element = state.Config.mcp[toolName];
        if (!element) return yield* Effect.fail(new Error('function name not found5'));
        if (!element.enable) {
          return yield* Effect.fail(new Error(`${toolName} disabled`));
        }
        if (!element.useTools[find1.name]) return yield* Effect.fail(new Error('function name not found6'));
        if (!element.useTools[find1.name].enable) return yield* Effect.fail(new Error(`${find1.name} disabled`));
        const allow = element.useTools[find1.name].allow;
        if (allow === 'no') return yield* Effect.fail(new Error(`${find1.name} set no use`));
        if (allow === 'ask') {
          //  TODO 困らない形での実行確認アラートを出す
          const ans = yield* mainAlert(state.BrowserWindow, `Can I use tool '${toolName}_${find1.name}'s?`, ['deny', 'accept']);  //  TODO accept onceとaccept sessionがあったほうがよい
          console.log('ans:', ans);
          if (!ans || ans === 'deny') {
            return yield* Effect.fail(new Error(`${find1.name} not run`));
            //  TODO accept in sessionがまだ
          }
        }
        if (find.buildIn) {
          //  ビルドインの場合、id情報から直接BuildInMcpServiceを呼ぶ
          console.log(find);
          const res = callBuildInTool(find.id, {
            name: find1.name,
            arguments: params.input,
            state,
          }, callGenerator);
          /*
                        find.client.setGenerator(callGenerator)
                        //  TODO きれいじゃない。。
                        // const res: {content: {type: string, text: string}[]} = {content: [{type: 'a', text: 'b'}]}
                        const res: {content: {type: string, text: string}[]} = yield *(find.client.callToolEffect({
                          name: find1.name,
                          arguments: params.input,
                          state,
                        }) as Effect.Effect<{content: {type: string, text: string}[]}, Error, ConfigService | DocService | McpService | MediaService>)
          */
          console.log(res);
          return {
            toLlm: res, call_id: params.id, status: 'ok',
          };
        } else {
          // console.log('before func call:', find1.name, params.input);
          // let res: {content: {type: string, text: string}[]} = {content: []}
          const res = yield* Effect.tryPromise({
            try: () => (find.client as Client).callTool({
              name: find1.name,
              arguments: params.input,
            }, undefined, {timeout: 120 * 1000}),
            catch: error => {
              console.log('mcp error:', error);
              return new Error(`MCP error:${error}`);
            },
          });
          return {
            toLlm: res, call_id: params.id, status: 'ok',
          };
        }
      }).pipe(Effect.andThen(a => a),
        Effect.catchAll(e => Effect.fail(new Error(`${e}`)))); // as Effect.Effect<{toLlm: {content: {type: string, text: string}[]}, call_id: string, status: string}, Error, ConfigService | DocService | McpService | MediaService>;
    }

    function mainAlert(window: BrowserWindow, message: string, select: string[] | undefined = undefined) {
      return Effect.gen(function* () {
        if (window) {
          const latch = yield* Effect.makeLatch();
          const id = short().generate();
          const task: AlertTask = {
            id: id,
            replyTo: 'mcpSelect',
            message,
            select,
          };
          yield* SynchronizedRef.update(latchSet, a => a.set(id, {answer: '', latch: latch}));
          window.webContents.send('mainAlert', task);
          yield* latch.await;  //  fiber停止
          console.log('rerun');
          let ans = '';
          yield* SynchronizedRef.update(latchSet, a => {
            const latch = a.get(id);
            if (latch) {
              ans = latch.answer;
            }
            a.delete(id);
            return a;
          });
          console.log('ans:', ans);
          return ans;
        }
      });
    }

    function callBuildInTool(id: string, params: {
      state: AvatarState,
      name: string,
      arguments: any
    }, callGenerator: GeneratorProvider) {
      console.log('callBuildInTool:', params, callGenerator);
      switch (params.name) {

        case setTaskWhenIdling.def.name:
          return buildInCall(params.state, params.arguments, callGenerator, 'TalkAfterMin');
        case setTaskAfterMinutes.def.name:
          return buildInCall(params.state, params.arguments, callGenerator, 'TimerMin');
      }
      // const find = buildInMcpList.find(value => value.def.name === params.name);
      // let a
      // if (find && find.func) {
      //   return find.func(params.state, params.arguments,callGenerator);
      // }
      return Effect.fail(new Error('function unknown'));
      // return Effect.succeed({
      //   content: [{
      //     type: 'text',
      //     text: 'function unknown',
      //   }],  //  TODO エラーで上げたほうがよいか?
      // });
    }

    function buildInCall(state: AvatarState, args: any, callGenerator: GeneratorProvider, trigger: DaemonTrigger) {
      //  ここはllmからタイマータスクへの設定指示 タイマー実行はAvatarStateなど 指示内容はここの文章
      //  todo ここのすることはスタートアップタスクのプロンプト等を検証してoneTimeとしてavatarConfigに書き込むこと
      console.log('echoMin:', args, state, callGenerator);
      const inst = args.instructions;
      if (!inst) {
        return Effect.succeed({content: [{type: 'text', text: 'fail to set the instruction. no instructions'}]});
      }
      const min = Number.parseFloat(args.minutes);
      if (Number.isNaN(min)) {
        return Effect.succeed({content: [{type: 'text', text: 'fail to set the instruction. minutes not set.'}]});
      }
      return state.addOnceEcho({
        id: short.generate(),
        name: `echoIdle${dayjs().valueOf()}`, //  ユニーク名を決めてよいな
        isEnabled: true,
        trigger: {
          triggerType: 'TimerMin',
          condition: {
            min: min,
          },
        },
        exec: {
          generator: callGenerator || 'emptyText',  //  TODO ここのデフォルトtext generatorは何にすべきか
          templateGeneratePrompt: inst,
          addDaemonGenToContext: true,
          setting: {
            toClass: 'daemon',
            toRole: 'bot',
          },
        },
        // prompt: inst,
        // minInDate: dayjs().startOf('date').add(min,'minutes').format('HH:mm:ss'),
        // generateMedia: (args.media || 'none') as GenerateMedia,
        // useContent: (args.useContent || 'text') as UseContent
      }).pipe(
        Effect.andThen(a => Effect.succeed({content: [{type: 'text', text: 'set the instruction'}]})),
        Effect.catchAll(e => Effect.succeed({
          content: [{
            type: 'text',
            text: `fail to set the instruction. reason: ${e.message}`,
          }],
        })),
      );
    }

    // func: (state: AvatarState, args: any,callGenerator:GeneratorProvider) => {
    //   //  ここはllmからタイマータスクへの設定指示 タイマー実行はAvatarStateなど 指示内容はここの文章
    //   console.log('echoIdle:',args,state,callGenerator);
    //   const inst = args.instructions;
    //   if (!inst) {
    //     return Effect.succeed({content: [{type: 'text', text: 'fail to set the instruction'}]});
    //   }
    //   const duringMin = Number.parseFloat(args.minutesToDetectIdling) || undefined;
    //   return state.addOnceEcho({
    //     id: short.generate(),
    //     name: `echoIdle${dayjs().valueOf()}`, //  ユニーク名を決めてよいな
    //     isEnabled: true,
    //     trigger:{
    //       triggerType:'TalkAfterMin',
    //       condition:{
    //         min:duringMin
    //       }
    //     },
    //     exec:{
    //       generator: callGenerator || 'emptyText',  //  TODO ここのデフォルトtext generatorは何にすべきか
    //       templateGeneratePrompt:inst,
    //       addDaemonGenToContext:true,
    //       setting:{
    //         toClass: 'daemon',
    //         toRole: 'bot',
    //       }
    //     }
    //     // // isOnetime: true,
    //     // prompt: inst,
    //     // duringMin: duringMin,
    //     // generateMedia: (args.media || 'none') as GenerateMedia,
    //     // useContent: (args.useContent || 'text') as UseContent
    //   }).pipe(
    //     Effect.andThen(a => Effect.succeed({content: [{type: 'text', text: 'set the instruction'}]})),
    //     Effect.catchAll(e => Effect.succeed({content: [{type: 'text', text: `fail to set the instruction. reason: ${e.message}`}]}))
    //   );
    // },


    function answerMcpAlert(id: string, btn: string) {
      return SynchronizedRef.updateAndGetEffect(latchSet, a => {
        return Effect.gen(function* () {
          const latch = a.get(id);
          if (!latch) {
            return yield* Effect.fail(new Error('no latch'));
          }
          latch.answer = btn;
          a.set(id, latch);
          return a;
        });
      }).pipe(Effect.andThen(a => {
        const b = a.get(id);
        if (!b) {
          return Effect.fail(new Error('fail latch'));
        }
        return b.latch.open;
      }));
    }

    return {
      // initial,
      reset,
      getMcpServerInfos,
      readMcpResource,
      getToolDefs,
      updateAvatarMcpSetting,
      callFunction,
      answerMcpAlert,
    };
  }),
  dependencies: [BuildInMcpServiceLive],
}) {
}

export const McpServiceLive = McpService.Default;
