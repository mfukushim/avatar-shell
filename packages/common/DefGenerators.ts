import {Schema} from 'effect';

export const AsClassBaseSchema = Schema.Literal(
  '',
  'talk',
  'com',
  'daemon',
  'physics',
  'system',
);
export const AsClassSchema = AsClassBaseSchema.pipe(Schema.pickLiteral(
  'talk',
  'com',
  'daemon',
  'physics',
  'system',
));

export type AsClass = typeof AsClassSchema.Type

export const AsClassList = AsClassBaseSchema.literals;

export const AsRoleSchema = Schema.Literal(
  '',
  'human',  //  一般的なLLM role 'user'
  'bot',    //  'assistant'
  'toolIn', //  'assistant'
  'toolOut', // 'user'
  'system',  // 除外?
);

export type AsRole = typeof AsRoleSchema.Type

export const AsRoleList = AsRoleSchema.literals;

export const AsContextLinesSchema = Schema.Literal(
  'inner',
  'surface',
  'outer',
)

export type AsContextLines = typeof AsContextLinesSchema.Type

export const AsContextLinesList = AsContextLinesSchema.literals;

export const ContextTypes = Schema.Literal(
  'text',
  'image'
)

export type ContextTypes = typeof ContextTypes.Type


export interface ContextGeneratorInfo {
  usePreviousContext: boolean;
  defaultPrevContextSize: number;
  inputContextTypes: ContextTypes[];
  outputContextTypes: ContextTypes[];
  addToMainContext: boolean;
  contextRole: AsRole,
  contextTemplate?: string,
}

/**
 * 対応ジェネレーター
 */
export const GeneratorProviderSchema = Schema.Literal(
  'openAiText',
  'openAiImage',
  'openAiVoice',
  'claudeText',
  'geminiText',
  'geminiImage',
  'geminiVoice',
  // 'ollama',
  // 'voiceVox',
  // 'comfyUi',
  'ollamaText',
  'lmStudioText',
  'pixAi',  //  TODO 確認
  'emptyText',
  'emptyImage',
  'emptyVoice',
  'copy'
);

export type GeneratorProvider = typeof GeneratorProviderSchema.Type

export const GeneratorProviderList = GeneratorProviderSchema.literals;

/*
generator 個別設定(generator daemonごとに別に設定)
 */

/**
 * ContextGeneratorSettingはAvatar個別のコンテキストデーモンの個々の定義で設定する値があれば設定する
 */
export const ContextGeneratorSettingSchema = Schema.partial(Schema.Struct({
  previousContextSize: Schema.Number,
  useContextType: Schema.Array(ContextTypes),
  toClass: Schema.optional(AsClassSchema),  //  contextに追加するときは必ずuserにする方向、でなければ通常system
  toRole: Schema.optional(AsRoleSchema),  //  contextに追加するときは必ずuserにする方向、でなければ通常system
  toContext:Schema.optional(AsContextLinesSchema),
  noTool: Schema.optional(Schema.Boolean),
  useModel: Schema.optional(Schema.String),
  debug: Schema.Any,  //  デバッグ用汎用
}))

export type ContextGeneratorSetting = typeof ContextGeneratorSettingSchema.Type

export interface PixAiSettings extends ContextGeneratorSetting {
  modelId?:string;
  width?:number;
  height?:number;
}

export interface OpenAiSettings extends ContextGeneratorSetting {
  model?:string;
  inWidth?:number;
}

export interface OpenAiTextSettings extends ContextGeneratorSetting {
  model?:string;
  inWidth?:number;
}

export interface OpenAiImageSettings extends ContextGeneratorSetting {
  model?:string;
  outWidth?:number;
  outHeight?:number;
}

export interface OpenAiVoiceSettings extends ContextGeneratorSetting {
  model?:string;
}

export interface GeminiSettings extends ContextGeneratorSetting {
  model?:string;
  inWidth?:number;
}
export interface GeminiTextSettings extends ContextGeneratorSetting {
  model?:string;
  inWidth?:number;
}

export interface GeminiImageSettings extends ContextGeneratorSetting {
  model?:string;
  outWidth?:number;
  outHeight?:number;
}

export interface GeminiVoiceSettings extends ContextGeneratorSetting {
  model?:string;
}

export interface ClaudeTextSettings extends ContextGeneratorSetting {
  model?:string;
  inWidth?:number;
}

export interface LmStudioSettings extends ContextGeneratorSetting {
  model?:string;
  inWidth?:number;
}


/*
Generator 全体設定(api keyなど全体で設定するもの
 */

//  llm generator (テキスト, 画像, 音声)

