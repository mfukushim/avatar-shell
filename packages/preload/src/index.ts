import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer} from 'electron';
import {
  type AlertReply,
  type AlertTask,
  AsMessage,
  AvatarSetting, type DaemonTriggerSchema, type McpInfo,
  type MutableSysConfig,
  type SysConfig, SysConfigMutable, type ToolCallParam,
} from '../../common/Def.js';
import {io, Socket} from 'socket.io-client';
import {defaultAvatarSetting, defaultSysSetting} from '../../common/DefaultSetting.js';
// @ts-ignore
import expand_template from 'expand-template';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';

const expand = expand_template();

//  https://modelcontextprotocol.io/specification/2025-03-26/server/resources#resource-contents
export interface McpResource {
  contents: {
    mimeType: string,
    text?: string,
    uri: string,
    blob?: string
  }[]
}

// region --- Variables ---
let sysConfig: SysConfig | undefined = undefined;
export let avatarId = '';
export let userName: string | undefined;
export let avatarName: string | undefined;

let socket: Socket | undefined = undefined;
let socketState = false;
let socketStateCallback: (state: boolean) => void;
let avatarSetting: AvatarSetting | undefined;

export {sha256sum, versions};

// endregion --- Variables ---
// region --- Window Operations ---

/**
 * ウィンドウを最小化する
 */
export const minimize = async () => {
  await ipcRenderer.invoke('request-window-min');
};

/**
 * ウィンドウの最大化/解除を切り替える
 */
export const toggleMaximize = async () => {
  await ipcRenderer.invoke('request-window-max');
};

/**
 * アプリケーションを終了する
 */
export const closeApp = async () => {
  await ipcRenderer.invoke('request-window-close', avatarId);
};

// endregion --- Window Operations ---

// region --- Avatar Settings & Operations ---

/**
 * 現在のアバター設定を取得する
 * @returns アバター設定
 */
export function currentAvatarSetting() {
  return avatarSetting;
}

/**
 * 会話コンテキストを取得する
 * @returns メッセージの配列
 */
export async function getTalkContext() {
  const result: AsMessage[] = await ipcRenderer.invoke('GetTalkContext', avatarId);
  return result;
}

/**
 * 外部からの会話コンテキストを追加する
 * @param bags 追加するメッセージの配列
 */
export async function addExtTalkContext(bags: AsMessage[]) {
  await ipcRenderer.invoke('addExtTalkContext', avatarId, bags);
}

/**
 * アバター設定を保存する
 * @param id アバターID
 * @param conf 設定内容
 */
export async function setAvatarConfig(id: string, conf: AvatarSetting) {
  await ipcRenderer.invoke('setAvatarConfig', id, conf);
}

/**
 * アバター設定をコピー（複製）する
 * @param templateId コピー元のテンプレートID
 * @returns 新しいテンプレートID
 */
export async function copyAvatarConfig(templateId: string): Promise<string> {
  return await ipcRenderer.invoke('copyAvatarConfig', templateId);
}

/**
 * アバター設定を削除する
 * @param templateId 削除するテンプレートID
 * @returns 処理結果メッセージ
 */
export async function deleteAvatarConfig(templateId: string): Promise<string> {
  return await ipcRenderer.invoke('deleteAvatarConfig', templateId);
}

/**
 * 指定されたIDのアバター設定を取得する
 * @param id アバターID
 * @returns アバター設定
 */
export async function getAvatarConfig(id: string) {
  try {
    const av = await ipcRenderer.invoke('getAvatarConfig', id) as AvatarSetting | undefined;
    return av || defaultAvatarSetting[0].data;
  } catch (e) {
    return defaultAvatarSetting[0].data;
  }
}

/**
 * 利用可能なアバター設定の一覧を取得する
 * @returns テンプレートIDと名前のリスト
 */
export async function getAvatarConfigList(): Promise<{templateId: string, name: string}[]> {
  try {
    const av = await ipcRenderer.invoke('getAvatarConfigList') as {templateId: string, name: string}[] | undefined;
    return av || [];
  } catch (e) {
    return [];
  }
}

/**
 * 現在動作しているアバターの一覧を取得する
 * @returns アバター情報のリスト
 */
export async function getCurrentAvatarList(): Promise<{id: string, name: string, templateId: string}[]> {
  try {
    const av = await ipcRenderer.invoke('getCurrentAvatarList') as {
      id: string,
      name: string,
      templateId: string
    }[] | undefined;
    return av || [];
  } catch (_) {
    return [];
  }
}

