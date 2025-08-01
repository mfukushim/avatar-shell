
export default {
  avatar: "アバター",
  avatars: 'アバター',
  defaultAvatar: '既定のアバターテンプレート',
  avatarTemplateName: 'アバターひな形名',
  avatarTemplateEdit: 'アバターひな形編集',
  editAvatarTemplate: '編集するアバターひな形',
  generatorUsageLimit:'ジェネレーター使用回数上限',
  name: '名称',
  enable: '有効',
  conditions:'条件',
  edit: '編集',
  copyAndAdd: 'コピーして追加',
  delete: '削除',
  close: '閉じる',
  cancel: 'キャンセル',
  ok: 'OK',
  min:'分',
  convNum:'検出会話数',
  loop:'繰り返し',
  time:'時刻',
  date:'日付',
  execution:'実行',
  deleteAvatarConfirm: '{name}を削除しますか？',
  // システム設定
  systemSetting: 'システム設定',
  generalSettings: '全体設定',
  general: '一般',
  contextGenerator: 'ｺﾝﾃｷｽﾄｼﾞｪﾈﾚｰﾀｰ',
  contextDaemon: 'ｺﾝﾃｷｽﾄﾃﾞｰﾓﾝ',
  contextDaemonLabel: 'コンテキストデーモン設定',
  contextGeneratorCommonSettings: 'コンテキストジェネレータ共通設定',
  generatorCommonSettingsDescription: 'ジェネレータ(LLM含む)の共通設定をします',
  generatorName: 'ジェネレーター名',
  selectContextLine: '出力するコンテキスト線を選択',
  outputContextAttr: '出力コンテキスト属性',
  outputClass: '出力クラス',
  outputRole: '出力ロール',
  outputContext: '出力コンテキスト線',
  addContextDaemon:'コンテキストデーモンを追加',
  mcpSettings: 'MCP設定',
  mcpPermission: 'MCP認可',
  setMcpPermissions: 'MCPの権限を設定します',
  mcpNotice: '注意: MCPはセキュリティと動作安全性の上でリスクがあります。リスクを判断の上、使用するか判断してください。',
  avatarCommunication: 'アバター間通信',
  openSourceNotice: 'このソフトウェアは次のオープンソースソフトウェアを使用しています。',
  baseElectronBoilerplate: 'Electronボイラープレート',
  apiKey: 'APIキー',
  textModel: 'テキストモデル名',
  imageModel: '画像モデル名',
  voiceModel: '音声モデル名',
  voice: '音声名',
  voiceCutoffTextLimit:'音声再生切り捨て長さ(未指定時 150)',
  addMcpDef:'MCPを追加',
  mcpName: 'MCP設定名',
  onlyAlphaNum:'(半角英数字のみ)',
  mcpJson:'MCP定義JSON',
  avatarCom:'アバター間通信',
  startSocketIoServer:'ローカルsocket.ioサーバーを起動する',
  portNumber:'ポート番号',
  useWebSocketCommunication: 'アバター間通信を使用する',
  remoteServerAddress:'リモート socket.io サーバー (空の場合は localServer を使用、例: http://192.168.1.10:3000 )',
  noteSecurityCom:'アバター間通信には通信の暗号化を付けていません。',
  importExtTalk: '外部通信コンテキスト取込み',
  templateImportExtTalk: '外部通信取込みテンプレート',
  license:'ライセンス',
  openaiImageNotice: '(OpenAIの画像生成の認証が必要です)',
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
    DateTimeDirect: '指定日時',
    selectCondition:'起動条件を選択してください'
  }
}
