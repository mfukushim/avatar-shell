
export default {
  avatar: "アバター",
  avatars: 'アバター',
  defaultAvatar: '既定のアバター',
  avatarTemplateEdit: 'アバターひな形編集',
  editAvatarTemplate: '編集するアバターひな形',
  edit: '編集',
  copyAndAdd: 'コピーして追加',
  delete: '削除',
  close: '閉じる',
  cancel: 'キャンセル',
  ok: 'OK',
  deleteAvatarConfirm: '{name}を削除しますか？',
  // システム設定
  systemSetting: 'システム設定',
  generalSettings: '全体設定',
  general: '一般',
  contextGenerator: 'コンテキストジェネレータ',
  contextGeneratorCommonSettings: 'コンテキストジェネレータ共通設定',
  generatorCommonSettingsDescription: 'ジェネレータ(LLM含む)の共通設定をします',
  mcpSettings: 'MCP設定',
  avatarCommunication: 'アバター間通信',
  openSourceNotice: 'このソフトウェアは次のオープンソースソフトウェアを使用しています。',
  baseElectronBoilerplate: 'Electronボイラープレート',
  apiKey: 'APIキー',
  textModel: 'テキストモデル名',
  imageModel: '画像モデル名',
  voiceModel: '音声モデル名',
  voice: '音声名',
  addMcpDef:'MCPを追加',
  mcpName: 'MCP設定名',
  onlyAlphaNum:'(半角英数字のみ)',
  mcpJson:'MCP定義JSON',
  avatarCom:'アバター間通信',
  startSocketIoServer:'ローカルsocket.ioサーバーを起動する',
  portNumber:'ポート番号',
  noteSecurityCom:'アバター間通信には通信の暗号化を付けていません。',
  license:'ライセンス',
  wizard: {
    title2: 'gemini APIのキーを設定する',
    title3: 'アバター間通信の選択',
    title4: '確認',
    title5: '基本設定完了',
    gemini: {
      keyLabel: 'Gemini API Key',
      required: 'Gemini API keyは必須です'
    },
    avatar: {
      serverLabel: 'アバター間通信サーバーを起動する'
    },
    buttons: {
      exit: '終了',
      prev: '戻る',
      next: '次へ',
      save: '保存',
      done: '完了'
    }
  },
  trigger:{
    Startup:'起動時',
    TalkAfterMin:'会話後の指定分数後',
    IfContextExists: '指定コンテキスト発生時',
    IfSummaryCounterOver:'サマリ実行後にコンテキスト数',
    IfExtTalkCounterOver:'外部会話がコンテキスト数',
    TimerMin:'指定分数後',
    DayTimeDirect: '今日の指定時間',
    DateTimeDirect: '指定日時'
  }
}