/**
 * テンプレートIDからデフォルトの名前を計算する
 * @param templateId テンプレートID
 * @returns デフォルトの名前
 */
export async function calcDefaultName(templateId: string): Promise<string> {
  return await ipcRenderer.invoke('calcDefaultName', templateId);
}

/**
 * 新しいアバターを追加する
 * @param templateId テンプレートID
 * @param name アバター名
 * @returns 処理結果
 */
export async function addAvatar(templateId: string, name: string) {
  return await ipcRenderer.invoke('addAvatar', templateId, name);
}

/**
 * アバターを停止する
 */
export async function stopAvatar() {
  return await ipcRenderer.invoke('stopAvatar', avatarId);
}

/**
 * アバター設定をエクスポートする
 * @param templateId テンプレートID
 */
export async function exportAvatar(templateId: string) {
  return await ipcRenderer.invoke('exportAvatar', templateId);
}

/**
 * アバター設定をインポートする
 */
export async function importAvatar() {
  return await ipcRenderer.invoke('importAvatar');
}

/**
 * MCP更新用のアバター設定を取得する
 * @param templateId テンプレートID
 * @returns アバター設定
 */
export async function getAvatarConfigMcpUpdate(templateId: string): Promise<AvatarSetting> {
  return await ipcRenderer.invoke('getAvatarConfigMcpUpdate', templateId);
}

// endregion --- Avatar Settings & Operations ---

// region --- System Settings ---

/**
 * システム設定を保存する
 * @param conf システム設定
 */
export async function setSysConfig(conf: SysConfig) {
  sysConfig = conf;
  await ipcRenderer.invoke('setSysConfig', conf);
}

/**
 * システム設定を取得する
 * @returns システム設定
 */
export async function getSysConfig(): Promise<SysConfig> {
  try {
    if (sysConfig) {  //   && sysConfig?.version
      return sysConfig;
    }
    sysConfig = await ipcRenderer.invoke('getSysConfig') as any | undefined;
    if (!sysConfig) {
      sysConfig = defaultSysSetting;
    }
  } catch (_) {
    sysConfig = defaultSysSetting;
  }
  return sysConfig;
}

/**
 * ユーザー名とアバター名を設定する
 * @param setting ユーザー名とアバター名のオブジェクト
 */
export async function setNames(setting: {userName?: string, avatarName?: string}) {
  await ipcRenderer.invoke('setNames', avatarId, setting);
}

/**
 * 変更可能なシステム設定を更新する
 * @param conf 更新する設定項目
 */
export async function updateMutableSetting(conf: MutableSysConfig) {
  await ipcRenderer.invoke('updateMutableSetting', conf);
}

/**
 * 変更可能なシステム設定を取得する
 * @returns 設定項目
 */
/*
export async function getMutableSetting() {
  try {
    sysConfig = await ipcRenderer.invoke('getMutableSetting') as MutableSysConfig | undefined;
  } catch (e) {
    sysConfig = {};
  }
  return sysConfig;
}
*/

/**
 * 現在のユーザー名を取得する
 * @returns ユーザー名
 */
export function getUserName() {
  return userName || `${avatarName}'s user` || 'user';
}

/**
 * システム設定をインポートする
 */
export async function importSysConfig() {
  return await ipcRenderer.invoke('importSysConfig');
}

/**
 * システム設定をエクスポートする
 */
export async function exportSysConfig() {
  return await ipcRenderer.invoke('exportSysConfig');
}

// endregion --- System Settings ---
// region --- MCP (Model Context Protocol) ---

/**
 * MCPツールを呼び出す
 * @param params 呼び出しパラメータ
 * @param genId ジェネレーションID
 * @returns 実行結果文字列
 */
export async function callMcpTool(params: ToolCallParam, genId: string): Promise<string> {
  return await ipcRenderer.invoke('callMcpTool', avatarId, params, genId);
}

/**
 * MCPツールを直接呼び出す
 * @param params 呼び出しパラメータ
 * @returns 実行結果オブジェクト
 */
export async function callMcpToolDirect(params: ToolCallParam): Promise<{name: string, callId: string, results: CallToolResult, req: ToolCallParam, resourceHtml: string | undefined, mediaUrl: string | undefined}> {
  return await ipcRenderer.invoke('callMcpToolDirect', avatarId, params);
}

