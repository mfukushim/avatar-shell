/*! avatar-shell | Apache-2.0 License | https://github.com/mfukushim/avatar-shell */
import {Effect, HashMap, Queue, Ref, Stream} from 'effect';
import {FileSystem} from '@effect/platform';
import {app} from 'electron';
import path from 'node:path';
import {NodeFileSystem} from '@effect/platform-node';
import {AsOutput} from '../../common/Def.js';
import {AvatarState} from './AvatarState.js';
import {__pwd, ConfigService} from './ConfigService.js';
import filenamifyUrl from 'filenamify-url';
import filenamify from 'filenamify';
import crypto from 'crypto';


const isViTest = process.env.VITEST === 'true';

//  by ChatGPT
export function urlToSafeFilename(
  url: string,
  opts?: {
    /** ファイル名(1コンポーネント)の最大バイト長。一般的には255推奨。デフォルト: 200 */
    maxBytes?: number;
    /** ハッシュの種類（node:cryptoに準拠）デフォルト: 'md5' */
    hashAlgo?: string;
    /** ハッシュの表示文字数（16進）デフォルト: 8 */
    hashLength?: number;
    /** 区切り文字 デフォルト: '_' */
    sep?: string;
    /** 末尾の拡張子を極力保持する（例: .png） デフォルト: true */
    keepExtension?: boolean;
  },
): string {
  const {
    maxBytes = 100,
    hashAlgo = 'md5',
    hashLength = 8,
    sep = '_',
    keepExtension = true,
  } = opts ?? {};

  // 1) URL→可用ファイル名へ（URLらしさを保った整形）
  const base = filenamifyUrl(url);

  // 2) 末尾拡張子の抽出（URLの最後のセグメントから）
  let ext = '';
  if (keepExtension) {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
      const m = last.match(/(\.[A-Za-z0-9]{1,10})$/); // 簡易: 最大10文字の拡張子
      if (m) ext = m[1].toLowerCase();
    } catch {
      // URLパース不能時は無視
    }
    // 拡張子にファイル名不正文字が混ざらないよう一応sanitize
    if (ext) ext = filenamify(ext);
  }

  // 3) ハッシュ生成（衝突防止）
  const hash = crypto.createHash(hashAlgo).update(url).digest('hex').slice(0, hashLength);

  // 4) 連結時の土台文字列（拡張子は最後に付ける）
  //    baseに拡張子が既に含まれていそうでも、URL由来の"見かけの拡張子"と二重にならないよう
  //    base側の末尾ドット列は削る（Windows 悪影響回避）
  let core = base.replace(/[. ]+$/u, '');

  // 5) Windows 予約名を避ける（拡張子を付ける前のコアに対して）
  //    CON, PRN, AUX, NUL, COM1..COM9, LPT1..LPT9（大文字小文字区別なし、末尾に . や空白も不可）
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(core)) {
    core = `_${core}`;
  }

  // 6) 「<core><sep><hash><ext>」の全体が maxBytes を超えないよう core をバイト単位で切り詰め
  const suffix = (sep ? sep : '') + hash + (ext || '');
  const suffixBytes = byteLen(suffix);
  const budgetForCore = Math.max(1, maxBytes - suffixBytes); // 最低1バイトは確保
  core = truncateByBytes(core, budgetForCore);

  // 7) 仕上げ
  let out = core + suffix;

  // 念押しで全体もsanitization（万一の不可文字混入や末尾の.と空白を除去）
  out = filenamify(out, {replacement: '_'}).replace(/[. ]+$/u, '');
  // それでも超過してたら最終防衛（極レアケース）
  if (byteLen(out) > maxBytes) {
    out = truncateByBytes(out, maxBytes);
  }
  return out;
}

