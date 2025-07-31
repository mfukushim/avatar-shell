import {Schema} from 'effect';
import {
  type AsClass,
  AsClassSchema,type AsContextLines, AsContextLinesSchema, type AsRole, AsRoleSchema,
  ContextGeneratorSettingSchema, GeneratorProviderSchema,
  generatorsConfigSetChema,
  generatorsMutableConfigSetChema,
} from './DefGenerators.js';
import short from 'short-uuid';
import dayjs from 'dayjs';


/*
daemon Schedulerの定義パターン

1. Avatar起動時
2. talk発生後,n分後
3. contextにtalk-assistant-not extの発生時
4. 組み込みサマリーカウンタ一定数以上のとき、サマリーカウンタを0にしてから
5. Avatar終了操作時→とりあえずまだいれない
6. 一定時間周期で特定のtrue/falseを返答するllm promptを実行した結果
7. 指定時刻
8. 指定日時


判定タイミングは
- context判定系
TalkContext追加時
システム起動時
サマリーカウンタ追加時
システム終了時(これは今は厳しいかも)

- timer系
時計時間
分タイマー(ワンショット)
分タイマー(サイクリック)
talk後一定時間アイドリング

実行すること

指定LLM(generator)を指定固定条件で起動する
(generatorには画像生成や音声再生も含まれる)
何か固定コマンドもありうるか?

各AvatarState

スケジューラの実行パターンは主に4つ

1. スケジューラー起動で単純なテンプレート加工したプロンプトをmainLLMに userとして送信 (表示上は送信をhideがデフォルト)
2. スケジューラー起動で単純なテンプレート加工したプロンプトをgeneratorに送り、演算した出力を mainLLMに userとして送信 (表示上は送信はhideがデフォルト) フラグによってコンテキストの切り捨て
3. スケジューラー起動で単純なテンプレート加工したプロンプトをgeneratorに送り、演算した出力をsystemとして追加(mainLLMには送らない、表示はする)
4. 条件検出した追加コンテキストをgeneratorに送り、演算した結果をsystemとして追加(mainLLMには送らない表示はhide)

これは外部通信側の機能
3. 単純なテンプレート加工した外部入力コンテキストを mainLLMに userとして送信 (表示させるがデフォルト)→これは外部機能の話なので別かな

 */


const DaemonTrigger = Schema.Literal(
  'Startup',
  'TalkAfterMin',
  'IfContextExists',
  'IfSummaryCounterOver',
  'IfExtTalkCounterOver',
  'TimerMin',
  'DayTimeDirect',
  'DateTimeDirect',
);

const ContextTrigger = DaemonTrigger.pipe(Schema.pickLiteral(
  'IfContextExists',
  'Startup',
  'IfSummaryCounterOver',
  'IfExtTalkCounterOver'
));
const TimerTrigger = DaemonTrigger.pipe(Schema.pickLiteral(
  'TimerMin',
  'DayTimeDirect',
  'DateTimeDirect',
  'TalkAfterMin',
));

export const DaemonTriggerList = DaemonTrigger.literals;
export const ContextTriggerList = ContextTrigger.literals;
export const TimerTriggerList = TimerTrigger.literals;
export type DaemonTrigger = typeof DaemonTrigger.Type
export type ContextTrigger = typeof ContextTrigger.Type
export type TimerTrigger = typeof TimerTrigger.Type


/*
  AsMessage
 */


const SubCommandSchema = Schema.Literal(
  'none',
  'addTextParts',
  'deleteTextParts',
  'addRunning',
  'delRunning'
);

export const AsMessageContentSchema = Schema.partial(
  Schema.Struct({
    innerId: Schema.String,
    from: Schema.String,
    text: Schema.String,
    subCommand: SubCommandSchema,
    mediaUrl: Schema.String,
    mediaBin: Schema.Any, //  ArrayBuffer
    mimeType: Schema.String,
    toolName: Schema.String,
    toolData: Schema.Any,
    textParts: Schema.Array(Schema.String),
    llmInfo: Schema.String,
    isExternal: Schema.Boolean,
  }));

