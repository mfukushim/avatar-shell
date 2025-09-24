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




export class McpService extends Effect.Service<McpService>()('avatar-shell/McpService', {
  accessors: true,
  effect: Effect.gen(function* () {
    let clientInfoList: McpConfigList = [];
    const latchSet = yield* SynchronizedRef.make<Map<string, {answer: string, latch: Effect.Latch}>>(new Map<string, {
      answer: string,
      latch: Effect.Latch
    }>());

    function reset(sysConfig: SysConfig) {
      return Effect.gen(function* () {
        clientInfoList = yield *Effect.validateAll(Object.entries(sysConfig.mcpServers), a1 => {
          return Effect.gen(function* () {
            const client = new Client(
              {
                name: 'avatar-shell-client',
                version: '1.0.0',
              },
            );
            const stdio = Schema.decodeUnknownOption(McpStdioServerDef)(a1[1])
            const streamHttp = Schema.decodeUnknownOption(McpStreamHttpServerDef)(a1[1])
            const transport = Option.isSome(stdio) ? new StdioClientTransport(stdio.value): Option.isSome(streamHttp) ? new StreamableHTTPClientTransport(new URL(streamHttp.value.url)):undefined
            // const transport = a1[1].kind === 'stdio' ? new StdioClientTransport(a1[1]): a1[1].kind === 'streamHttp' ? new StreamableHTTPClientTransport(new URL(a1[1].url)):undefined
            if (!transport) {
              console.log('mcp def:',a1[1],stdio);
              return yield *Effect.fail(new Error('MCP define error'))
            }
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
            };
          });
        })
        const buildInList = yield* BuildInMcpService.getDefines();
        clientInfoList.push(...buildInList);
      });
    }

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

    function readMcpResource(name: string, uri: string) { //:Effect.Effect<ReadResourceResult,Error>
      const info = clientInfoList.find(v => v.id === name);
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
          const ans = state.BrowserWindow ? yield* mainAlert(state.BrowserWindow, `Can I use tool '${toolName}_${find1.name}'s?`, ['deny', 'accept']): undefined;  //  TODO accept onceとaccept sessionがあったほうがよい
          if (!ans || ans === 'deny') {
            return yield* Effect.fail(new Error(`${find1.name} is denied`));
            //  TODO accept in sessionがまだ
          }
        }
        if (find.buildIn && callGenerator) {
          //  ビルドインの場合、id情報から直接BuildInMcpServiceを呼ぶ
          const res = yield *callBuildInTool(find.id, {
            name: find1.name,
            arguments: params.input,
            state,
          }, callGenerator);
          return {
            toLlm: res, call_id: params.id, status: 'ok',
          };
        } else {
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
          directTrigger: false,
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
