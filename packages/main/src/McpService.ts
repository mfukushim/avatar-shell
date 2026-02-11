/*! avatar-shell | Apache-2.0 License | https://github.com/mfukushim/avatar-shell */
import {Effect, Schema, SynchronizedRef, Option} from 'effect';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  AlertTask, AvatarMcpSetting,
  AvatarMcpSettingList,
  AvatarSetting,
  DaemonTrigger,
  McpConfigList,
  type McpEnable,
  McpInfo, McpStdioServerDef, McpStreamHttpServerDef,
  SysConfig, ToolCallParam,
} from '../../common/Def.js';
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
import {
  type ClientCapabilitiesWithExtensions,
  UI_EXTENSION_CAPABILITIES,
} from '@mcp-ui/client'



export class McpService extends Effect.Service<McpService>()('avatar-shell/McpService', {
  accessors: true,
  effect: Effect.gen(function* () {
    let serverInfoList: McpConfigList = [];
    const latchSet = yield* SynchronizedRef.make<Map<string, {answer: string, latch: Effect.Latch}>>(new Map<string, {
      answer: string,
      latch: Effect.Latch
    }>());

    function reset(sysConfig: SysConfig) {
      return Effect.gen(function* () {
        const servers = Object.entries(sysConfig.mcpServers).filter(value => value[1].enable).map(value => {
          return {
            name: value[0],
            def: value[1].def
          }
        })
        serverInfoList = yield *Effect.validateAll(servers, a1 => {
          return Effect.gen(function* () {
            const clientCapabilities: ClientCapabilitiesWithExtensions = {
              roots: { listChanged: true },
              extensions: UI_EXTENSION_CAPABILITIES,
            };
            const client = new Client(
              {
                name: 'avatar-shell-client',
                version: '1.0.0',
              },{ capabilities:clientCapabilities }
            );
            const stdio = Schema.decodeUnknownOption(McpStdioServerDef)(a1.def)
            const streamHttp = Schema.decodeUnknownOption(McpStreamHttpServerDef)(a1.def)
            const transport = Option.isSome(stdio) ? new StdioClientTransport(stdio.value): Option.isSome(streamHttp) ? new StreamableHTTPClientTransport(new URL(streamHttp.value.url)):undefined
            // const transport = a1[1].kind === 'stdio' ? new StdioClientTransport(a1[1]): a1[1].kind === 'streamHttp' ? new StreamableHTTPClientTransport(new URL(a1[1].url)):undefined
            if (!transport) {
              console.log('mcp def:',a1.def,stdio);
              return yield *Effect.fail(new Error('MCP define error'))
            }
            yield* Effect.tryPromise({
              try: () => client.connect(transport),
              catch: error => new Error(`MCP ${a1.def}.connect:\n${error}`),
            });
            const capabilities = client.getServerCapabilities();
            const tools = (capabilities?.tools ? yield* Effect.tryPromise({
              try: () => client.listTools(),
              catch: error => new Error(`MCP ${a1.def}.tools: ${error}`),
            }) : {tools: []});
            const prompts = capabilities?.prompts ? yield* Effect.tryPromise({
              try: () => client.listPrompts(),
              catch: error => new Error(`MCP ${a1.def}.prompts: ${error}`),
            }) : {prompts: []};
            const resources = capabilities?.resources ? yield* Effect.tryPromise({
              try: () => client.listResources(),
              catch: error => new Error(`MCP ${a1.def}.resources: ${error}`),
            }) : {resources: []};

            return {
              id: a1.name,
              client,
              tools: tools.tools,
              prompts: prompts.prompts,
              resources: resources.resources,
              buildIn: false,
            };
          });
        })
        const buildInList = yield* BuildInMcpService.getDefines();
        serverInfoList.push(...buildInList);
      });
    }

    function getMcpServerInfos() {
      return serverInfoList.map(v => {
        return {
          id: v.id,
          notice: v.notice,
          tools: v.tools,
          resources: v.resources,
          prompts: v.prompts,
        } as McpInfo;
      });
    }

    function getServerInfo(name: string) {
      return serverInfoList.find(v => v.id === name);
    }

    function readMcpResource(name: string, uri: string) { //:Effect.Effect<ReadResourceResult,Error>
      const info = getServerInfo(name)
      if (info) {
        return Effect.tryPromise({
          try: () => info.client.readResource({uri}),
          catch: error => new Error(`MCP resource read error:${error}`),
        }).pipe(Effect.andThen(a => a as ReadResourceResult)); //  TODO ReadResourceResult {contents: {uri:string,mimeType:string,text:string}[]})
      }
      return Effect.fail(new Error(`MCP resource not found ${name} ${uri}`));
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
      const definedServers = serverInfoList.filter(v => Object.keys(mcpList).includes(v.id))
      const undefinedServers = serverInfoList.filter(v => !Object.keys(mcpList).includes(v.id))
      const updateDefServers = Object.entries(mcpList).flatMap(a => {
        const find = definedServers.find(v => v.id === a[0]);
        if (find) {
          if (!a[1].enable) {
            return [];
          }
          const defTools = Object.entries(a[1].useTools).flatMap(d => {
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
          const newTools = find.tools.filter(v => !Object.keys(a[1].useTools).includes(v.name))
          const addTools = newTools.map(v => {
            return {
              ...v,
              name: `${find.id}_${v.name}`
            }
          })
          return defTools.concat(addTools)
        }
        return [];
      });
      const undefFunctions = undefinedServers.flatMap(s => {
        return s.tools.map(t => {
          return {
            ...t,
            name: `${s.id}_${t.name}`
          }
        })
      })
      return updateDefServers.concat(undefFunctions)
      //  このあたりはopenAiもanthropicも同様書式のはず
/*
      return Object.entries(mcpList).flatMap(a => {
        const find = getServerInfo(a[0]);
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
*/

    }

    function updateAvatarMcpSetting(configMcp: AvatarSetting) {
      const mcpServers = getMcpServerInfos();
      const mcps: Record<string, AvatarMcpSetting> = {};
      mcpServers.forEach(value => {
        const useTools: Record<string, {enable: boolean, allow: McpEnable;}> = {};
        value.tools.map(tool => {
          useTools[tool.name] = {
            enable: true,
            allow: 'ask',
          };
        });
        mcps[value.id] = {
          enable: configMcp.mcp[value.id]?.enable === undefined ? false: configMcp.mcp[value.id]?.enable,
          notice: value.notice,
          useTools: {
            ...useTools,
            ...configMcp.mcp[value.id]?.useTools,
          },
        };
      });
      return Effect.succeed({
        ...configMcp,
        mcp: deepMerge(mcps, configMcp.mcp) as Record<string, AvatarMcpSetting>,
      } as AvatarSetting);
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


    function callFunction(state: AvatarState, params: ToolCallParam, callGenerator?: GeneratorProvider) {
      return Effect.gen(function* () {
        const names = params.name.split('_');  //  TODO 区切り文字を_にするなら プラグ名に_が含まれないようにする必要がある
        if (names.length < 2) return yield* Effect.fail(new Error('function name not found1'));
        const toolName = names.shift();
        if (!toolName) return yield* Effect.fail(new Error('function name not found2'));
        const funcName = names.join('_');
        const serverInfo = getServerInfo(toolName);
        // const find = serverInfoList.find(p => p.id === toolName);
        if (!serverInfo) return yield* Effect.fail(new Error('function name not found3'));
        const toolInfo = serverInfo.tools.find(f => f.name === funcName);
        if (!toolInfo) return yield* Effect.fail(new Error(`function name not found4 ${funcName}`));
        //  このfunctionに実行許可があるか確認する askの場合問い合わせさせる
        const element = state.Config.mcp[toolName];
        if (!element) return yield* Effect.fail(new Error('function name not found5'));
        if (!element.enable) {
          return yield* Effect.fail(new Error(`${toolName} disabled`));
        }
        const useTool = element.useTools[toolInfo.name]
        if (!useTool) return yield* Effect.fail(new Error(`function name not found6:${toolInfo.name},${JSON.stringify(element.useTools)}`));
        if (!useTool.enable) return yield* Effect.fail(new Error(`${toolInfo.name} disabled`));
        const allow =useTool.allow;
        if (allow === 'no') return yield* Effect.fail(new Error(`${toolInfo.name} set no use`));
        if (allow === 'ask') {
          //  TODO 困らない形での実行確認アラートを出す
          const ans = state.BrowserWindow ? yield* mainAlert(state.BrowserWindow, `Can I use tool '${toolName}_${toolInfo.name}'s?`, ['deny', 'accept']): undefined;  //  TODO accept onceとaccept sessionがあったほうがよい
          if (!ans || ans === 'deny') {
            return yield* Effect.fail(new Error(`${toolInfo.name} is denied`));
            //  TODO accept in sessionがまだ
          }
        }
        if (serverInfo.buildIn && callGenerator) {
          //  ビルドインの場合、id情報から直接BuildInMcpServiceを呼ぶ
          const res = yield *callBuildInTool(serverInfo.id, {
            name: toolInfo.name,
            arguments: params.input,
            state,
          }, callGenerator);
          return {
            toLlm: res, call_id: params.callId, status: 'ok',
          };
        } else {
          //  TODO 呼び出すMCPが引数を持たないタイプの場合、例外的に入力引数をなしにする指定で許可する(LLMが引数を間違えることが多く、そもそもの定義に引数がない場合はなしで呼んでも支障がなさそうなので)
          const haveArgs = toolInfo.inputSchema.properties && Object.keys(toolInfo.inputSchema.properties).length > 0
          const res = yield* Effect.tryPromise({
            try: () => (serverInfo.client as Client).callTool({
              name: toolInfo.name,
              arguments: haveArgs ? params.input: {},
            }, undefined, {timeout: 120 * 1000}),
            catch: error => {
              console.log('mcp error:', error);
              return new Error(`MCP error:${error}`);
            },
          });
          //  定義に _meta.uiが含まれる場合、ここでuiリソースを取得して追加送付する
          let html:string|undefined
          let mediaUrl:string|undefined
          if(toolInfo?._meta?.ui?.resourceUri) {
            mediaUrl = toolInfo._meta.ui.resourceUri
            const res = yield* Effect.succeed(mediaUrl!).pipe(Effect.andThen(uri =>  (serverInfo.client as Client).readResource({
                uri: uri,
              }, {timeout: 120 * 1000})))
            // const res = yield* Effect.succeed(toolInfo._meta.ui.resourceUri as string).pipe(Effect.andThen(uri => Effect.tryPromise({
            //   try: () => (serverInfo.client as Client).readResource({
            //     uri: uri,
            //   }, {timeout: 120 * 1000}),
            //   catch: error => {
            //     console.log('mcp error:', error);
            //     return new Error(`MCP error:${error}`);
            //   },
            // })))
            // const res:ReadResourceResult = yield* Effect.tryPromise({
            //   try: () => (serverInfo.client as Client).readResource({
            //     uri: toolInfo?._meta?.ui?.resourceUri as string,
            //   }, {timeout: 120 * 1000}),
            //   catch: error => {
            //     console.log('mcp error:', error);
            //     return new Error(`MCP error:${error}`);
            //   },
            // });
            const find = res.contents.find(v => v.mimeType?.startsWith('text/html;profile=mcp-app'));
            if(find && find.mimeType)
              //  FIXME
              html = (find as any).text
          }
          return {
            toLlm: res, call_id: params.callId, status: 'ok',html,mediaUrl
          };
        }
      }).pipe(Effect.andThen(a => a),
        Effect.catchAll(e => Effect.fail(new Error(`${e}`))));
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
          // console.log('rerun');
          let ans = '';
          yield* SynchronizedRef.update(latchSet, a => {
            const latch = a.get(id);
            if (latch) {
              ans = latch.answer;
            }
            a.delete(id);
            return a;
          });
          return ans;
        }
      });
    }

    function callBuildInTool(id: string, params: {
      state: AvatarState,
      name: string,
      arguments: any
    }, callGenerator: GeneratorProvider) {
      switch (params.name) {

        case setTaskWhenIdling.def.name:
          return buildInCall(params.state, params.arguments, callGenerator, 'TalkAfterMin');
        case setTaskAfterMinutes.def.name:
          return buildInCall(params.state, params.arguments, callGenerator, 'TimerMin');
      }
      return Effect.fail(new Error('function unknown'));
    }

    function buildInCall(state: AvatarState, args: any, callGenerator: GeneratorProvider, trigger: DaemonTrigger) {
      //  ここはllmからタイマータスクへの設定指示 タイマー実行はAvatarStateなど 指示内容はここの文章
      //  todo ここのすることはスタートアップタスクのプロンプト等を検証してoneTimeとしてavatarConfigに書き込むこと
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
          // copyContext: false,
          setting: {
            toClass: 'daemon',
            toRole: 'bot',
          },
        },
      }).pipe(
        Effect.andThen(a => Effect.succeed({content: [{type: 'text', text: 'set the instruction'}]})),
        Effect.catchAll(e => Effect.succeed({
          content: [{
            type: 'text',
            text: `fail to set the instruction. reason: ${e}`,
          }],
        })),
      );
    }

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
