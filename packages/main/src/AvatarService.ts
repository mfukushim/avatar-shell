import {Effect, HashMap, Option, Queue, Ref} from 'effect';
import {AvatarState} from './AvatarState.js';
import {ConfigService} from './ConfigService.js';
import short from 'short-uuid';
import {BrowserWindow} from 'electron';
import {AsMessage, AsOutput} from '../../common/Def.js';
import {DocService} from './DocService.js';
import * as os from 'node:os';
import {defaultAvatarSetting} from '../../common/DefaultSetting.js';
import electronLog from 'electron-log';

export class AvatarService extends Effect.Service<AvatarService>()('avatar-shell/AvatarService', {
  accessors: true,
  effect: Effect.gen(function* () {
    electronLog.log('AvatarService start')
    const avatars = yield* Ref.make(HashMap.empty<string, AvatarState>());
    const avatarStartupQueue = yield* Queue.dropping<{templateId: string, name: string}>(10);


    function deleteAvatar(avatarId: string) {
      //  TODO 何かシャットダウンする処理はあるか?
      return Ref.update(avatars, a => HashMap.mutate(a, m => HashMap.remove(m, avatarId)));
    }

    function getTalkContext(avatarId: string) {
      return avatars.pipe(
        Ref.get, Effect.andThen(HashMap.get(avatarId)),
        Effect.andThen(a => a.TalkContextEffect))
    }

    function addExtTalkContext(avatarId: string,bags:AsMessage[]) {
      return Effect.gen(function*() {
        const m = yield *Ref.get(avatars)
        const state = yield *HashMap.get(m,avatarId)
        yield *state.addContext(bags,true)
        yield* DocService.addLog(bags.map(value => (AsOutput.makeOutput(value,{
          provider:'emptyText', //  無効値を持たせたいが
          model:'none',
          isExternal:true,
        }))), state);
      })
    }

    function getScheduleList(avatarId: string) {
      return avatars.pipe(
        Ref.get, Effect.andThen(HashMap.get(avatarId)),
        // Effect.tap(a => console.log('in getScheduleList',a.TemplateId,a.Name)),
        Effect.andThen(a => a.ScheduleList),
        Effect.andThen(a => ({list:a,status:'ok'}) ),
        Effect.catchTag("NoSuchElementException",() => Effect.succeed({status:'Wait a moment',list:[]}))
      )
    }

    function cancelSchedule(avatarId: string,id:string) {
      return avatars.pipe(
        Ref.get, Effect.andThen(HashMap.get(avatarId)),
        Effect.tap(a => console.log('in cancelSchedule',a.TemplateId,a.Name)),
        Effect.andThen(a => a.cancelSchedule(id))
      )
    }

    function getCurrentAvatarList() {
      // electronLog.log('in getCurrentAvatarList:',avatars);
      return avatars.pipe(Ref.get, Effect.andThen(HashMap.entries), Effect.andThen(a => Array.from(a)), Effect.andThen(a => a.map(a => ({
        id: a[0],
        name: a[1].Name,
        templateId: a[1].TemplateId,
      }))));
    }

    function calcDefaultName(tempId: string) {
      return Effect.gen(function* () {
        //  TODO ここで渡すidはtemplateのidではなくavatarのユニークidだからuuid
        const currentList = yield* getCurrentAvatarList();
        console.log('getCurrentAvatarList:', currentList);
        const aConfig = yield* ConfigService.getAvatarConfig(tempId);
        let sameAvatarNum = 0;
        currentList.forEach(a => {
          if (a.templateId === tempId) sameAvatarNum++;
        });

        let tempName = aConfig.general.name;
        while (currentList.find(v => v.name === tempName)) {
          sameAvatarNum++;
          tempName = `${aConfig.general.name}-${sameAvatarNum > 0 ? sameAvatarNum : ''}`;
        }
        console.log('sameAvatarNum:', sameAvatarNum, tempName);
        return tempName;
      });

    }

    function setNames(avatarId:string,setting:{userName?:string,avatarName?:string}) {
      return avatars.pipe(
        Ref.get, Effect.andThen(HashMap.get(avatarId)),
        Effect.andThen(a => a.setNames(setting))
      )

    }

    function addAvatarQueue(parms: {templateId: string, name: string}) {
      return Queue.offer(avatarStartupQueue, parms);
    }

    function pullAvatarQueue() {
      return Queue.poll(avatarStartupQueue);
    }

    function makeAvatar(window: BrowserWindow) {
      // electronLog.log('in makeAvatar',window)
      return Effect.gen(function* () {
        const param = yield* pullAvatarQueue();
        let tempId;
        let name:string;

        if (Option.isSome(param)) {
          tempId = param.value.templateId;
          name = param.value.name;
        } else {
          const sys = yield* ConfigService.getSysConfig();
          tempId = sys?.defaultAvatarId;
          if (!tempId) {
            const configList = yield *getCurrentAvatarList();
            electronLog.log(configList);
            if (configList.length === 0) {
              tempId = defaultAvatarSetting[0].data.templateId
            } else {
              tempId = configList[0].templateId
            }
          }
          name = yield* calcDefaultName(tempId);
        }

        const userName = os.userInfo().username;

        // electronLog.log('userName',userName);
        const id = short().generate();
        const avatarState = yield* AvatarState.make(id, tempId, name, window,userName);
        // electronLog.log('makeAvatar after');
        yield* Ref.update(avatars, a => HashMap.mutate(a, m => HashMap.set(m, id, avatarState)));
        return avatarState;
      });
    }

    function askAvatar(avatarId: string, mes: AsMessage[]) {
      return Effect.gen(function*() {
        const state = yield *avatars.pipe(Ref.get,Effect.andThen(HashMap.get(avatarId)))
        //  TODO ここに入る画像、ファイル類はブラウザrender側から直接届いているものなので、ここで実ファイルに落として、url化しておいたほうがよい
        yield *state.addContext(mes)
        // const logs = mes.map(value => AsOutput.makeOutput(value,{
        //   model:'none',
        //   isExternal:false,
        // }))
        // yield *DocService.addLog(logs, state)
        // const out = yield *state.askAi(mes)
        yield *state.rebuildIdle()
        return []
        // return out
      })
    }

    function findInPage(avatarId:string,text:string) {
      return avatars.pipe(Ref.get,Effect.andThen(HashMap.get(avatarId)),
        Effect.andThen(a => {
          if (a && a.BrowserWindow) {
            a.BrowserWindow.webContents.findInPage(text)
          }
        })
      )
    }

  // electronLog.log('AvatarService end')

    return {
      makeAvatar,
      askAvatar,
      getTalkContext,
      addExtTalkContext,
      getCurrentAvatarList,
      calcDefaultName,
      addAvatarQueue,
      deleteAvatar,
      getScheduleList,
      cancelSchedule,
      findInPage,
      setNames,
    }
  })
}) {}


export const AvatarServiceLive = AvatarService.Default;
