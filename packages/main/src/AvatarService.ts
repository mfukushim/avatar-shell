/*! avatar-shell | Apache-2.0 License | https://github.com/mfukushim/avatar-shell */
import {Effect, HashMap, Option, Queue, Ref} from 'effect';
import {AvatarState} from './AvatarState.js';
import {ConfigService} from './ConfigService.js';
import short from 'short-uuid';
import {BrowserWindow} from 'electron';
import {AsMessage} from '../../common/Def.js';
import * as os from 'node:os';
import {defaultAvatarSetting} from '../../common/DefaultSetting.js';

export class AvatarService extends Effect.Service<AvatarService>()('avatar-shell/AvatarService', {
  accessors: true,
  effect: Effect.gen(function* () {
    const avatars = yield* Ref.make(HashMap.empty<string, AvatarState>());
    const avatarStartupQueue = yield* Queue.dropping<{templateId: string, name: string}>(10);


    /**
     * アバター削除
     * Deletes an avatar with the specified avatarId from the avatars collection.
     *
     * @param {string} avatarId - The unique identifier of the avatar to delete.
     * @return {Promise} A promise that resolves when the avatar is successfully deleted or rejects with an error if the operation fails.
     */
    function deleteAvatar(avatarId: string) {
      //  TODO 何かシャットダウンする処理はあるか?
      return Ref.update(avatars, a => HashMap.mutate(a, m => HashMap.remove(m, avatarId)));
    }

    /**
     * 該当アバターの会話コンテキスト
     * Retrieves the talk context of an avatar based on the provided avatar ID.
     *
     * @param {string} avatarId - The unique identifier of the avatar.
     * @return {Effect} An Effect that emits the talk context effect of the specified avatar.
     */
    function getTalkContext(avatarId: string) {
      return getAvatarState(avatarId).pipe(
        // Ref.get, Effect.andThen(HashMap.get(avatarId)),
        Effect.andThen(a => a.TalkContextEffect))
    }

    /**
     * avatarState取得
     * Retrieves the state of a specified avatar using its unique identifier.
     *
     * @param {string} avatarId - The unique identifier of the avatar whose state is to be retrieved.
     * @return {Effect} An effect that resolves with the avatar state if found, or fails with an error if the avatar ID does not exist.
     */
    function getAvatarState(avatarId: string) {
      return avatars.pipe(
        Ref.get,
        Effect.andThen(HashMap.get(avatarId)),
        Effect.catchAll( e => Effect.fail(new Error('getAvatarState no id'+e.message))))
    }

    /**
     * 外部会話の追加(AsMessage形式)
     * Adds extended talk context for a specified avatar.
     *
     * This method retrieves the current state of the avatar, extends and saves a context using the provided bags,
     * and then adds the newly extended context to the avatar's state.
     *
     * @param {string} avatarId - The unique identifier of the avatar for which the context is being modified.
     * @param {AsMessage[]} bags - An array of messages used to extend the avatar's context.
     * @return {Effect} A generator effect that modifies the avatar's context.
     */
    function addExtTalkContext(avatarId: string,bags:AsMessage[]) {
      return Effect.gen(function*() {
        const state = yield *getAvatarState(avatarId)
        const ext = yield *state.extendAndSaveContext(bags,true)
        yield *state.addContext(ext)
      })
    }

    /**
     * 現在のデーモンスケジュール一覧
     * Retrieves the schedule list for a given avatar ID.
     *
     * @param {string} avatarId - The unique identifier of the avatar whose schedule list is to be retrieved.
     * @return {Effect} An Effect that resolves to the schedule list and status. If successful, it returns an object containing the list and a status of 'ok'. If there is an error, it returns an object with a status of 'Wait a moment' and an empty list.
     */
    function getScheduleList(avatarId: string) {
      return getAvatarState(avatarId).pipe(
        Effect.andThen(a => a.ScheduleList),
        Effect.andThen(a => ({list:a,status:'ok'}) ),
        Effect.catchAll(() => Effect.succeed({status:'Wait a moment',list:[]}))
      )
    }

    /**
     * デーモンスケジュールキャンセル(未動作)
     * Cancels a specific schedule associated with an avatar.
     *
     * @param {string} avatarId - The unique identifier of the avatar whose schedule needs to be canceled.
     * @param {string} id - The identifier of the schedule to be canceled.
     * @return {Effect} An Effect void that represents the state of the operation, including potential effects from the cancellation process.
     */
    function cancelSchedule(avatarId: string,id:string) {
      return getAvatarState(avatarId).pipe(
        // Ref.get, Effect.andThen(HashMap.get(avatarId)),
        // Effect.tap(a => console.log('in cancelSchedule',a.TemplateId,a.Name)),
        Effect.andThen(a => a.cancelSchedule(id))
      )
    }

    /**
     * 実行中アバター一覧
     * Retrieves the current list of avatars with their associated details.
     *
     * @return {Array<Object>} An array of avatar objects, where each object contains:
     * - `id`: The unique identifier of the avatar.
     * - `name`: The name of the avatar.
     * - `templateId`: The template identifier of the avatar.
     */
    function getCurrentAvatarList() {
      return avatars.pipe(Ref.get, Effect.andThen(HashMap.entries), Effect.andThen(a => Array.from(a)), Effect.andThen(a => a.map(a => ({
        id: a[0],
        name: a[1].Name,
        templateId: a[1].TemplateId,
      }))));
    }

    /**
     * デフォルトアバター名生成
     * Calculates a default name for an avatar based on the provided template ID.
     * Checks the current avatar list for existing names and ensures the generated name is unique.
     *
     * @param {string} tempId - The template ID of the avatar to generate a name for.
     * @return {Promise<string>} A promise that resolves to the unique default name for the avatar.
     */
    function calcDefaultName(tempId: string) {
      return Effect.gen(function* () {
        const currentList = yield* getCurrentAvatarList();
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
        return tempName;
      });

    }

    /**
     * アバター名設定
     * Updates the names associated with the specified avatar by applying the provided settings.
     *
     * @param {string} avatarId - The unique identifier of the avatar.
     * @param {{userName?: string, avatarName?: string}} setting - An object containing the optional userName and/or avatarName to update.
     * @return {void} An void representing the updated state of the avatar after applying the name changes.
     */
    function setNames(avatarId:string,setting:{userName?:string,avatarName?:string}) {
      return getAvatarState(avatarId).pipe(
        Effect.andThen(a => a.setNames(setting))
      )
    }

    /**
     * アバター生成前準備
     * Adds an avatar creation request to the startup queue.
     *
     * @param {Object} parms An object containing the details of the avatar to be added to the queue.
     * @param {string} parms.templateId The ID of the avatar template to be used.
     * @param {string} parms.name The name of the avatar.
     * @return {boolean} Returns true if the avatar is successfully added to the queue, otherwise false.
     */
    function addAvatarQueue(parms: {templateId: string, name: string}) {
      return Queue.offer(avatarStartupQueue, parms);
    }

    /**
     * アバターインスタンス生成
     * Creates a new avatar instance with the specified settings. If no parameter is provided,
     * defaults are used to generate the avatar.
     *
     * @param {BrowserWindow|null} window - The browser window instance where the avatar will be created. Can be null.
     * @return {Effect} Returns an effect that resolves to the created avatar state.
     */
    function makeAvatar(window: BrowserWindow|null) {
      return Effect.gen(function* () {
        const param = yield* Queue.poll(avatarStartupQueue);
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
            if (configList.length === 0) {
              tempId = defaultAvatarSetting[0].data.templateId
            } else {
              tempId = configList[0].templateId
            }
          }
          name = yield* calcDefaultName(tempId);
        }

        const userName = os.userInfo().username;
        const id = short().generate();
        const avatarState = yield* AvatarState.make(id, tempId, name, window,userName);
        yield* Ref.update(avatars, a => HashMap.mutate(a, m => HashMap.set(m, id, avatarState)));
        return avatarState;
      });
    }

    /**
     * アバターへの会話送信
     * Asks an avatar to process and handle a provided message sequence.
     *
     * @param {string} avatarId - The unique identifier of the avatar being addressed.
     * @param {AsMessage[]} mes - An array of messages to be processed by the avatar.
     * @return {Effect} An effectful computation that yields an empty array after
     *                  completing the avatar's handling of the provided messages.
     */
    function askAvatar(avatarId: string, mes: AsMessage[]) {
      return Effect.gen(function*() {
        // const state = yield *avatars.pipe(Ref.get,Effect.andThen(HashMap.get(avatarId)))
        console.log('askAvatar:',mes);
        const state = yield *getAvatarState(avatarId)
        const ext = yield *state.extendAndSaveContext(mes,true)
        yield *state.addContext(ext);
        // yield *state.addContext(mes,true)
        yield *state.rebuildIdle()
        return []
      })
    }

    /**
     * Electron画面上を指定の文字列で検索ハイライトする
     * Searches for the given text within the webpage displayed by the browser window of the specified avatar.
     *
     * @param {string} avatarId - The unique identifier of the avatar whose browser window will be used for the search.
     * @param {string} text - The text string to find within the current webpage displayed in the browser.
     * @return {Effect} Returns an Effect void that represents the result of the find operation.
     */
    function findInPage(avatarId:string,text:string) {
      return getAvatarState(avatarId).pipe(//Ref.get,Effect.andThen(HashMap.get(avatarId)),
        Effect.andThen(a => {
          if (a && a.BrowserWindow) {
            a.BrowserWindow.webContents.findInPage(text)
          }
        })
      )
    }

    /**
     * アバター終了
     * Stops the avatar's activity based on the given avatar ID.
     *
     * @param {string} avatarId - The unique identifier for the avatar to be stopped.
     * @return {Effect} An Effect void that handles the stopping of the avatar and returns its updated state.
     */
    function stopAvatar(avatarId:string) {
      return getAvatarState(avatarId).pipe( //Ref.get,Effect.andThen(HashMap.get(avatarId)),
        Effect.andThen(a => a.stopAvatar()))
    }

    return {
      getAvatarState,
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
      stopAvatar,
    }
  })
}) {}


export const AvatarServiceLive = AvatarService.Default;
