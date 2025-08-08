import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer} from 'electron';
import {
  type AlertReply,
  type AlertTask,
  AsMessage,
  AvatarSetting, type DaemonTriggerSchema, type McpInfo,
  type MutableSysConfig,
  type SysConfig,
} from '../../common/Def.js';
import {io, Socket} from 'socket.io-client';
import {defaultAvatarSetting, defaultSysSetting} from '../../common/DefaultSetting.js';
//  @ts-ignore
// import expand_template from 'expand-template';
//
// const expand = expand_template();

//  https://modelcontextprotocol.io/specification/2025-03-26/server/resources#resource-contents
export interface McpResource {
  contents: {
    mimeType: string,
    text?: string,
    uri: string,
    blob?: string
  }[]
}

export let sysConfig: any = {};
export let avatarId = '';
export let userName:string|undefined;
export let avatarName:string|undefined;

let socket: Socket | undefined = undefined;

let socketState = false;
let socketStateCallback: (state: boolean) => void;



let avatarSetting:AvatarSetting|undefined

export const minimize = async () => {
  await ipcRenderer.invoke('request-window-min');
};

export const toggleMaximize = async () => {
  await ipcRenderer.invoke('request-window-max');
};

export const closeApp = async () => {
  console.log('closeApp preload');
  await ipcRenderer.invoke('request-window-close', avatarId);
};


export function currentAvatarSetting() {
  return avatarSetting;
}

export async function getTalkContext() {
  const result: AsMessage[] = await ipcRenderer.invoke('GetTalkContext', avatarId);
  return result;
}

export async function addExtTalkContext(bags:AsMessage[]) {
  await ipcRenderer.invoke('addExtTalkContext', avatarId,bags);
}

// function send(channel: string, message: string) {
//   return ipcRenderer.invoke(channel, message);
// }

export {sha256sum, versions};

function makeSocket() {
  if (avatarSetting?.general.remoteServer) {
    console.log('remoteServer:', avatarSetting?.general.remoteServer);
    socket = io(avatarSetting?.general.remoteServer);
  } else if (sysConfig.websocket.useServer) {
    console.log('useServer:', sysConfig.websocket.useServer);
    socket = io(`http://127.0.0.1:${sysConfig.websocket.serverPort || 3000}`);
  }
}

/**
 * avatar初期化完了を受けたいコンポーネントで登録する
 * 登録コンポーネント分、複数回呼ばれる
 * @param callback
 * @param socketCallback
 */
export function onInitAvatar(callback: (name:string,needWizard:boolean,userName?:string) => Promise<any>,socketCallback:(bags:AsMessage[]) => Promise<any>) {
  ipcRenderer.on('init-avatar', async (_event, id,name, avatarSettingIn,needWizard,user) => {
    console.log('preload onInitAvatar:',id,name, avatarSettingIn,needWizard,user);
    avatarId = id;
    avatarSetting = avatarSettingIn
    userName = user;
    avatarName = name;
    sysConfig = await getSysConfig()
    await callback(name,needWizard);

    function setSocketState(state:boolean) {
      socketState = state;
      if (socketStateCallback) {
        socketStateCallback(socketState);
      }
    }

    if(avatarSetting?.general.useSocket) {
      makeSocket();
      if(socket) {
        socket.on('connect', () => {
          console.log('connect client:', socket?.id);
          setSocketState(true);
        })
        socket.on('asMessage',async (mes:AsMessage[]) => {
          console.log('received socket asMessage:',mes);
          //  socket受信テキストは asClassで comの属性を強制的に付ける
          //  テンプレート置き換えを行った上で userの発言として追加する
          const extMes = mes.map(value => {
                  // value.content.from = `com:${value.content.from}`
            // const text = value.content.text ? expand(sysConfig.websocket.textTemplate,{
            //   from: value.content.from,
            //   body: value.content.text
            // }): value.content.text
            return {
              ...value,
              asClass: 'com',
              asRole: 'human',
              content:{
                ...value.content,
                // text,
                isExternal: true,
              }
            } as AsMessage;
          })
          await socketCallback(extMes);
        })
        socket.on('disconnect', () => {
          console.log('disconnect client:', socket?.id);
          setSocketState(false);
        })
        socket.on('connect_error', (err:any) => {
          console.log('connect_error client:', err);
          setSocketState(false);
        })
      }
    } else {
      setSocketState(false);
    }
  });
}


