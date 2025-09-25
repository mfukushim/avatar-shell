import {
  AvatarSetting,
  MutableSysConfig,
  SysConfig,
} from './Def.js';

export const vitestSysConfig: SysConfig = {

  'defaultAvatarId': 'vitestDummyId',
  generators: {
    openAiText: {
      'apiKey': process.env.VITE_OPENAI_API_KEY as string || 'aaaa',
      'model': 'gpt-4.1-mini',
    },
    openAiImage: {
      model: '',
    },
    openAiVoice: {
      model: '',
      voice: '',
    },
    'anthropic': {
      'apiKey': 'aaa',
      'model': 'claude-3-7-sonnet-latest',
    },
    gemini: {
      apiKey: process.env.VITE_GEMINI_API_KEY as string || 'aaaa',
      model: 'gemini-2.5-flash',
    },
    geminiImage: {
      model: 'gemini-2.0-flash-preview-image-generation',
    },
    geminiVoice: {
      model: 'gemini-2.5-flash-preview-tts',
      voice: 'Kore',
    },
    // voiceVox: {
    //   url: 'http://192.168.1.100:50021',
    //   custom: {},
    // },
  },
  mcpServers: {
    'traveler': {
      'command': 'npx',
      'args': [
        '-y',
        '@mfukushim/map-traveler-mcp',
      ],
      'env': {
        "GoogleMapApi_key": process.env.VITE_TR_GoogleMapApi_key as string,
        "ServerLog":process.env.VITE_TR_ServerLog as string,
        "MT_TURSO_URL":process.env.VITE_TR_MT_TURSO_URL as string,
        "MT_TURSO_TOKEN":process.env.VITE_TR_MT_TURSO_TOKEN as string,
        "pixAi_key":process.env.VITE_TR_pixAi_key as string,
        "image_width":process.env.VITE_TR_image_width as string,
        "bs_id":process.env.VITE_TR_bs_id as string,
        "bs_pass":process.env.VITE_TR_bs_pass as string,
        "bs_handle":process.env.VITE_TR_bs_handle as string,
      },
    },
    "slack": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-slack"
      ],
      "env": {
        "SLACK_BOT_TOKEN": process.env.VITE_SK_SLACK_BOT_TOKEN as string || 'aaa',
        "SLACK_TEAM_ID": process.env.VITE_SK_SLACK_TEAM_ID as string || 'aaa',
        "SLACK_CHANNEL_IDS": process.env.VITE_SK_SLACK_CHANNEL_IDS as string
      },
    }
  },
  experimental:{
    mcpUi:false,
    mcpUiTemplate:"user select '{body}'"
  },
  websocket: {
    useServer: true,
    serverPort: undefined,
    textTemplate: '{from} said, "{body}"',
    // autoSendTextNumber: 3,
    // manualSend: false,
  },
  configVersion:1,
};