//    openAi  openAiText, openAiImage, openAiVoice
export const openAiSysConfigSchema = Schema.Struct({
  apiKey: Schema.String,
  model: Schema.String,
});
export const openAiTextMutableConfigSchema = Schema.mutable(openAiSysConfigSchema)

export type OpenAiTextConfig = typeof openAiTextMutableConfigSchema.Type

export const openAiImageConfigSchema = Schema.Struct({
  model: Schema.String,
});

export const openAiImageMutableConfigSchema = Schema.mutable(openAiImageConfigSchema)

export type OpenAiImageConfig = typeof openAiImageMutableConfigSchema.Type

export const openAiVoiceConfigSchema = Schema.Struct({
  model: Schema.String,
  voice: Schema.String,
  cutoffTextLimit:Schema.optional(Schema.Number)
});


export const openAiVoiceMutableConfigSchema = Schema.mutable(openAiVoiceConfigSchema)

export type OpenAiVoiceConfig = typeof openAiVoiceMutableConfigSchema.Type

//    anthropic claudeText
export const anthropicSysConfigSchema = Schema.Struct({
  apiKey: Schema.String,
  model: Schema.String,
});

export const anthropicMutableConfigSchema = Schema.mutable(anthropicSysConfigSchema)

//    gemini  geminiText, geminiImage, geminiVoice
export const geminiSysConfigSchema = Schema.Struct({
  apiKey: Schema.String,
  model: Schema.String,
});

export const geminiImageConfigSchema = Schema.Struct({
  model: Schema.String,
});

export const geminiVoiceConfigSchema = Schema.Struct({
  model: Schema.String,
  voice: Schema.String,
  cutoffTextLimit:Schema.optional(Schema.Number)
});

export const geminiMutableConfigSchema = Schema.mutable(geminiSysConfigSchema)
export const geminiImageMutableConfigSchema = Schema.mutable(geminiImageConfigSchema)
export const geminiVoiceMutableConfigSchema = Schema.mutable(geminiVoiceConfigSchema)
//    ollama
export const ollamaSysConfigSchema = Schema.Struct({
  host: Schema.String,
  model: Schema.String,
  token: Schema.optional(Schema.String),
});

export type OllamaSysConfig = typeof ollamaSysConfigSchema.Type
export const ollamaMutableConfigSchema = Schema.mutable(ollamaSysConfigSchema)

//  lmStudio
export const lmStudioSysConfigSchema = Schema.Struct({
  baseUrl: Schema.String,
  model: Schema.String,
  token: Schema.optional(Schema.String),
});

export type LmStudioSysConfig = typeof lmStudioSysConfigSchema.Type
export const lmStudioMutableConfigSchema = Schema.mutable(lmStudioSysConfigSchema)


//  画像生成generator

//    pixAiImage

//    ComfyUiImage


//  音声合成generator

//    voiceVox
/*
export const voiceVoxSysConfigSchema = Schema.Struct({
  url: Schema.String,
  custom: Schema.partial(
    Schema.Struct({
      speaker: Schema.NumberFromString.pipe(Schema.int()),
      speed: Schema.NumberFromString,
      pitch: Schema.NumberFromString,
    }),
  ),
})
*/

// export const voiceVoxMutableConfigSchema = Schema.mutable(voiceVoxSysConfigSchema)

//    nijiVoice


export const generatorsConfigSetChema = Schema.Struct({
  openAiText: openAiSysConfigSchema,
  openAiImage: openAiImageConfigSchema,
  openAiVoice: openAiVoiceConfigSchema,
  anthropic: anthropicSysConfigSchema,
  gemini: geminiSysConfigSchema,
  geminiImage: geminiImageConfigSchema,
  geminiVoice: geminiVoiceConfigSchema,
  ollama: ollamaSysConfigSchema,
  lmStudio: lmStudioSysConfigSchema,
  // voiceVox: voiceVoxSysConfigSchema,
})
export const generatorsMutableConfigSetChema = Schema.mutable(Schema.Struct({
  openAiText: openAiTextMutableConfigSchema,
  openAiImage: openAiImageMutableConfigSchema,
  openAiVoice: openAiVoiceMutableConfigSchema,
  anthropic: anthropicMutableConfigSchema,
  gemini: geminiMutableConfigSchema,
  geminiImage: geminiImageMutableConfigSchema,
  geminiVoice: geminiVoiceMutableConfigSchema,
  ollama: ollamaMutableConfigSchema,
  lmStudio: lmStudioMutableConfigSchema,
  // voiceVox: voiceVoxMutableConfigSchema,
}))

// export type GeneratorsConfigSet = typeof generatorsConfigSetChema.Type
export type GeneratorsMutableConfigSet = typeof generatorsMutableConfigSetChema.Type