// バイト長（UTF-8）
function byteLen(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

// 文字境界を壊さずにUTF-8バイト長で安全に切る
function truncateByBytes(s: string, maxBytes: number): string {
  if (byteLen(s) <= maxBytes) return s;
  let out = '';
  for (const ch of s) {
    const next = out + ch;
    if (byteLen(next) > maxBytes) break;
    out = next;
  }
  return out;
}

export class DocService extends Effect.Service<DocService>()('avatar-shell/DocService', {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const docBasePath = app ? path.join(app.getPath('userData'), 'docs') : `${__pwd}/tools/docs`;
    const mediaSaveQueue = yield* Queue.sliding<{path: string, image: string}>(100);
    const mediaCache = yield* Ref.make(HashMap.empty<string, string>());
    yield* Effect.forkDaemon(Stream.fromQueue(mediaSaveQueue).pipe(
      Stream.runForEach(a => {
        return Effect.gen(function* () {
          const dir = path.dirname(a.path);
          console.log('dir:', dir);
          const exist = yield* fs.exists(dir);
          if (!exist) {
            yield* fs.makeDirectory(dir, {recursive: true});
          }
          return yield* fs.writeFile(a.path, Buffer.from(a.image, 'base64')).pipe(Effect.andThen(() => Ref.update(mediaCache, b => HashMap.remove(b, a.path))));
        });
      })),
    );

    function readDocList(templateId: string) {
      const reg = new RegExp(`^[^_]+_[^_]+_(\\d{14})\\.asdata$`);
      return fs.readDirectory(path.join(docBasePath, 'contents', templateId)).pipe(
        Effect.andThen(a =>
          a.map(value => reg.exec(value))
            .filter((v): v is  RegExpExecArray => v !== null)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(a => a[0])),
      );
    }

    function readDocument(templateId: string, fileName: string) {
      //  データ書式は[]がないjsonのリストとしておく
      const path1 = path.join(docBasePath, 'contents', templateId, fileName);
      return fs.readFileString(path1).pipe(
        Effect.andThen(a => a.split('\n').flatMap(value => {
          try {
            return (value ? JSON.parse(value) : []) as AsOutput[];
          } catch (e) {
            console.log('json error:', value);
            return [];
          }
        })),
      );
    }

    const regMediaUrl = /file:\/\/(.+)\/(.+)/;
    const regMcpUiUrl = /ui:\/\/(.+)/;

    function readDocMedia(mediaUrl: string) {
      return Effect.gen(function* () {
        const match = regMediaUrl.exec(mediaUrl);
        if (match) {
          // TODO 対応するtemplateIdがない場合は、リモートなので画像は出さないことにする 今のところは
          const list = yield* ConfigService.getAvatarConfigList();
          if (!list.find(v => v.templateId === match[1])) {
            return yield* Effect.fail(new Error('this is remote media'));
          }
          const mediaPath = path.join(docBasePath, 'contents', match[1], match[2]);
          return yield* Ref.get(mediaCache).pipe(
            Effect.andThen(a => HashMap.get(a, mediaPath)),
            Effect.catchAll(() => fs.readFile(mediaPath).pipe(Effect.andThen(a => Buffer.from(a).toString('base64')))),
          );
        }
        const matchUi = regMcpUiUrl.exec(mediaUrl);
        // console.log('mediaUrl', mediaUrl, matchUi);
        if (matchUi) {
          return yield* Ref.get(mediaCache).pipe(
            Effect.andThen(a => HashMap.get(a, mediaUrl)),
            Effect.catchAll(() => {
              const fileName = urlToSafeFilename(mediaUrl);  //  このurlは生のurl
              const mediaPath = path.join(docBasePath, 'contents', 'mcpUi', fileName);
              console.log('else:', mediaPath);
              return fs.readFile(mediaPath).pipe(Effect.andThen(a => Buffer.from(a).toString('base64')));
            }),
          );
        }
        return '';  //  該当外メディアは仮に空文字にしておく
      }).pipe(Effect.catchAll(e => Effect.fail(new Error(`readDocMedia file error:${e}`))));
    }

    function saveDocMedia(id: string, mime: string, image: string | null | undefined, templateId: string) {
      //  速度を対応するためにテンポラリにメモリキャッシュしてもよいかも
      if (!image) {
        return Effect.fail(new Error('no image'));
      }
      const ext = mime === 'image/jpg' ? '.jpg' : mime === 'image/png' ? '.png' : mime === 'image/gif' ? '.gif' : mime === 'image/webp' ? '.webp' : mime === 'audio/wav' ? '.wav' : '';
      const mediaPath = path.join(docBasePath, 'contents', templateId, `${id}${ext}`);
      return Ref.update(mediaCache, a => HashMap.set(a, mediaPath, image)).pipe(
        Effect.andThen(() => Queue.offer(mediaSaveQueue, ({path: mediaPath, image: image}))),
        Effect.andThen(() => `file://${templateId}/${id}${ext}`),
      );
    }

    function saveMcpUiMedia(uri: string, text: string) {
      //  速度を対応するためにテンポラリにメモリキャッシュしてもよいかも
      console.log('saveMcpUiMedia', uri);
      if (!text || !uri) {
        return Effect.fail(new Error('no data'));
      }
      // const ext = mime === 'text/html'? '.html': mime ==='application/json'? '.json':''
      const fileName = urlToSafeFilename(uri);
      const mediaPath = path.join(docBasePath, 'contents', 'mcpUi', fileName);
      console.log('mediaPath:', mediaPath);
      console.log('save uri:', uri);
      return Ref.update(mediaCache, a => HashMap.set(a, uri, text)).pipe(
        Effect.andThen(() => Queue.offer(mediaSaveQueue, ({path: mediaPath, image: text}))),
        Effect.andThen(() => uri),
      );
    }

    function addLog(log: AsOutput[], avatarState: AvatarState) {
      console.log('addLog', log.length);
      //  appendなのでfiberにはしない
      if (log.length === 0) {
        return Effect.void;
      }
      return Effect.gen(function* () {
        const dir = path.join(docBasePath, 'contents', avatarState.TemplateId);
        const exist = yield* fs.exists(dir);
        if (!exist) {
          yield* fs.makeDirectory(dir, {recursive: true});
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
        const writeLogs = log.map(value => AsOutput.makeOutput(value.mes, value.genType));
        //  書き込みファイルは完全なjsonファイルではなくオブジェクト配列で前後の[]をないという形にして追記にするか
        const s = JSON.stringify(writeLogs);
        yield* fs.writeFileString(path.join(docBasePath, 'contents', avatarState.TemplateId, avatarState.LogFileName), s + '\n', {flag: 'a'});
      });
    }

    function saveNativeLog(pathTag:string,tag:string,data:any) {
      return Effect.gen(function*() {
        const dir = path.join(docBasePath, 'contents', 'native');
        const exist = yield* fs.exists(dir);
        if (!exist) {
          yield* fs.makeDirectory(dir, {recursive: true});
        }
        const s = JSON.stringify({tag,data})
        yield* fs.writeFileString(path.join(docBasePath, 'contents', 'native',`${pathTag}.json`), `${s},\n`, {flag: 'a'});
      })
    }


    return {
      readDocList,
      readDocument,
      saveDocMedia,
      readDocMedia,
      saveMcpUiMedia,
      addLog,
      saveNativeLog
    };
  }),
  dependencies: [NodeFileSystem.layer],
}) {
}

export const DocServiceLive = DocService.Default;
