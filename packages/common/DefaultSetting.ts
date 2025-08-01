import {
  AvatarSetting,
  type MutableSysConfig,
  type SysConfigMutable,
} from './Def.js';
import {type GeneratorsMutableConfigSet} from './DefGenerators.js';


export const defaultGenerators: GeneratorsMutableConfigSet = {
  openAiText: {apiKey: '', model: ''},
  openAiImage: {model: ''},
  openAiVoice: {model: '', voice: ''},
  anthropic: {apiKey: '', model: ''},
  gemini: {apiKey: '', model: ''},
  geminiImage: {model: ''},
  geminiVoice: {model: '', voice: ''},
  // voiceVox: {url: '', custom: {}},
  // openAiText: {apiKey: '', model: 'gpt-4.1-mini'},
  // openAiImage: {model: 'gpt-4.1-mini'},
  // openAiVoice: {model: 'gpt-4o-audio-preview', voice: 'alloy'},
  // anthropic: {apiKey: '', model: 'claude-3-7-sonnet-latest'},
  // gemini: {apiKey: '', model: ''},
  // geminiImage: {model: 'gemini-2.0-flash-preview-image-generation'},
  // geminiVoice: {model: 'gemini-2.5-flash-preview-tts', voice: 'Kore'},
  // voiceVox: {url: 'http://192.168.100.100:50021', custom: {}},
};

export const defaultSysSetting: SysConfigMutable = {
  defaultAvatarId: 'aa',
  generators: defaultGenerators,
  mcpServers: {},
  websocket: {
    useServer: true,
    serverPort: undefined,
    textTemplate: '{from} said, "{body}"',
    // autoSendTextNumber:3,
    // manualSend:false,
  },
  configVersion: 1
};


export const defaultAvatarSetting: {id: string, data: AvatarSetting}[] = [
  {
    id: 'aa',
    data: {
      templateId: 'aa',
      isTemporally: true,
      general: {
        name: 'Alice',
        // useLlm: 'emptyText',
        mainLlmSetting: {
          previousContextSize: 0,
          useContextType: ['text', 'image'],
        },
        useSocket: true,
        remoteServer: undefined,
        maxGeneratorUseCount: 40
      },
      mcp: {
        echoDaemon: {
          enable: false,
          notice: "注意: Echo Scheduler組み込みMCPは強力ですがセキュリティと動作安全性の上でリスクがあります。リスクを判断の上、使用するか判断してください。",
          useTools: {
            set_task_when_idling: {
              enable: true,
              allow: "ask"
            },
            set_task_after_minutes: {
              enable: true,
              allow: "ask"
            }
          }
        }

      },
      daemons: [],
      configVersion:1,
    } as AvatarSetting,
  }];

export const tutorialAvatarSetting: AvatarSetting =
  {
    templateId: 'aa',

    general: {
      name: 'Alice',
      // useLlm: 'geminiText',
      mainLlmSetting: {
        previousContextSize: 0,
        useContextType: ['text', 'image'],
      },
      useSocket: true,
      remoteServer: undefined,
      maxGeneratorUseCount: 40
    },
    mcp: {
    },
    daemons: [
      {
        'id': 'aaa',
        'name': 'mainLLM',
        'isEnabled': true,
        'trigger': {'triggerType': 'IfContextExists', 'condition': {
            asClass: 'talk',
            asRole: 'human',
          }},
        'exec': {
          generator: 'geminiText',
          addDaemonGenToContext: true,
          templateGeneratePrompt: '{body}',
          setting: {
            toClass: 'talk',
            toRole: 'bot',
            toContext: 'surface'
          },
        },
      },
      {
        id: 'aaab',
        name: 'StartupTalk',
        isEnabled: true,
        trigger: {'triggerType': 'Startup', condition: {}},
        exec: {
          generator: 'geminiText',
          addDaemonGenToContext: true,
          templateGeneratePrompt: 'Please write a friendly, short, one-line greeting.',
          setting: {
            toClass: 'talk',
            toRole: 'bot',
            toContext: 'surface'
          },
        },
      },
      {
        id: 'aaac',
        name: 'Voice',
        isEnabled: true,
        trigger: {
          triggerType: 'IfContextExists', condition: {
            asClass: 'talk',
            asRole: 'bot',
          },
        },
        exec: {
          generator: 'geminiVoice',
          templateGeneratePrompt: '{body}',
          addDaemonGenToContext: false,
          setting: {
            toClass: 'daemon',
            toRole: 'bot',
            toContext: 'outer'
          },
        },
      },
      {
        id: '77ndZPy3UXHkjot7wu7d4U',
        name: 'StartupPict',
        isEnabled: true,
        trigger: {'triggerType': 'Startup', condition: {}},
        exec: {
          generator: 'geminiImage',
          addDaemonGenToContext: false,
          templateGeneratePrompt: 'Generate a anime-style drawing of a girl saying hello',
          setting: {
            toClass: 'daemon',
            toRole: 'bot',
            toContext: 'outer'
          },
        },
      },
      {
        id: 'aaad',
        name: 'idleSummary',
        isEnabled: true,
        trigger: {
          triggerType: 'TalkAfterMin', condition: {
            min: 3,
          },
        },
        exec: {
          generator: 'geminiText',
          addDaemonGenToContext: true,
          templateGeneratePrompt: 'Please respond by summarizing the conversation so far and showing your understanding.',
          setting: {
            // previousContextSize: 20,
            toClass: 'daemon',
            toRole: 'bot',
            toContext: 'inner'
          },
        },
      },
      {
        id: 'aaae',
        name: 'idleSummaryImage',
        isEnabled: true,
        trigger: {
          triggerType: 'TalkAfterMin', condition: {
            min: 3,
          },
        },
        exec: {
          generator: 'geminiImage',
          addDaemonGenToContext: false,
          templateGeneratePrompt: 'Create a diagram that summarizes the conversation so far.',
          setting: {
            previousContextSize: 4,
            toClass: 'daemon',
            toRole: 'bot',
            toContext: 'outer'
          },
        },
      },
    ],
    configVersion:1,
  } as AvatarSetting;


export const defaultMutableSetting: MutableSysConfig = {
  volume: 1,
  winX: 100,
  winY: 100,
  winWidth: 1000,
  winHeight: 800,
};