/**
 * MCPサーバー情報のリストを取得する
 * @returns MCPサーバー情報の配列
 */
export async function getMcpServerInfos() {
  return await ipcRenderer.invoke('getMcpServerInfos') as McpInfo[]
}

/**
 * MCPリソースを読み込む
 * @param name リソース名
 * @param url リソースURL
 * @returns MCPリソース
 */
export async function readMcpResource(name: string, url: string) {
  return await ipcRenderer.invoke('readMcpResource', avatarId, userName, name, url) as McpResource;
}

//  endregion --- MCP (Model Context Protocol) ---
// region --- Socket Communication ---

/**
 * Socket.ioのインスタンスを作成する
 */
function makeSocket() {
  if (avatarSetting?.general.remoteServer) {
    socket = io(avatarSetting?.general.remoteServer);
  } else if (sysConfig?.websocket.useServer) {
    socket = io(`http://127.0.0.1:${sysConfig.websocket.serverPort || 3010}`);
  }
}

/**
 * Socketの接続状態を設定する
 * @param state 接続する場合はtrue
 */
export function setSocketConnect(state: boolean) {
  if (socket) {
    if (state) {
      makeSocket()
      socket.connect()
    } else {
      socket.disconnect()
      socket = undefined
    }
  }
}

/**
 * Socket経由でメッセージを送信する
 * @param mes 送信するメッセージの配列
 */
export async function sendSocket(mes: AsMessage[]) {
  if (mes.length === 0) return;
  if (socket) {
    const nextMes = mes.map(value => {
      return {
        ...value,
        asClass: 'com',
        content: {
          ...value.content,
          from: `com:${value.content?.from}`,
          mediaBin: undefined,
        }
      } as AsMessage
    })
    let retry = 3
    while (retry > 0) {
      try {
        await socket.emitWithAck('asMessage', nextMes)
        return
      } catch (e) {
        console.log('sendSocket error', e);
        socket.connect()
        retry--
      }
    }
    console.log('sendSocket error retry over');
  }
}
// endregion --- Socket Communication ---
// region --- Event Listeners ---

/**
 * アバター初期化イベントを購読する
 * @param callback 初期化完了時のコールバック
 * @param socketCallback Socketメッセージ受信時のコールバック
 */
export function onInitAvatar(callback: (name: string, needWizard: boolean, userName?: string) => Promise<any>, socketCallback: (bags: AsMessage[]) => Promise<any>) {
  ipcRenderer.on('init-avatar', async (_event, id, name, avatarSettingIn, needWizard, user) => {
    avatarId = id;
    avatarSetting = avatarSettingIn
    userName = user;
    avatarName = name;
    sysConfig = await getSysConfig()
    await callback(name, needWizard);

    function setSocketState(state: boolean) {
      socketState = state;
      if (socketStateCallback) {
        socketStateCallback(socketState);
      }
    }

    if (avatarSetting?.general.useSocket) {
      makeSocket();
      if (socket) {
        socket.on('connect', () => {
          console.log('connect client:', socket?.id);
          setSocketState(true);
        })
        socket.on('asMessage', async (mes: AsMessage[]) => {
          const extMes = mes.map(value => ({
            ...value,
            asClass: 'com',
            asRole: 'human',
            content: {
              ...value.content,
              isExternal: true,
              text: value.content.text && sysConfig?.websocket?.textTemplate ?
                expand(sysConfig.websocket.textTemplate, {
                  from: value.content.from,
                  body: value.content.text,
                }) : undefined
            }
          } as AsMessage))

          await socketCallback(extMes);
        })
        socket.on('disconnect', () => {
          console.log('disconnect client:', socket?.id);
          setSocketState(false);
        })
        socket.on('connect_error', (err: any) => {
          console.log('connect_error client:', err);
          setSocketState(false);
        })
      }
    } else {
      setSocketState(false);
    }
  });
}

/**
 * LLM更新イベントを購読する
 * @param callback 更新時のコールバック
 */
export function onUpdateLlm(callback: (bag: AsMessage[]) => Promise<any>) {
  ipcRenderer.on('update-llm', async (_event, bags: AsMessage[]) => {
    await callback(bags);
    const com = bags.filter(t => (t.asRole === 'human' || t.asRole === 'bot') && t.asContext === 'surface');
    await sendSocket(com)
  });
}

/**
 * メインプロセスからのアラートイベントを購読する
 * @param callback アラート受信時のコールバック
 */
