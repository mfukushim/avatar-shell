// import {AvatarSetting, MutableSysConfig, SysConfig} from '../packages/common/Def.js';
import {AvatarSetting, MutableSysConfig, SysConfig} from './Def.js';

export const debugSysConfig: SysConfig = {

  defaultAvatarId: 'abcd3',
  generators: {
    openAiText: {
      apiKey: process.env.VITE_OPENAI_API_KEY as string,
      model: 'gpt-4.1-mini',
    },
    openAiImage: {
      model: 'gpt-4.1-mini',
    },
    openAiVoice: {
      model: 'gpt-4o-audio-preview',
      voice: 'alloy',
    },
    anthropic: {
      apiKey: process.env.VITE_CLAUDE_API_KEY as string,
      model: 'claude-3-7-sonnet-latest',
    },
    gemini: {
      apiKey: process.env.VITE_GEMINI_API_KEY as string,
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
    //   url: 'http://192.168.11.122:50021',
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
        "rembg_path":process.env.VITE_TR_rembg_path as string,
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
        "SLACK_BOT_TOKEN": process.env.VITE_SK_SLACK_BOT_TOKEN as string,
        "SLACK_TEAM_ID": process.env.VITE_SK_SLACK_TEAM_ID as string,
        "SLACK_CHANNEL_IDS": process.env.VITE_SK_SLACK_CHANNEL_IDS as string
      }
    }
  },
  websocket: {
    useServer: true,
    serverPort: undefined,
    textTemplate: '{from} said, "{body}"',
  },
  configVersion: 1,
};


export const testAvatarConfigMi: AvatarSetting = {
  templateId: 'abcd1',
  general: {
    'name': 'Mi',
    // useLlm: 'claudeText',
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
        "tips": {"enable": true, "allow": "ask"},
        "get_setting": {"enable": true, "allow": "ask"},
        "get_traveler_info": {"enable": true, "allow": "ask"},
        "set_traveler_info": {"enable": true, "allow": "ask"},
        "start_traveler_journey": {"enable": true, "allow": "ask"},
        "stop_traveler_journey": {"enable": true, "allow": "ask"},
        "set_avatar_prompt": {"enable": true, "allow": "ask"},
        "reset_avatar_prompt": {"enable": true, "allow": "ask"}
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
    "echoScheduler": {
      "enable": true,
      "notice": "注意: Echo Scheduler組み込みMCPは強力ですがセキュリティと動作安全性の上でリスクがあります。リスクを判断の上、使用するか判断してください。",
      "useTools": {
        "set_task_when_idling": {"enable": true, "allow": "ask"},
        "set_task_after_minutes": {"enable": true, "allow": "ask"}
      }
    }
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
        generator: 'openAiText',
        directTrigger: true,
        templateGeneratePrompt: '{body}',
        setting: {
          toClass: 'talk',
          toRole: 'bot',
        },
      },
    },
    {
      'id': 'aaac',
      'name': 'Voice',
      'isEnabled': true,
      'trigger': {
        'triggerType': 'IfContextExists', 'condition': {
          asClass: 'talk',
          asRole: 'bot',
        },
      },
      'exec': {
        generator: 'geminiVoice',
        'templateGeneratePrompt': '{body}',
        directTrigger: true,
        // 'templateContextPrompt': 'フランクに日本語で挨拶をしてください',
        setting: {
          toClass: 'daemon',
          toRole: 'bot',
        },
      },
    },
    {
      'id': 'aaab',
      'name': 'StartupTalk',
      'isEnabled': true,
      'trigger': {'triggerType': 'Startup', 'condition': {}},
      'exec': {
        generator: 'openAiText',
        directTrigger: false,
        templateGeneratePrompt: '親しげに1行で短く日本語で挨拶をしてください',
        // 'templateContextPrompt': '親しげに1行で短く日本語で挨拶をしてください',
        setting: {
          toClass: 'talk',
          toRole: 'bot',
        },
      },
    },
    {
      'id': '77ndZPy3UXHkjot7wu7d4U',
      'name': 'StartupPict',
      'isEnabled': true,
      'trigger': {'triggerType': 'Startup', 'condition': {}},
      'exec': {
        generator: 'openAiImage',
        directTrigger: false,
        templateGeneratePrompt: '挨拶をするアニメ調の女性の絵を生成してください',
        setting: {
          toClass: 'daemon',
          toRole: 'bot',
        },
      },
    },
    {
      id: 'aaax1',
      name: 'StartTravel',
      isEnabled: true,
      trigger: {'triggerType': 'Startup', 'condition': {}},
      exec: {
        generator: 'openAiText',
        directTrigger: false,
        templateGeneratePrompt: '今いる場所を「横浜駅」に設定してください。目的地を「東京駅」に設定してください。旅を開始してください。',
        setting: {
          toClass: 'daemon',
          toRole: 'bot',
        },
      },
    },
  ],
  configVersion: 1,
};
export const testAvatarConfigMiAnt: AvatarSetting = {
  templateId: 'abcd3',
  'general': {
    'name': 'Mu',
    // 'defaultIdleMin': 10,
    // useLlm: 'claudeText',
    // mainLlmSetting: {
    //   previousContextSize: 0,
    //   useContextType: ['text', 'image'],
    // },
    useSocket: true,
    remoteServer: undefined,
    maxGeneratorUseCount: 10,
    // useRoom:undefined,
  },
  mcp: {
    "traveler": {
      "enable": true,
      "useTools": {
        "get_traveler_view_info": {"enable": true, "allow": "ask"},
        "get_traveler_location": {"enable": true, "allow": "ask"},
        "tips": {"enable": true, "allow": "ask"},
        "get_setting": {"enable": true, "allow": "ask"},
        "get_traveler_info": {"enable": true, "allow": "ask"},
        "set_traveler_info": {"enable": true, "allow": "ask"},
        "start_traveler_journey": {"enable": true, "allow": "ask"},
        "stop_traveler_journey": {"enable": true, "allow": "ask"}
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
    "echoScheduler": {
      "enable": true,
      "notice": "注意: Echo Scheduler組み込みMCPは強力ですがセキュリティと動作安全性の上でリスクがあります。リスクを判断の上、使用するか判断してください。",
      "useTools": {
        "set_task_when_idling": {"enable": true, "allow": "ask"},
        "set_task_after_minutes": {"enable": true, "allow": "ask"}
      }
    }
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
        directTrigger: true,
        templateGeneratePrompt: '{body}',
        setting: {
          toClass: 'talk',
          toRole: 'bot',
        },
      },
    },
  ],
  configVersion: 1,
};

export const testAvatarConfigMaid: AvatarSetting = {
  templateId: 'abcd2',
  'general': {
    'name': 'MarMaid',
    // 'defaultIdleMin': 10,
    // useLlm: 'openAiText',
    // mainLlmSetting: {
    //   previousContextSize: 0,
    //   useContextType: ['text', 'image'],
    // },
    useSocket: false,
    remoteServer: undefined,
    maxGeneratorUseCount: 10,
  },
  'mcp': {},
  daemons: [],
  configVersion: 1,
};

export const debugAvatarConfig: Record<string, AvatarSetting> = {
  abcd1: testAvatarConfigMi,
  abcd2: testAvatarConfigMaid,
  abcd3: testAvatarConfigMiAnt,
};

export const debugMutableSetting: MutableSysConfig = {
  volume: 1,
  winX: 100,
  winY: 100,
  winWidth: 1000,
  winHeight: 800,
};
