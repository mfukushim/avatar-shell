import {Effect} from 'effect';
import {McpConfig, McpToolInfo} from '../../common/Def.js';

export const EchoSchedulerId = 'echoDaemon';  //  他のMCPと重ならないユニーク名

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
      },
      required: ['instructions'],
    },
  },
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
};

export const buildInMcpList = [
  setTaskWhenIdling,
  setTaskAfterMinutes,
];

export class BuildInMcpService extends Effect.Service<BuildInMcpService>()('avatar-shell/BuildInMcpService', {
  accessors: true,
  effect: Effect.gen(function* () {

    function getDefines() {

      const echoDaemon:McpConfig = {
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
      return [echoDaemon];
    }

    return {
      getDefines,
    };
  }),
}) {
}

export const BuildInMcpServiceLive = BuildInMcpService.Default;