export const vitestAvatarConfigMi: AvatarSetting = {
  templateId: 'vitestDummyId',
  general: {
    name: 'vitestMi',
    // useLlm: 'geminiText',
    // mainLlmSetting: {
    //   previousContextSize: 0,
    //   useContextType: ['text', 'image'],
    // },
    useSocket: true,
    remoteServer: undefined,
    maxGeneratorUseCount: 10,
  },
  mcp: {
    "traveler": {
      "enable": true,
      "useTools": {
        "set_traveler_location": {"enable": true, "allow": "ask"},
        "get_traveler_destination_address": {"enable": true, "allow": "ask"},
        "set_traveler_destination_address": {"enable": true, "allow": "ask"},
        "get_traveler_view_info": {"enable": true, "allow": "ask"},
        "get_traveler_location": {"enable": true, "allow": "ask"},
        "tips": {"enable": true, "allow": "any"},
        "get_setting": {"enable": true, "allow": "any"},
        "get_traveler_info": {"enable": true, "allow": "ask"},
        "set_traveler_info": {"enable": true, "allow": "ask"},
        "start_traveler_journey": {"enable": true, "allow": "ask"},
        "stop_traveler_journey": {"enable": true, "allow": "ask"},
        "set_avatar_prompt": {"enable": true, "allow": "ask"},
        "reset_avatar_prompt": {"enable": true, "allow": "no"}
      }
    },
    "slack": {
      "enable": true,
      "useTools": {
        "slack_list_channels": {"enable": true, "allow": "ask"},
        "slack_post_message": {"enable": true, "allow": "ask"},
        "slack_reply_to_thread": {"enable": true, "allow": "ask"},
        "slack_add_reaction": {"enable": true, "allow": "ask"},
        "slack_get_channel_history": {"enable": true, "allow": "ask"},
        "slack_get_thread_replies": {"enable": true, "allow": "ask"},
        "slack_get_users": {"enable": true, "allow": "ask"},
        "slack_get_user_profile": {"enable": true, "allow": "ask"}
      }
    },
    // "echoDaemon": {
    //   "enable": true,
    //   "notice": "注意: Echo Scheduler組み込みMCPは強力ですがセキュリティと動作安全性の上でリスクがあります。リスクを判断の上、使用するか判断してください。",
    //   "useTools": {
    //     "set_task_when_idling": {"enable": true, "allow": "ask"},
    //     "set_task_after_minutes": {"enable": true, "allow": "ask"}
    //   }
    // }
  },
  daemons: [
    {
      'id': '77ndZPy3UXHkjot7wu7d4U',
      'name': 'StartupPict',
      'isEnabled': true,
      'trigger': {
        'triggerType': 'TimerMin',
        'condition': {min: 2},
      },
      'exec': {
        generator: 'geminiImage',
        // 'toRole': 'human',
        directTrigger: false,
        templateGeneratePrompt: '挨拶をする可愛い女の子の絵を生成してください',
        // 'templateContextPrompt': '',
        setting: {
          toClass:'daemon',
          toRole:'bot'
        },
      },
    },
    {
      'id': 'aaab',
      'name': 'greeting',
      'isEnabled': true,
      'trigger': {
        'triggerType': 'TimerMin',
        'condition': {min: 2},
      },
      'exec': {
        generator: 'geminiText',
        // 'toRole': 'human',
        directTrigger: false,
        templateGeneratePrompt: 'フランクに日本語で短く挨拶をしてください',
        // 'templateContextPrompt': 'フランクに日本語で挨拶をしてください',
        setting: {
          toClass:'talk',
          toRole:'bot'
        },
      },
    },
    {
      'id': 'aaac',
      'name': 'voice',
      'isEnabled': true,
      'trigger': {
        'triggerType': 'IfContextExists', 'condition': {
          asClass: 'talk',
          asRole: 'bot',
        },
      },
      'exec': {
        generator: 'geminiVoice',
        templateGeneratePrompt: '{body}',
        directTrigger: true,
        setting: {
          toClass:'daemon',
          toRole:'bot'
        },
      },
    },
  ],
  configVersion:1,
};
//  ダミージェネレーター
export const vitestAvatarConfigNone: AvatarSetting = {
  templateId: 'vitestNoneId',
  'general': {
    'name': 'vitestMi',
    // useLlm: 'emptyText',
    // mainLlmSetting: {
    //   previousContextSize: 0,
    //   useContextType: ['text', 'image'],
    // },
    useSocket: true,
    remoteServer: undefined,
    maxGeneratorUseCount: 10,
  },
  'mcp': {
    'traveler': {
      'enable': true,
      'useTools': {
        'get_traveler_view_info': {
          'enable': true,
          'allow': 'any',
        },
        'get_traveler_location': {
          'enable': true,
          'allow': 'ask',
        },
        'tips': {
          'enable': true,
          'allow': 'any',
        },
        'get_setting': {
          'enable': true,
          'allow': 'no',
        },
        'get_traveler_info': {
          'enable': false,
          'allow': 'any',
        },
        'set_traveler_info': {
          'enable': true,
          'allow': 'any',
        },
        'start_traveler_journey': {
          'enable': true,
          'allow': 'any',
        },
        'stop_traveler_journey': {
          'enable': true,
          'allow': 'any',
        },
      },
    },
  },
  daemons: [
    {
      'id': '77ndZPy3UXHkjot7wu7d4U',
      'name': 'StartupPict',
      'isEnabled': true,
      'trigger': {
        'triggerType': 'TimerMin',
        'condition': {min: 2},
      },
      'exec': {
        generator: 'emptyImage',
        directTrigger: false,
        templateGeneratePrompt: '挨拶をする可愛い女の子の絵を生成してください',
        setting: {
          toClass:'daemon',
          toRole:'bot'
        },
      },
    },
    {
      'id': 'aaab',
      'name': '2min1',
      'isEnabled': true,
      'trigger': {
        'triggerType': 'TimerMin',
        'condition': {min: 2},
      },
      'exec': {
        generator: 'emptyText',
        directTrigger: false,
        templateGeneratePrompt: 'フランクに日本語で短く挨拶をしてください',
        setting: {
          toClass:'talk',
          toRole:'bot'
        },
      },
    },
    {
      'id': 'aaac',
      'name': 'toVoice',
      'isEnabled': true,
      'trigger': {
        'triggerType': 'IfContextExists', 'condition': {
          asClass: 'talk',
          asRole: 'bot',
        },
      },
      'exec': {
        generator: 'emptyVoice',
        // 'toRole': 'human',
        // templateGeneratePrompt: '{body}',
        directTrigger: true,
        setting: {
          toClass:'daemon',
          toRole:'bot'
        },
      },
    },
  ],
  configVersion:1,
};
//  daemonスケジュールテスト
export const vitestAvatarConfigDaemon: AvatarSetting = {
  templateId: 'vitestDaemonId',
  'general': {
    'name': 'vitestDaemon',
    // useLlm: 'emptyText',
    // mainLlmSetting: {
    //   previousContextSize: 0,
    //   useContextType: ['text', 'image'],
    // },
    useSocket: true,
    remoteServer: undefined,
    maxGeneratorUseCount: 10,
  },
  mcp: {},
  daemons: [
    {
      id: '77ndZPy3UXHkjot7wu7d4U',
      name: 'Startup',
      isEnabled: true,
      trigger: {
        triggerType: 'Startup',
        condition: {},
      },
      exec: {
        generator: 'emptyText',
        directTrigger: false,
        templateGeneratePrompt: 'Hello',
        setting: {
          toClass:'talk',
          toRole:'bot'
        },
      },
    },
    {
      'id': 'aaab',
      'name': 'sec30',
      'isEnabled': true,
      'trigger': {
        'triggerType': 'TimerMin',
        'condition': {min: 0.5},
      },
      'exec': {
        generator: 'emptyText',
        directTrigger: false,
        templateGeneratePrompt: '30 seconds has passed',
        setting: {
          toClass:'talk',
          toRole:'bot'
        },
      },
    },
    {
      id: 'aaac',
      name: 'min1',
      isEnabled: true,
      trigger: {
        triggerType: 'TimerMin',
        condition: {min: 1},
      },
      exec: {
        generator: 'emptyText',
        directTrigger: false,
        templateGeneratePrompt: '1 minute has passed',
        setting: {
          toClass:'talk',
          toRole:'bot'
        },
      },
    },
    {
      id: 'aaad',
      name: 'min2',
      isEnabled: true,
      trigger: {
        triggerType: 'TimerMin',
        condition: {min: 2},
      },
      exec: {
        generator: 'emptyText',
        directTrigger: false,
        templateGeneratePrompt: '2 minutes has passed',
        setting: {
          toClass:'talk',
          toRole:'bot'
        },
      },
    },
  ],
  configVersion:1,
};
export const vitestAvatarConfigDaemon2: AvatarSetting = {
  templateId: 'vitestDaemon2Id',
  general: {
    name: 'vitestDaemon',
    // useLlm: 'emptyText',
    // mainLlmSetting: {
    //   previousContextSize: 0,
    //   useContextType: ['text', 'image'],
    // },
    useSocket: true,
    remoteServer: undefined,
    maxGeneratorUseCount: 10,
  },
  mcp: {},
  daemons: [
    {
      id: 'aaab',
      name: 'repeatSec15',
      isEnabled: true,
      trigger: {
        triggerType: 'TimerMin',
        condition: {min: 0.25,isRepeatMin:true},
      },
      exec: {
        generator: 'emptyText',
        directTrigger: false,
        templateGeneratePrompt: 'Repeated for 15 seconds',
        setting: {
          toClass:'talk',
          toRole:'bot'
        },
      },
    },
  ],
  configVersion:1,
};
export const vitestAvatarConfigDaemon999: AvatarSetting = {
  templateId: 'vitestDaemon999Id',
  general: {
    name: 'vitestDaemon',
    // useLlm: 'emptyText',
    // mainLlmSetting: {
    //   previousContextSize: 0,
    //   useContextType: ['text', 'image'],
    // },
    useSocket: true,
    remoteServer: undefined,
    maxGeneratorUseCount: 10,
  },
  mcp: {},
  daemons: [
/*
    {
      id: 'aaab',
      name: 'repeatSec15',
      isEnabled: true,
      trigger: {
        triggerType: 'Time',
        condition: {dateTime:'00:00:00'},
      },
      exec: {
        addDaemonGenToContext: true,
        templateContextPrompt: 'repeat sec15 Test',
        setting: {},
      },
    },
*/
  ],
  configVersion:1,
};


export const vitestAvatarConfig: Record<string, AvatarSetting> = {
  vitestDummyId: vitestAvatarConfigMi,
  vitestNoneId: vitestAvatarConfigNone,
  vitestDaemonId: vitestAvatarConfigDaemon,
  vitestDaemon2Id: vitestAvatarConfigDaemon2,
  vitestDaemon999Id: vitestAvatarConfigDaemon999,
};

export const vitestMutableSetting: MutableSysConfig = {
  volume: 1,
  winX: 100,
  winY: 100,
  winWidth: 1000,
  winHeight: 800,
};