export function onMainAlert(callback: (task: AlertTask) => void) {
  ipcRenderer.on('mainAlert', async (_event, task) => {
    callback(task);
  });
}

/**
 * Socket接続状態変更イベントを購読する
 * @param callback 状態変更時のコールバック
 */
export function onSocketState(callback: (state: boolean) => void) {
  socketStateCallback = callback
}

/**
 * テスト用アイドルイベントを購読する
 * @param callback アイドル時のコールバック
 */
export function onTestIdle(callback: (mes: string) => any) {
  ipcRenderer.on('test-idle', (_event, mes) => {
    callback(mes);
  });
}

// endregion --- Event Listeners ---
// region --- Documents & Media ---

/**
 * ドキュメントリストを読み込む
 * @returns ファイル名の配列
 */
export async function readDocList() {
  if (avatarSetting?.templateId) {
    return await ipcRenderer.invoke('readDocList', avatarSetting.templateId) as string[];
  }
  return [];
}

/**
 * ドキュメントを読み込む
 * @param fileName ファイル名
 * @returns メッセージの配列
 */
export async function readDocument(fileName: string) {
  if (avatarSetting?.templateId) {
    return await ipcRenderer.invoke('readDocument', avatarSetting.templateId, fileName) as AsMessage[];
  }
  return [];
}

/**
 * ドキュメントメディアを読み込む
 * @param fileUrl ファイルURL
 * @returns Base64データ文字列
 */
export async function readDocMedia(fileUrl: string) {
  return await ipcRenderer.invoke('readDocMedia', fileUrl) as string;
}

/**
 * メディアURLを取得する（データURI形式）
 * @param mime MIMEタイプ
 * @param mediaUrl メディアURL
 * @returns データURI
 */
export async function getMediaUrl(mime: string, mediaUrl: string) {
  if (mediaUrl) {
    const media = await readDocMedia(mediaUrl)
    return `data:${mime};base64,${media}`
  }
  return '';
}

// endregion --- Documents & Media ---
// region --- Others ---

/**
 * メインプロセスのアラートに回答する
 * @param id アラートID
 * @param reply 回答内容
 * @param btn 押されたボタン
 */
export async function answerMainAlert(id: string, reply: AlertReply, btn: string) {
  return await ipcRenderer.invoke('answerMainAlert', id, reply, btn)
}

/**
 * スケジュールリストを取得する
 * @returns ステータスとスケジュールのリスト
 */
export async function getScheduleList() {
  return await ipcRenderer.invoke('getScheduleList', avatarId) as {status: string, list: {id: string, name: string, trigger: DaemonTriggerSchema}[]}
}

/**
 * スケジュールをキャンセルする
 * @param id スケジュールID
 */
export async function cancelSchedule(id: string) {
  return await ipcRenderer.invoke('cancelSchedule', avatarId, id);
}

/**
 * 利用可能なジェネレータのリストを取得する
 */
export async function getGeneratorList() {
  return await ipcRenderer.invoke('getGeneratorList');
}

/**
 * アプリケーションのバージョンを取得する
 */
export async function getVersion() {
  return await ipcRenderer.invoke('getVersion');
}

/**
 * ロケールを取得する
 */
export async function getLocale(): Promise<string> {
  return await ipcRenderer.invoke('getLocale');
}

/**
 * 設定保存先のパスを取得する
 */
export async function getPreferencePath(): Promise<string> {
  return await ipcRenderer.invoke('getPreferencePath');
}

/**
 * 設定をリセットする
 * @param all 全てリセットする場合はtrue
 */
export async function resetPreference(all: boolean): Promise<string> {
  return await ipcRenderer.invoke('resetPreference', all);
}

/**
 * ページ内検索を行う
 * @param text 検索テキスト
 */
export async function findInPage(text: string): Promise<string> {
  return await ipcRenderer.invoke('findInPage', avatarId, text);
}

/**
 * AIに質問する
 * @param mes メッセージの配列
 * @returns 回答メッセージの配列
 */
export async function doAskAi(mes: AsMessage[]) {
  return await ipcRenderer.invoke('AskAi', avatarId, mes) as AsMessage[];
}

/**
 * ブラウザでURLを開く
 * @param url URL
 */
export async function openBrowser(url: string) {
  return await ipcRenderer.invoke('openBrowser', url);
}

// endregion --- Others ---
