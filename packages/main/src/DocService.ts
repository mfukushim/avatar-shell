import {Effect, HashMap, Queue, Ref, Stream} from 'effect';
import { FileSystem } from "@effect/platform"
import {app} from 'electron';
import path from 'node:path';
import {NodeFileSystem} from '@effect/platform-node';
import {AsOutput} from '../../common/Def.js';
import {AvatarState} from './AvatarState.js';
import {__pwd, ConfigService} from './ConfigService.js';

const isViTest = process.env.VITEST === 'true'


export class DocService extends Effect.Service<DocService>()("avatar-shell/DocService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const docBasePath = app ? path.join(app.getPath('userData'),'docs'):`${__pwd}/tools/docs`
    const mediaSaveQueue = yield *Queue.sliding<{path:string,image:string}>(100)
    const mediaCache = yield *Ref.make(HashMap.empty<string,string>())
    yield *Effect.forkDaemon(Stream.fromQueue(mediaSaveQueue).pipe(Stream.runForEach(a => {
      return Effect.gen(function*() {
        console.log('write media:',a.path);
        yield *fs.writeFile(a.path,Buffer.from(a.image,'base64'))
        yield *Ref.update(mediaCache,b => HashMap.remove(b,a.path))
      })
    })))


    function readDocList(templateId:string) {
      console.log('main readDocList',docBasePath,templateId)
      const reg = new RegExp(`^[^_]+_[^_]+_(\\d{14})\\.asdata$`)
      return fs.readDirectory(path.join(docBasePath,'contents',templateId)).pipe(
        Effect.andThen(a =>
          a.map(value => reg.exec(value))
            .filter((v): v is  RegExpExecArray => v !== null)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(a => a[0])),
      )
    }

    function readDocument(templateId:string,fileName:string) {
      //  データ書式は[]がないjsonのリストとしておく
      const path1 = path.join(docBasePath,'contents',templateId,fileName);
      // console.log('readDocument:',path1);
      return fs.readFileString(path1).pipe(
        Effect.andThen(a => a.split('\n').flatMap(value => {
          try {
            return (value ? JSON.parse(value):[]) as AsOutput[];
          } catch (e) {
            console.log('json error:',value);
            return []
          }
        }) )
      )
    }

    const regMediaUrl = /file:\/\/(.+)\/(.+)/

    function readDocMedia(mediaUrl:string) {
      const match = regMediaUrl.exec(mediaUrl)
      if (match) {
        return Effect.gen(function*(){
          // TODO 対応するtemplateIdがない場合は、リモートなので画像は出さないことにする 今のところは
          const list = yield *ConfigService.getAvatarConfigList()
          if (!list.find(v => v.templateId === match[1])) {
            return yield *Effect.fail(new Error('this is remote media'))
          }
          const mediaPath = path.join(docBasePath,'contents',match[1],match[2]);
          return yield *Ref.get(mediaCache).pipe(Effect.andThen(a => HashMap.get(a,mediaPath)),Effect.orElse(() => fs.readFile(mediaPath).pipe(Effect.andThen(a => Buffer.from(a).toString('base64')))))
        }).pipe(Effect.catchAll(e => Effect.fail(new Error(`readDocMedia file error:${e}`))))

      }
      return Effect.fail(new Error('no match media file'))
    }

    // function makeDocPath(avatarConfig:AvatarSetting) {
    //   return Effect.gen(function*() {
    //     const outPath = yield *ConfigService.getSysConfig().pipe(
    //       Effect.andThen(a => a.defaultContentPath || path.join(docBasePath, 'contents', avatarConfig.templateId)),
    //     )
    //     if (yield* fs.exists(outPath)) {
    //       const stat = yield *fs.stat(outPath)
    //       if (stat.type !== 'Directory') {
    //         return yield *Effect.fail(new Error(`saveMedia path wrong:${outPath}`))
    //       }
    //     } else {
    //       yield *fs.makeDirectory(outPath,{recursive:true})
    //     }
    //     return outPath
    //   })
    // }

    function saveDocMedia(id:string,mime:string,image:string|null|undefined,templateId:string) {
      //  速度を対応するためにテンポラリにメモリキャッシュしてもよいかも
      if (!image) {
        return Effect.fail(new Error('no image'))
      }

      return Effect.gen(function*() {
        console.log('run saveMedia');
        const ext = mime === 'image/jpg'? '.jpg': mime ==='image/png'? '.png':mime ==='image/gif'? '.gif':mime ==='image/webp'? '.webp':mime ==='audio/wav' ? '.wav':''
        const mediaPath = path.join(docBasePath,'contents',templateId,`${id}${ext}`);
        yield *Ref.update(mediaCache,a => HashMap.set(a,mediaPath,image))
        yield *Queue.offer(mediaSaveQueue,({path:mediaPath,image:image}))

          // return yield *fs.writeFile(path.join(avatarState.DocPath,`${avatarState.Tag}_${seq}${ext}`),Buffer.from(image,'base64'));
        return `file://${templateId}/${id}${ext}`
      })
    }

    function addLog(log:AsOutput[],avatarState:AvatarState) {
      console.log('addLog',log.length)
      //  appendなのでfiberにはしない
      if (log.length === 0) {
        return Effect.void
      }
      return Effect.gen(function*() {
        const dir = path.join(docBasePath,'contents',avatarState.TemplateId)
        const exist = yield *fs.exists(dir)
        if (!exist) {
          yield *fs.makeDirectory(dir,{recursive:true})
        }
        //  TODO genNative内のcontent.image_urlなどは入力扱い時にはbase64に展開されてログに使いにくい。存在したときは暫定的にこの項はnullにする。genNativeそのものを保持するかどうかは少し考える。。
        //  TODO 何か問題があるらしくgenNativeそのものを空にする
        // value.genNative.map(value1 => {
        //   return {
        //     ...value1,
        //     content:value1.content.map((v2:any) => {
        //       if (v2?.image_url) {
        //         v2.image_url = undefined
        //       }
        //       return v2
        //     })
        //   }
        // })
        const writeLogs = log.map(value => AsOutput.makeOutput(value.mes, value.genType))
        //  書き込みファイルは完全なjsonファイルではなくオブジェクト配列で前後の[]をないという形にして追記にするか
        const s = JSON.stringify(writeLogs);
        // const d = s.slice(s.indexOf('[')+1).slice(0,s.lastIndexOf(']'))
        yield *fs.writeFileString(path.join(docBasePath,'contents',avatarState.TemplateId,avatarState.LogFileName),s+'\n',{flag:'a'});
      });
    }



    return {
      readDocList,
      readDocument,
      saveDocMedia,
      readDocMedia,
      // appendLog,
      addLog,
    }
  }),
  dependencies:[NodeFileSystem.layer]
}) {
}

export const DocServiceLive = DocService.Default