export function setSocketConnect(state:boolean) {
  if(socket) {
    if(state) {
      makeSocket()
      socket.connect()
    } else {
      socket.disconnect()
      socket = undefined
    }
  }
}

export async function sendSocket(mes: AsMessage[]) {
  if(mes.length === 0) return;
  if(socket) {
    //  メッセージをソケット用加工 画像、画像urlは大きすぎて無理そう
    const nextMes = mes.map(value => {
      return {
        ...value,
        asClass: 'com',
        content:{
          ...value.content,
          from:`com:${value.content?.from}`,
          mediaBin:undefined,
        }

      } as AsMessage
    })
    let retry = 3
    while (retry > 0) {
      try {
        console.log('sendSocket',nextMes);
        await socket.emitWithAck('asMessage', nextMes)
        return
      } catch (e) {
        console.log('sendSocket error',e);
        socket.connect()
        retry--
      }
    }
    console.log('sendSocket error retry over');
  }
}


/**
 * 表示timelineに追加データを送る
 * @param callback
 */
export function onUpdateLlm( callback: (bag: AsMessage[]) => Promise<any>) {
  ipcRenderer.on('update-llm', async (_event, bags:AsMessage[]) => {
    // console.log('preload onUpdateLlm:', bags);
    await callback(bags);
    const com = bags.filter(t => (t.asRole === 'human' || t.asRole === 'bot') && t.asContext === 'surface');
    await sendSocket(com)
  });
}

export function onMainAlert( callback: (task:AlertTask) => void) {
  ipcRenderer.on('mainAlert', async (_event, task) => {
    console.log('preload mainAlert:',task);
    callback(task);
  });
}

export function onSocketState( callback: (state:boolean) => void) {
  socketStateCallback = callback
}

export function onTestIdle(callback: (mes: string) => any) {
  ipcRenderer.on('test-idle', (_event, mes) => {
    console.log('preload onTestIdle:', mes);
    callback(mes);
  });
}

export async function setAvatarConfig(id: string, conf: AvatarSetting) {
  await ipcRenderer.invoke('setAvatarConfig', id, conf);
}

export async function copyAvatarConfig(templateId: string):Promise<string> {
  return await ipcRenderer.invoke('copyAvatarConfig', templateId);
}

export async function deleteAvatarConfig(templateId: string):Promise<string> {
  return await ipcRenderer.invoke('deleteAvatarConfig', templateId);
}

export async function getAvatarConfig(id: string) {
  try {
    const av = await ipcRenderer.invoke('getAvatarConfig', id) as AvatarSetting | undefined;
    return av || defaultAvatarSetting[0].data;
  } catch (e) {
    console.log(e);
    return defaultAvatarSetting[0].data;
  }
}

export async function getAvatarConfigList(): Promise<{templateId: string, name: string}[]> {
  try {
    const av = await ipcRenderer.invoke('getAvatarConfigList') as {templateId: string, name: string}[] | undefined;
    return av || [];
  } catch (e) {
    console.log(e);
    return [];
  }
}

export async function setSysConfig(conf: SysConfig) {
  await ipcRenderer.invoke('setSysConfig', conf);
}

export async function getSysConfig(): Promise<SysConfig> {
  try {
    sysConfig = await ipcRenderer.invoke('getSysConfig') as any | undefined;
  } catch (e) {
    console.log('getSysConfig error', e);
    sysConfig = defaultSysSetting;  //  TODO エラー時の回復としてあまりよくない。。
  }
  return sysConfig;
}

export async function setNames(setting:{userName?:string,avatarName?:string}) {
  //  これは現在の画面のavatarしか変更できないとする
  await ipcRenderer.invoke('setNames', avatarId,setting);
}

/**
 * 変更する項目だけ設定する
 * @param conf
 */
export async function updateMutableSetting(conf: MutableSysConfig) {
  await ipcRenderer.invoke('updateMutableSetting', conf);
}