export type AsMessageContent = typeof AsMessageContentSchema.Type

export class AsMessage extends Schema.Class<AsMessage>('AsMessage')({
  id: Schema.String,
  tick: Schema.Number,
  asClass: AsClassSchema,
  asRole: AsRoleSchema,
  asContext:AsContextLinesSchema,
  isRequestAction: Schema.Boolean,
  content: AsMessageContentSchema,
}) {
  static makeMessage(content: AsMessageContent, asClass: AsClass = 'talk', asRole: AsRole = 'human', asContext:AsContextLines, isRequestAction=false) {
    return {
      id: short.generate(),
      tick: dayjs().valueOf(),
      asClass,
      asRole,
      asContext,
      isRequestAction,
      content
    } as AsMessage;
  }
}

export const AsContentsSchema = Schema.Struct({
  asRole: AsRoleSchema,
  contents: Schema.mutable(Schema.Array(AsMessageContentSchema)),
})

export type AsContents = typeof AsContentsSchema.Type

/*
 *  ContextGenerator
 */
const DaemonTriggerSchema = Schema.Struct({
  triggerType: DaemonTrigger,
  condition: Schema.partial(Schema.Struct({
    min: Schema.Number,
    isRepeatMin: Schema.Boolean,
    time: Schema.String,
    date: Schema.String,
    dateTimeCron: Schema.String,
    asClass: AsClassSchema,
    asRole: AsRoleSchema,
    asContext: AsContextLinesSchema,
    countMax: Schema.Number,
  })),
});

export type DaemonTriggerSchema = typeof DaemonTriggerSchema.Type

const SchedulerExecGenSchema = Schema.mutable(Schema.Struct({
  generator: GeneratorProviderSchema, //  undefinedの場合ジェネレーターは使わずにテンプレート変換のみする(多くの場合固定プロンプト)
  templateGeneratePrompt: Schema.String,  //  [TELLER]は[OUT]と言いました。
  // templateContextPrompt: Schema.optional(Schema.String),  //  [TELLER]は[OUT]と言いました。
  addDaemonGenToContext: Schema.Boolean,
  //  誰が(TELLER)
  setting: Schema.mutable(ContextGeneratorSettingSchema),
}));

export type SchedulerExecGen = typeof SchedulerExecGenSchema.Type

export const DaemonConfigSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  isEnabled: Schema.Boolean,
  trigger: Schema.mutable(DaemonTriggerSchema),
  exec: SchedulerExecGenSchema,
});

export type DaemonConfig = typeof DaemonConfigSchema.Type

const GenTypeSchema = Schema.Struct( {
  provider: Schema.optional(GeneratorProviderSchema),
  model: Schema.String,
  isExternal: Schema.Boolean,
})

export type GenType = typeof GenTypeSchema.Type

export class AsOutput extends Schema.Class<AsOutput>('AsOutput')({
  genNative: Schema.Array(Schema.Any),
  genType: GenTypeSchema,
  mes: AsMessage
}) {
static makeOutput(mes: AsMessage, genType: GenType,genNative: any[]=[]) {
  return {
    genNative:genNative,
    genType:genType,
    mes:mes
  } as AsOutput;
}
}

//  alert from main

const AlertReply = Schema.Literal('oneTime','mcpSelect')

export type AlertReply = typeof AlertReply.Type

const AlertTaskSchema = Schema.Struct({
  id: Schema.String,
  replyTo: AlertReply,
  navigateTo: Schema.optional(Schema.String),
  message: Schema.String,
  select: Schema.optional(Schema.Array(Schema.String)),
})

export type AlertTask = typeof AlertTaskSchema.Type


const McpServerDef = Schema.Struct({
  command: Schema.NonEmptyString,
  args: Schema.mutable(Schema.NonEmptyArray(Schema.NonEmptyString)),
  env: Schema.optional(Schema.Record({
    key: Schema.NonEmptyString,
    value: Schema.NonEmptyString,
  })),
});

