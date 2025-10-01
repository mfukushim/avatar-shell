import {Effect, Schedule} from 'effect';
import {HttpClient, HttpClientRequest} from '@effect/platform';
import {NodeHttpClient} from '@effect/platform-node';
import {ContextGenerator} from './generators/ContextGenerator.js';


export abstract class VoiceAipBaseGenerator extends ContextGenerator {
  /*
    function generateTts(messageList: AsOutput[], context: AvatarState) {
      //  遅いので非同期にやる
      return Effect.forkDaemon(Effect.gen(function* () {
        const avatarConfig = yield* ConfigService.getAvatarConfig(context.TemplateId);
        //  TODO ConfigServiceから生成元を選択
        const sysConfig = yield* ConfigService.getSysConfig();
        const openai = avatarConfig.general.useTts === 'openAi' && sysConfig.ai.openAi?.apiKey ? new OpenAI({apiKey: sysConfig.ai.openAi.apiKey}) : undefined;
        yield* Effect.forEach(messageList.flatMap(value => value.mes), a => {
          return Effect.gen(function* () {
            if (a.content.text) {
              const text = a.content.text;
              const speechFilebase = yield* fs.makeTempFile({directory: cachePath, prefix: 'mp3'});
              // console.log('speechFile', speechFile, openai);
              if (openai) {
                const speechFile = speechFilebase + '.mp3';
                const mp3 = yield* Effect.tryPromise({
                  try: () => openai.audio.speech.create({
                    model: sysConfig.tts.openAi?.model || 'gpt-4o-mini-tts',
                    voice: sysConfig.tts.openAi?.voice || 'coral',
                    input: text,
                    instructions: sysConfig.tts.openAi?.instructions || 'Speak in a cheerful and positive tone.',
                  }),
                  catch: error => console.log(error),
                }).pipe(
                  Effect.andThen(a => Effect.tryPromise({
                    try: signal => a.arrayBuffer(),
                    catch: error => console.log(error),
                  })));
                yield* fs.writeFile(speechFile, Buffer.from(mp3));
                yield* Queue.offer(speechQueue, {
                  path: speechFile,
                  tts: 'openAi',
                });
                // console.log('speechQueue:', speechQueue);
              } else if (avatarConfig.general.useTts === 'voiceVox') {
                const speechFile = speechFilebase + '.wav';
                const raw = yield *talkVoiceVox(text, sysConfig.tts.voiceVox?.custom.speaker || 1,sysConfig.tts.voiceVox?.custom.speed,sysConfig.tts.voiceVox?.custom.pitch)
                yield* fs.writeFile(speechFile, raw);
                yield* Queue.offer(speechQueue, {
                  path: speechFile,
                  tts: 'voiceVox',
                });
              }

            }

          });
        });
      }).pipe(Effect.andThen(() => console.log('generateTts end'))));
    }


              const fiber = yield* MediaService.generateTts(outText, avatarState);  //  TODO これはgeneratorに置き直す

    const speechQueue = yield* Queue.sliding<{path: string, tts: TtsSchema}>(100);

    const speechStream = Stream.fromQueue<{path: string, tts: TtsSchema}>(speechQueue);

    const playFiber = yield* Effect.forkDaemon(Effect.gen(function* () {
      console.log('play start');
      while (true) {
        const e = yield* Queue.take(speechQueue);
        console.log(e);
        yield *playSound(e.path).pipe(Effect.andThen(a => console.log('play end')))
      }
    }));

*/

/*
  function talkVoiceVox(text: string, speaker: number, speed?: number, pitch?: number) {
    return Effect.gen(function*(){
      const client = yield* HttpClient.HttpClient;
      const ret:any = yield *HttpClientRequest.post(`http://192.168.11.122:50021/audio_query`,{urlParams:{text:text,
          speaker:speaker,}}).pipe(
        HttpClientRequest.setHeaders({
          Accept: "application/json",
        }),
        client.execute,
        Effect.flatMap(a => a.json),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced("5 seconds")))),
        Effect.scoped,
      )
      //  補助加工
      ret.volumeScale = 2; //  デフォルト 1
      if (speed) {
        ret.speedScale = 0.95 + speed * 0.05; //  話速 デフォルト 1
      } else {
        ret.speedScale = 0.9 + (Math.random() * 0.1 - 0.05); //  話速 デフォルト 1
      }
      if (pitch) {
        ret.pitchScale += pitch * 0.03; //  音高 デフォルト 0
      } else {
        ret.pitchScale += (Math.random() * 0.06 - 0.03); //  音高 デフォルト 0
      }
      ret.intonationScale += (Math.random() * 0.6 - 0.3) //  抑揚 デフォルト 1
      // console.log('ret-2',ret);
      const ret2 = yield *HttpClientRequest.post(`http://192.168.11.122:50021/synthesis`,{urlParams:{speaker:speaker,}}).pipe(
        HttpClientRequest.setHeaders({
          Accept: "audio/wav;charset=UTF-8",
          responseType: "arraybuffer",
        }),
        HttpClientRequest.bodyJson(ret),
        Effect.flatMap(client.execute),
        Effect.flatMap(a => a.arrayBuffer),
        Effect.retry(Schedule.recurs(1).pipe(Schedule.intersect(Schedule.spaced("5 seconds")))),
        Effect.scoped,
      )
      //  エラーで落ちないケースがあるようなので1024以下ならエラーと見なす
      if (ret2.byteLength < 1024) {
        yield *Effect.fail(new Error('voiceVox error'))
      }
      return Buffer.from(ret2);
    }).pipe(Effect.provide(NodeHttpClient.layerUndici))
  }
*/

}