export async function getMutableSetting() {
  try {
    sysConfig = await ipcRenderer.invoke('getMutableSetting') as MutableSysConfig | undefined;
  } catch (e) {
    sysConfig = {};
  }
  return sysConfig;
}

export async function getCurrentAvatarList(): Promise<{id: string, name: string, templateId: string}[]> {
  try {
    const av = await ipcRenderer.invoke('getCurrentAvatarList') as {
      id: string,
      name: string,
      templateId: string
    }[] | undefined;
    return av || [];
  } catch (e) {
    console.log(e);
    return [];
  }
}

export async function calcDefaultName(templateId: string): Promise<string> {
  return await ipcRenderer.invoke('calcDefaultName', templateId);
}

export function getUserName() {
  return userName || `${avatarName}'s user` || 'user';
}

export async function addAvatar(templateId: string, name: string) {
  return await ipcRenderer.invoke('addAvatar', templateId, name);
}

export async function readDocList() {
  if (avatarSetting?.templateId) {
    return await ipcRenderer.invoke('readDocList', avatarSetting.templateId) as string[];
  }
  return [];
}
export async function readDocument(fileName: string) {
  if(avatarSetting?.templateId) {
    return await ipcRenderer.invoke('readDocument',avatarSetting.templateId, fileName) as AsMessage[];
  }
  return [];
}
export async function readDocMedia(fileUrl: string) {
  // console.log('readDocList');
  return await ipcRenderer.invoke('readDocMedia',fileUrl) as string;
}

export async function getMediaUrl(mime:string,mediaUrl: string) {
  if (mediaUrl) {
    const media = await readDocMedia(mediaUrl)
    return `data:${mime};base64,${media}`
  }
  return '';
}

export async function getMcpServerInfos() {
  return await ipcRenderer.invoke('getMcpServerInfos') as McpInfo[]
}
export async function answerMainAlert(id:string,reply:AlertReply,btn: string) {
  return await ipcRenderer.invoke('answerMainAlert',id,reply,btn)
}
export async function readMcpResource(name:string,url:string) {
  console.log('preload readMcpResource in', name,url);
  return await ipcRenderer.invoke('readMcpResource',avatarId,userName,name,url) as McpResource;
}

export async function getScheduleList() {
  return await ipcRenderer.invoke('getScheduleList', avatarId) as {status:string,list:{id: string, name: string, trigger: DaemonTriggerSchema}[]}
}

export async function cancelSchedule(id:string) {
  return await ipcRenderer.invoke('cancelSchedule', avatarId,id);
}

export async function getAvatarConfigMcpUpdate(templateId: string):Promise<AvatarSetting> {
  return await ipcRenderer.invoke('getAvatarConfigMcpUpdate',templateId);
}

export async function getGeneratorList() {
  return await ipcRenderer.invoke('getGeneratorList');
}

export async function getVersion() {
  return await ipcRenderer.invoke('getVersion');
}

export async function getLocale():Promise<string> {
  return await ipcRenderer.invoke('getLocale');
}

export async function findInPage(text:string):Promise<string> {
  return await ipcRenderer.invoke('findInPage',avatarId, text);
}


export async function doAskAi(mes:AsMessage[]) {
  return await ipcRenderer.invoke('AskAi', avatarId, mes) as AsMessage[];
}

export async function importSysConfig() {
  return await ipcRenderer.invoke('importSysConfig');
}

export async function exportSysConfig() {
  return await ipcRenderer.invoke('exportSysConfig');
}

export async function exportAvatar(templateId: string) {
  return await ipcRenderer.invoke('exportAvatar',templateId);
}

export async function importAvatar() {
  return await ipcRenderer.invoke('importAvatar');
}

// export async function receiveExtConversation(messages: AsMessage[]) {
//   console.log('receiveExtConversation in', messages,avatarId);
//   await ipcRenderer.invoke('ReceiveExtConversation', avatarId, messages);
// }

export async function openBrowser(url:string) {
  console.log('openBrowser in', url);
  return await ipcRenderer.invoke('openBrowser', url);
}