const McpToolInfo = Schema.Struct({
  name: Schema.mutable(Schema.String),
  description: Schema.optional(Schema.mutable(Schema.String)),
  inputSchema: Schema.mutable(Schema.Any),
});

const McpPromptInfo = Schema.Struct({
  name: Schema.mutable(Schema.String),
  description: Schema.optional(Schema.mutable(Schema.String)),
});
const McpResourceInfo = Schema.Struct({
  uri: Schema.mutable(Schema.String),
  name: Schema.mutable(Schema.String),
  description: Schema.optional(Schema.mutable(Schema.String)),
  mimeType: Schema.optional(Schema.mutable(Schema.String)),
});

const McpInfo = Schema.Struct({
  id: Schema.NonEmptyTrimmedString,
  notice: Schema.optional(Schema.String),
  tools: Schema.mutable(Schema.Array(McpToolInfo)),
  prompts: Schema.mutable(Schema.Array(McpPromptInfo)),
  resources: Schema.mutable(Schema.Array(McpResourceInfo)),
});
const McpConfig = Schema.Struct({
  id: Schema.NonEmptyTrimmedString,
  notice: Schema.optional(Schema.String),
  client: Schema.mutable(Schema.Any),
  tools: Schema.mutable(Schema.Array(McpToolInfo)),
  prompts: Schema.mutable(Schema.Array(McpPromptInfo)),
  resources: Schema.mutable(Schema.Array(McpResourceInfo)),
  buildIn: Schema.mutable(Schema.Boolean),
});

const McpConfigList = Schema.mutable(Schema.Array(McpConfig));

export type McpInfo = typeof McpInfo.Type
export type McpToolInfo = typeof McpToolInfo.Type
export type McpPromptInfo = typeof McpPromptInfo.Type
export type McpResourceInfo = typeof McpResourceInfo.Type
export type McpConfig = typeof McpConfig.Type
export type McpConfigList = typeof McpConfigList.Type

export type McpServerDef = typeof McpServerDef.Type

const MainLlmSchema = GeneratorProviderSchema.pipe(Schema.pickLiteral(
  'emptyText',
  'openAiText',
  'claudeText',
  'geminiText',
));

export type MainLlmSchema = typeof MainLlmSchema.Type

export const MainLlmList = MainLlmSchema.literals;

export const mcpServerListSchema = Schema.Record({
  key: Schema.NonEmptyString.pipe(Schema.pattern(/^[a-z0-9]+$/), Schema.filter(v => !v.includes('_') || 'Cannot contain _')),
  value: McpServerDef,
});
export type McpServerList = typeof mcpServerListSchema.Type

export const mcpServerMutableListSchema = Schema.mutable(mcpServerListSchema)

export type McpServerMutableList = typeof mcpServerMutableListSchema.Type

/**
 * mutableConfig
 */

export const MutableSysConfigSchema = Schema.partial(Schema.Struct({
  volume: Schema.Number,
  winX: Schema.Number,
  winY: Schema.Number,
  winWidth: Schema.Number,
  winHeight: Schema.Number,
}));

export type MutableSysConfig = typeof MutableSysConfigSchema.Type

/*
  tts:

 */
const websocketSchema = Schema.Struct({
  useServer: Schema.Boolean,
  serverPort: Schema.UndefinedOr(Schema.Int),
  textTemplate: Schema.String,
});

export const webSocketMutableSchema = Schema.mutable(websocketSchema)


/**
 * SysConfig  ======================
 */
export const SysConfigSchema = Schema.Struct({
  defaultAvatarId: Schema.UndefinedOr(Schema.String),
  generators: generatorsConfigSetChema,
  mcpServers: mcpServerListSchema,
  websocket: websocketSchema,
  configVersion: Schema.Number,
});

export type SysConfig = typeof SysConfigSchema.Type

export const sysConfigMutableSchema = Schema.mutable(Schema.Struct({
  defaultAvatarId: Schema.String,
  generators: generatorsMutableConfigSetChema,
  mcpServers: mcpServerMutableListSchema,
  websocket: webSocketMutableSchema,
  configVersion: Schema.mutable(Schema.Number),
}));

export type SysConfigMutable = typeof sysConfigMutableSchema.Type

const McpEnable = Schema.Literal('ask', 'any', 'no');

export type McpEnable = typeof McpEnable.Type

export const McpEnableList = McpEnable.literals;

export const AvatarMcpSetting = Schema.Struct({
  enable: Schema.Boolean,
  notice: Schema.optional(Schema.String),
  useTools: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      enable: Schema.Boolean,
      allow: McpEnable,
    }),
  }),
});

export type AvatarMcpSetting = typeof AvatarMcpSetting.Type

export const AvatarMcpSettingMutable = Schema.mutable(AvatarMcpSetting);
export type AvatarMcpSettingMutable = typeof AvatarMcpSettingMutable.Type

export const AvatarMcpSettingList = Schema.Record({
  key: Schema.String,
  value: AvatarMcpSetting,
});

export type AvatarMcpSettingList = typeof AvatarMcpSettingList.Type

const GenerateMediaSchema = Schema.Literal(
  'none',
  'image',
  // 'audio', 'imageAndAudio'
);

export type GenerateMedia = typeof GenerateMediaSchema.Type

export const GenerateMediaList = GenerateMediaSchema.literals;

const UseContentSchema = Schema.Literal(
  'text',
  'image',
);

export type UseContent = typeof UseContentSchema.Type

export const UseContentList = UseContentSchema.literals;

// export const EchoScheduleSchema = Schema.Struct({
//   id:Schema.String,
//   name: Schema.String,
//   isEnabled: Schema.Boolean,
//   generateMedia: GenerateMediaSchema,
//   useContent:UseContentSchema,
//   prompt: Schema.String,  //  prompt内に実行条件プロンプトは設定しうる
// })
//
// export const EchoScheduleDelaySchema = Schema.Struct({
//   ...EchoScheduleSchema.fields,
//   isOnetime: Schema.Boolean,
//   duringMin: Schema.UndefinedOr(Schema.Number), //  分単位アイドル検出時間 undefinedならアバターデフォルト値
// })
//
//
// export const EchoScheduleDateTimeSchema = Schema.Struct({
//   ...EchoScheduleSchema.fields,
//   minInDate: Schema.String
//   // dateTime: Schema.DateFromString,
// })

// export type EchoScheduleSchema = typeof EchoScheduleSchema.Type
// export type EchoScheduleDelaySchema = typeof EchoScheduleDelaySchema.Type
// export type EchoScheduleDateTimeSchema = typeof EchoScheduleDateTimeSchema.Type

/**
 * AvatarConfig ========================
 */
export const AvatarSetting = Schema.Struct({
  templateId: Schema.String,
  isTemporally:Schema.optional(Schema.Boolean),
  general: Schema.Struct({
    name: Schema.NonEmptyString,
    // useLlm: MainLlmSchema,
    // mainLlmSetting: ContextGeneratorSettingSchema,
        // useSpeechRec: Schema.UndefinedOr(SpeechRecSchema),
    useSocket: Schema.Boolean,
    remoteServer: Schema.UndefinedOr(Schema.String),
    maxGeneratorUseCount: Schema.Number,
  }),
  mcp: AvatarMcpSettingList,
  daemons: Schema.Array(DaemonConfigSchema),
  configVersion: Schema.Number,
});


export type AvatarSetting = typeof AvatarSetting.Type

export const AvatarSettingMutable = Schema.mutable(AvatarSetting);

export type AvatarSettingMutable = typeof AvatarSettingMutable.Type

export const SchedulerListMutable = Schema.mutable(
  Schema.Array(Schema.mutable(DaemonConfigSchema)),
);

export type SchedulerListMutable = typeof SchedulerListMutable.Type

export const SchedulerList =
  Schema.Array(DaemonConfigSchema)

export type SchedulerList = typeof SchedulerList.Type
