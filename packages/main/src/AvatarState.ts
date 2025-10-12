import {
  Chunk, Duration, Effect, Fiber, Queue, Ref, Schedule, Stream, SubscriptionRef, SynchronizedRef, Option,
  FiberStatus,
} from 'effect';
import {
  AlertTask,
  AsMessage,
  AsMessageContent,
  AsMessageContentMutable,
  AvatarSetting, ContentGenerator,
  ContextTrigger,
  ContextTriggerList,
  DaemonConfig,
  SchedulerList,
  SysConfig,
  TimerTriggerList,
  ToolCallParam,
} from '../../common/Def.js';
import {BrowserWindow} from 'electron';
import dayjs from 'dayjs';
import {ConfigService} from './ConfigService.js';
import {DocService} from './DocService.js';
//  @ts-ignore
import duration from 'dayjs/plugin/duration';
import {ContextGenerator} from './generators/ContextGenerator.js';
import short from 'short-uuid';
//  @ts-ignore
import expand_template from 'expand-template';
import {MediaService} from './MediaService.js';
import {McpService} from './McpService.js';
import {z} from 'zod';
import {CallToolResultSchema} from '@modelcontextprotocol/sdk/types.js';
import {ContextGeneratorSetting, GeneratorProvider} from '../../common/DefGenerators.js';

dayjs.extend(duration);

const expand = expand_template();

interface DaemonState {
  config: DaemonConfig,
  generator: ContextGenerator,
}

interface TimeDaemonState {
  config: DaemonConfig,
  generator: ContextGenerator,
  fiber: Fiber.RuntimeFiber<any, any>
}

export interface GenInner {
  avatarId: string;
  fromGenerator: ContentGenerator;
  toGenerator: GeneratorProvider;
  input?: AsMessageContent;
  toolCallRes?: {
    name: string,
    callId: string,
    results: z.infer<typeof CallToolResultSchema>
    /*
    results : {
      content: [{
        type:"text",
        text:"hello"
      },{
        type:"image",
        mimeType:"image/png",
        data:"xxx"
      }
      ],
      isError:false
    }
    */

  }[],
  genNum: number,
  setting?: ContextGeneratorSetting,
  // noTool?:boolean
  //  GeneratorOutput
  //  AvatarState
  //  InputText
}

export interface GenOuter {
  avatarId: string;
  fromGenerator: ContentGenerator;
  toGenerator: GeneratorProvider;
  innerId: string;
  toolCallParam?: ToolCallParam[];
  outputText?: string;
  outputImage?: string;
  outputMediaUrl?: string;
  outputMime?: string;
  genNum: number
  setting?: ContextGeneratorSetting,
  //  ToolCallParam
  //  AvatarState
  //  OutputText
}


export class AvatarState {
  private readonly tag: string;
  private summaryCounter: number = 0;
  private externalTalkCounter: number = 0;
  private generatorMaxUseCount: number | undefined;
  private forcedStopDaemons = false;

  fiberConfig: Fiber.RuntimeFiber<any, any> | undefined;
  fiberTalkContext: Fiber.RuntimeFiber<any, any> | undefined;
  fiberInner: Fiber.RuntimeFiber<any, any> | undefined;
  fiberOuter: Fiber.RuntimeFiber<any, any> | undefined;

  constructor(
    private id: string,
    private templateId: string,
    private name: string,
    private userName: string,
    private window: BrowserWindow | null,
    private avatarConfig: AvatarSetting,
    private talkContext: SynchronizedRef.SynchronizedRef<AsMessage[]>,
    // private talkContext: SynchronizedRef.SynchronizedRef<{context: AsMessage[], delta: AsMessage[]}>,
    // private talkSeq: number,
    private daemonStates: Ref.Ref<DaemonState[]>,
    private daemonStatesQueue: Queue.Queue<DaemonState>,  //  Echo Mcpで追加された予定をキューする
    private innerQueue: Queue.Queue<GenInner>,
    private outerQueue: Queue.Queue<GenOuter>,
    private talkQueue: Queue.Queue<{context: AsMessage[], delta: AsMessage[]}>,
    private fiberTimers: SynchronizedRef.SynchronizedRef<TimeDaemonState[]>,
  ) {
    this.tag = `${id}_${name}_${dayjs().format('YYYYMMDDHHmmss')}`;
  }

  get Id() {
    return this.id;
  }

  get TemplateId() {
    return this.templateId;
  }

  get Name() {
    return this.name;
  }

  get UserName() {
    return this.userName;
  }

  get TalkContextEffect() {
    return this.talkContext.pipe(SynchronizedRef.get);
  }

  get BrowserWindow() {
    return this.window;
  }

  get Tag() {
    return this.tag;
  }

  get LogFileName() {
    return this.tag + '.asdata';
  }

  get Config() {
    return this.avatarConfig;
  }

  private changeApplyAvatarConfig(config: AvatarSetting) {
    console.log('update changeApplyAvatarConfig:');
    // const it = this;
    this.avatarConfig = config; //  TODO 強制置き換えでよいか? llmの途中置き換えがあるならaskAiとの間にはロックがあるべき。。
    if (config.general.maxGeneratorUseCount === 0) {
      this.generatorMaxUseCount = undefined;
    } else {
      this.generatorMaxUseCount = config.general.maxGeneratorUseCount;
    }
    return this.restartDaemonSchedules(config.daemons).pipe(
      // return Effect.gen(function* () {
      //   it.avatarConfig = config; //  TODO 強制置き換えでよいか? llmの途中置き換えがあるならaskAiとの間にはロックがあるべき。。
      //   if (config.general.maxGeneratorUseCount === 0) {
      //     it.generatorMaxUseCount = undefined;
      //   } else {
      //     it.generatorMaxUseCount = config.general.maxGeneratorUseCount;
      //   }
      //   yield* it.restartDaemonSchedules(config.daemons);
      // }).pipe(
      Effect.catchAll(e => {
        console.log('changeApplyAvatarConfig error:', e);
        this.showAlert(`avatar config error:${e}`);
        return Effect.void;
      }), //  configの設定エラーは普通に起きうる
      Effect.andThen(_ => ConfigService.needWizard()),
      Effect.andThen(needWizard => {
        if (this.window) {
          this.window.webContents.send('init-avatar', this.id, this.Name, config, needWizard, this.userName);
        }
      }),
    );
  }

  showAlert(message: string, select = ['OK']) {
    const id = short().generate();
    const task: AlertTask = {
      id: id,
      replyTo: 'oneTime',
      message,
      select,
    };
    if (this.window) {
      this.window.webContents.send('mainAlert', task);
    }
  }

  restartDaemonSchedules(daemons: SchedulerList) {
    return this.restartContextSchedules(daemons).pipe(Effect.andThen(_ => this.restartTimeSchedules(daemons)));
  }

  restartContextSchedules(daemons: SchedulerList) {
    const it = this;
    return Effect.gen(function* () {
      //  スケジューラの設定 時間依存の
      const sysConfig = yield* ConfigService.getSysConfig();
      const contextDaemonList =
        daemons.filter(a => a.isEnabled && ContextTriggerList.some(value => a.trigger.triggerType === value));
      const daemonList = yield* Effect.forEach(contextDaemonList, a => {
        return Effect.gen(function* () {
          if (a.exec.generator) {
            const gen = yield* ConfigService.makeGenerator(a.exec.generator, sysConfig, a.exec.setting);
            // yield *gen.initialize(sysConfig, a.exec.setting)
            return {
              config: a,
              generator: gen,
            } as DaemonState;
          }
          return {
            config: a,
          } as DaemonState;

        });
      });
      yield* it.daemonStates.pipe(Ref.update(() => daemonList));
      //  context更新型daemon Scheduler設定
      if (it.fiberTalkContext) {
        yield* Fiber.interrupt(it.fiberTalkContext);
        it.fiberTalkContext = undefined;
      }
      it.fiberTalkContext = yield* Effect.fork(
        Effect.loop(true, {
          while: a => a,
          body: _ =>
            Effect.gen(function* () {
              const take = yield* Queue.take(it.talkQueue);
              console.log('avatarState update talkContext');
              yield* it.changeTalkContext(take);
              yield* SynchronizedRef.update(it.talkContext, a => a.concat(take.delta));
            }),
          step: c => c,
          discard: true,
        }),
      );
      // it.fiberTalkContext = yield* Effect.forkDaemon(it.talkQueue.changes.pipe(Stream.runForEach(a => {
      //   console.log('avatarState update talkContext');
      //   return it.changeTalkContext(a);
      // })));
    }).pipe(Effect.tapError(e => Effect.log(e)));
  }

  /**
   * タイマーdaemonを全生成しなおす
   * 既存はリセットされる
   * @param daemons
   */
  restartTimeSchedules(daemons: SchedulerList) {
    const it = this;
    return Effect.gen(function* () {
      //  スケジューラの設定 時間依存の
      const sysConfig = yield* ConfigService.getSysConfig();
      const timeDaemonList =
        daemons.filter(a => a.isEnabled && TimerTriggerList.some(value => a.trigger.triggerType === value));
      const daemonList = yield* Effect.forEach(timeDaemonList, a => it.makeDaemonSet(a, sysConfig));
      // yield* it.timeDaemonStates.pipe(Ref.update(() => daemonList));
      yield* it.fiberTimers.get.pipe(Effect.andThen(a1 => Effect.forEach(a1, value => Fiber.interrupt(value.fiber))));
      const now = dayjs();
      yield* SynchronizedRef.updateEffect(it.fiberTimers, _ =>
        Effect.forEach(daemonList, a => it.makeTimeDaemon(a, now)).pipe(Effect.andThen(a => a.flat())));
    });
  }

  makeDaemonSet(config: DaemonConfig, sysConfig: SysConfig) {
    if (config.exec.generator) {
      return ConfigService.makeGenerator(config.exec.generator, sysConfig, config.exec.setting).pipe(Effect.andThen(a =>
        ({
          config: config,
          generator: a,
        } as DaemonState)));
    }
    return Effect.succeed({
      config,
    } as DaemonState);
  }

  makeTimeDaemon(daemon: DaemonState, now: dayjs.Dayjs) {
    let schedule: Schedule.Schedule<any> | undefined;
    let interval: Duration.Duration | undefined; // = Duration.decode('1 second')
    let sec = 0;
    switch (daemon.config.trigger.triggerType) {
      case 'DayTimeDirect':
        if (daemon.config.trigger.condition.time) {
          //  TODO とりあえずシンプル化する
          try {
            const str = now.format('YYYY-MM-DD ') + daemon.config.trigger.condition.time;
            console.log(str);
            let target = dayjs(str);
            console.log(target.format());
            if (now.isAfter(target)) {
              target = target.add(1, 'day');
            }
            console.log(target.format());
            sec = Math.floor(target.diff(now) / 1000);
            console.log(sec);
          } catch (e) {
            //  設定しない
            console.log(e);
          }
        }
        break;
      case 'TimerMin':
        // case 'TalkAfterMin': リスタート時は登録しない。askAi以降で実行
        sec = (daemon.config.trigger.condition.min || 1) * 60;
        console.log('TimerMin:', sec);
        break;
      case 'DateTimeDirect':
        let dateTime = now.format('YYYY-MM-DD');
        if (daemon.config.trigger.condition.date) {
          dateTime = daemon.config.trigger.condition.date;
        }
        if (daemon.config.trigger.condition.time) {
          dateTime += ' ' + daemon.config.trigger.condition.time;
        }
        const target = dayjs(dateTime);
        if (now.isBefore(target)) {
          sec = target.diff(now, 'seconds');
        }
        break;
    }
    if (sec > 0) {
      if (daemon.config.trigger.condition.isRepeatMin) {
        const interval = Duration.decode(`${sec} seconds`);
        schedule = Schedule.spaced(interval);
        // schedule = Schedule.fixed(interval);
      } else {
        interval = Duration.decode(`${sec} seconds`);
      }
    }
    if (interval) {
      return Effect.forkDaemon(Effect.sleep(interval).pipe(Effect.andThen(_ => this.doTimeSchedule(daemon))))
        .pipe(Effect.andThen(a1 => ([{config: {...daemon.config}, generator: daemon.generator, fiber: a1}])));
    }
    if (schedule) {
      return Effect.forkDaemon(this.doTimeSchedule(daemon).pipe(Effect.repeat(schedule)))
        .pipe(Effect.andThen(a1 => ([{config: {...daemon.config}, generator: daemon.generator, fiber: a1}])));
    }
    return Effect.succeed([]);
  }

  /**
   * エコーデーモン登録
   * 純粋に追加のみにする
   * 設定変更の場合は全リセット
   * @param param
   */
  addOnceEcho(param: DaemonConfig) {
    console.log('addOnceEcho:', param);
    const it = this;
    return Effect.gen(function* () {
      const sysConfig = yield* ConfigService.getSysConfig();
      const daemon = yield* it.makeDaemonSet(param, sysConfig);
      // yield* it.timeDaemonStates.pipe(Ref.update(list => {
      //   list.push(daemon)
      //   return list
      // }));
      yield* Queue.offer(it.daemonStatesQueue, daemon);
      /*
            const daemonFiber = yield* it.makeTimeDaemon(daemon, dayjs());
            if (daemonFiber.length > 0) {
              it.fiberTimers.pipe(SynchronizedRef.update(a => {
                a.push(daemonFiber[0]);
                return a;
              }));
            }
      */
    });
  }

  rebuildIdle(): Effect.Effect<void, Error, ConfigService | DocService | McpService | MediaService> {
    //  現在機能しているTimerMinとTalkAfterMin(繰り返しが発生しうるもののみ,context追加でリセットがかかるもの)のみについて再タイマーを設定する
    return this.resetTimerDaemon(a => a.isEnabled && a.trigger.triggerType === 'TalkAfterMin');
  }

  //  この中ではfiberの条件は変更しないことにする。変更できると処理が複雑すぎる。条件のものを停止してタイマー再起動するだけ、破棄生成もしない
  resetTimerDaemon(resetFilter: (a: DaemonConfig) => boolean) {
    const it = this;
    //  既存の動いているfiberの中で指定条件で動いているfiberをすべて止める。generatorは破棄しない
    //  新たにdaemonsリストから再起動するべきdaemonを選ぶ
    //
    return Effect.gen(function* () {
      // const stopList = (yield *it.timeDaemonStates.get).filter(a => resetFilter(a.config));
      yield* it.fiberTimers.get.pipe(Effect.andThen(a1 => {
        return Effect.forEach(a1.filter(value => resetFilter(value.config)), a => Fiber.interrupt(a.fiber));
      }));
      const now = dayjs();
      return yield* SynchronizedRef.updateEffect(it.fiberTimers, b => {
        return Effect.forEach(b.filter(value => resetFilter(value.config)), a => {
          return Effect.gen(function* () {
            yield* Fiber.interrupt(a.fiber);

            return yield* it.makeTimeDaemon({config: a.config, generator: a.generator}, now);
          });
        }).pipe(Effect.andThen(a1 => a1.flat()));
      });

    });
  }

  doTimeSchedule(daemon: DaemonState) {
    console.log('doTimeSchedule:', daemon);
    return this.TalkContextEffect.pipe(
      Effect.andThen(context => this.execDaemon(daemon, context)),
    );
  }


  changeTalkContext(updated: {context: AsMessage[], delta: AsMessage[]}) {
    console.log('changeTalkContext:', updated.context.length, updated.delta.length, updated.delta.map(value => AsMessage.debugLog(value)).join('\n'));
    const it = this;
    return Effect.gen(function* () {
      if (it.forcedStopDaemons) {
        //  強制中断フラグが立っている場合、ワンタイムでコンテキスト変動時に次のデーモンを起動しない
        it.forcedStopDaemons = false;
        return yield* Effect.succeed([]);
      }
      yield* it.daemonStates.pipe(Ref.get).pipe(Effect.andThen(Effect.forEach(a => {
        console.log('update changeTalkContext len:', updated.context.length, updated.delta.length);
        // console.log('update changeTalkContext daemon:', a);
        switch (a.config.trigger.triggerType as ContextTrigger) {
          case 'Startup':
            if (updated.context.length === 0 && updated.delta.length == 0) {
              return it.execDaemon(a, updated.context);
            }
            return Effect.succeed([]);
          case 'IfContextExists':
            //  ここはcontextを追加する だからasClass === 'daemonは見ない。それを見ると無限ループに入りうる。
            const find = updated.delta.find(value => value.asClass !== 'daemon'
              && (value.asClass === a.config.trigger.condition.asClass)
              && (value.asRole === a.config.trigger.condition.asRole)
              && (!a.config.trigger.condition.asContext || value.asContext === a.config.trigger.condition.asContext));
            //  TODO triggerで起動する場合、そのtriggerがcurrentになるからコンテキストとして入力するものはtriggerに入る前の状態がprevContextになる。。。ちょっとわかりにくい。。
            /*
                        if (find) {
                          const pos = updated.context.indexOf(find);
                          const prev = pos >= 0 ? updated.context.slice(0,pos-1):updated.context
                          return state.execDaemon(a, prev, find)
                        }
                        return Effect.succeed([]);
            */
            return find ? it.execDaemon(a, updated.context, find) : Effect.succeed([]);
          case 'IfSummaryCounterOver':
            //  TODO 今は簡略化のため、会話数で決定する
            it.summaryCounter += updated.delta.length;
            if (a.config.trigger.condition.countMax && it.summaryCounter > a.config.trigger.condition.countMax) {
              return it.execDaemon(a, updated.context).pipe(Effect.tap(_ => it.summaryCounter = 0));
            }
            return Effect.succeed([]);
          case 'IfExtTalkCounterOver':
            it.externalTalkCounter += updated.delta.filter(value => value.content.isExternal).length;
            if (a.config.trigger.condition.countMax && it.externalTalkCounter >= a.config.trigger.condition.countMax) {
              return it.execDaemon(a, updated.context).pipe(Effect.tap(_ => it.externalTalkCounter = 0));
            }
            return Effect.succeed([]);
        }
        return Effect.fail(new Error('unknown triggerType'));
      })), Effect.andThen(a => a.flat()));
    });
  }

  private calcTemplate(template: string, source: AsMessage) {
    return expand(template, {
      from: source.content.from,
      body: source.content.text,
    });
  }

  execDaemon(daemon: DaemonState, context: AsMessage[], triggerMes?: AsMessage) {
    console.log('call execDaemon');
    const state = this;
    return Effect.gen(function* () {
      console.log('execScheduler:', daemon.config.name);
      /*
      テンプレートの基本構文
      from: 送付者のハンドル
      output: generateされたテキスト本体
      それ以外は必要時に追加していく
      '{from} said, "{output}"'
       */
      let toLlm: AsMessage[];
      let text: any;
      let message: AsMessage | undefined;
      if (triggerMes) {
        //  TODO trigger型の場合、そのメッセージはすでにcontextに追加されているものであり、以前のcontextはそのメッセージの前までになる 電文は基本再加工されない。電文の再加工が許されるのは入出力ともにコンテキストに追加しない場合のみ
        //  askAiから来るコンテンツには画像がmediaBinで来ることがあるので、それはmediaUrlに変換しておく
        // if (triggerMes.content.mediaBin) {
        //  今はまだsoundは考えない
        /*
                  if(triggerMes.content.mimeType?.startsWith('image/')) {
                    const img = Buffer.from(triggerMes.content.mediaBin).toString('base64');
                    const mediaUrl = yield *DocService.saveDocMedia(triggerMes.id, triggerMes.content.mimeType, img, state.templateId)
                    message = [{
                      ...triggerMes,
                      asClass: 'daemon',
                      asRole: 'system',
                      asContext: 'outer', //  trigger mesの場合、すでにtrigger元はcontextに追加済みである。よってこれはcontextには含まれない
                      content: {
                        ...triggerMes.content,
                        mediaBin: undefined,
                        mediaUrl: mediaUrl,
                      },
                    } as AsMessage,
                    ];
                  } else if(triggerMes.content.mimeType?.startsWith('text/')) {
                    message = [{
                      ...triggerMes,
                      asClass: 'daemon',
                      asRole: 'system',
                      asContext: 'outer', //  trigger mesの場合、すでにtrigger元はcontextに追加済みである。よってこれはcontextには含まれない
                      content: {
                        ...triggerMes.content,
                        mediaBin: undefined,
                        text: Buffer.from(triggerMes.content.mediaBin).toString('utf-8'),
                      },
                    } as AsMessage,
                    ];
                  }
        */
        // } else {
        if (daemon.config.exec.directTrigger) {
          //  ダイレクト
          message = triggerMes;  //  すでに追加済みなのでaddContentには追加しない
        } else {
          //  再加工
          text = daemon.config.exec.templateGeneratePrompt ? state.calcTemplate(daemon.config.exec.templateGeneratePrompt, triggerMes) : triggerMes;
          message = {
            ...triggerMes,
            asClass: 'daemon',
            asRole: 'system',
            asContext: 'outer', //  trigger mesの場合、すでにtrigger元はcontextに追加済みである。よってこれはcontextには含まれない
            content: {
              ...triggerMes.content,
              text: text,
            },
          } as AsMessage;
          yield* state.addContext([message]);  //  ここは新規なので追加
        }
        //  トリガーの場合はコンテキストはトリガー位置まででフィルタする
        const pos = context.findLastIndex(value => value.id === triggerMes.id);
        if (pos >= 0) {
          context = context.slice(0, pos);
        }
      } else {
        //  非トリガー
        text = daemon.config.exec.templateGeneratePrompt;
        message =
          AsMessage.makeMessage({
            from: state.Name,
            text: text,
            generator: daemon.generator.Name,
          }, 'daemon', 'system', daemon.config.exec.setting.toContext || 'inner'); //  TODO 調整要 非trigger mesの場合、条件によって自律生成される。これはaddDaemonGenToContextにより、trueならinner,falseならouterになる 'inner'
        yield* state.addContext([message]);  //  ここは新規なので追加
      }
      //  TODO generatorが処理するprevContextはsurface,innerのみ、またaddDaemonGenToContext=falseの実行daemonは起動、結果ともにcontextには記録しない また重いメディアは今は送らない

      const filteredContext = context.filter(value => value.asContext !== 'outer');
      // const filteredContext = context.filter(value => value.asContext !== 'outer' && (!value.content.mimeType || !value.content.mimeType.startsWith('text')));

      const out = yield* state.execGenerator(daemon.generator, message, daemon.config.exec.setting);  //  filteredContext
      console.log('execGenerator out:', out);
      //  出力用にroleとtextは再加工する
      // yield *state.appendContextGenOut(out)
      /*
            toLlm = out.filter(a => (a.asRole === 'bot' || a.asRole === 'toolIn' || a.asRole === 'toolOut')).map(a => {
              if (a.asRole === 'toolIn' || a.asRole === 'toolOut') {
                return a;  //  tool入出力はクラス加工しない 原則そのまま
              }
              return {
                ...a,
                asClass: daemon.config.exec.setting?.toClass || 'daemon',
                asRole: daemon.config.exec.setting?.toRole || 'bot',
                asContext: daemon.config.exec.setting?.toContext || 'surface',
                genName: daemon.generator.Name,
                content: {
                  ...a.content,
                },
              } as AsMessage;
            });
            //  個別加工したプロンプトを会話コンテキストに送る
            console.log('toLlm:', toLlm.map(value => JSON.stringify(value).slice(0, 200)).join('\n'));
            if (toLlm.length > 0) {
              state.addContext(toLlm),

                //  音声合成コンテンツの場合はここでrenderer側で音声再生を呼ぶ
              state.sendToWindow(toLlm);

              //  TODO addDaemonGenToContexthは意味合い上、class/roleの違いとしてコンテキストとして検出可能なものとして追加するかどうか、会話トリガーを発生させるものかどうかを分ける形になるはず
              //  TODO とりあえずの意味としてはトリガーになるかどうかの差になるのではないか?
              return toLlm; //  addContextは外で行う
            }
      */
      return [];
    });
  }


  get ScheduleList() {
    const state = this;
    console.log('ScheduleList:');
    return Effect.gen(function* () {
      const daemons = yield* state.daemonStates.pipe(Ref.get, Effect.andThen(a => {
        return a.map(v => ({
          id: v.config.id,
          name: v.config.name,
          trigger: v.config.trigger,
        }));
      }));
      return daemons.concat(yield* state.fiberTimers.pipe(Ref.get, Effect.andThen(a => {
        return a.map(v => ({
          id: v.config.id,
          name: v.config.name,
          trigger: v.config.trigger,
        }));
      })));
    });
  }

  get ExternalTalkCounter() {
    return this.externalTalkCounter;
  }

  setNames(setting: {userName?: string, avatarName?: string}) {
    let changed = false;
    if (setting.userName) {
      this.userName = setting.userName;
      changed = true;
    }
    if (setting.avatarName) {
      this.name = setting.avatarName;
      changed = true;
    }
    if (changed && this.window) {
      //  avatarConfigを変えるのではなく、avatar画面の名称とuser名称を変えるだけだからconfigは更新しない
      this.window.webContents.send('init-avatar', this.id, this.Name, this.avatarConfig, false, this.userName);
    }
  }

  cancelSchedule(id: string) {
    console.log('cancelSchedule:', id);
    const state = this;
    return Effect.gen(function* () {
      const find = yield* state.fiberTimers.get.pipe(Effect.andThen(a1 => a1.find(value => value.config.id === id)));
      if (find) {
        yield* Fiber.interrupt(find.fiber);
      }
      Ref.update(state.fiberTimers, a1 => a1.filter(value => value.config.id !== id));
      yield* Ref.update(state.daemonStates, onces => {
        return onces.filter(value => value.config.id !== id);
      });
      // yield* Ref.update(state.timeDaemonStates, onces => {
      //   return onces.filter(value => value.config.id !== id);
      // });
    });
  }

  /**
   * Avatar frontendにメッセージを送る
   * @param bag
   */
  sendToWindow(bag: AsMessage[]) {
    if (this.window) {
      this.window.webContents.send('update-llm', bag);
    }
  }

  static make(id: string, templateId: string, name: string, window: BrowserWindow | null, userName: string) {
    return Effect.gen(function* () {
      // console.log('avatarstate make');
      const configPub = yield* ConfigService.getAvatarConfigPub(templateId);

      const aConfig = yield* SubscriptionRef.get(configPub);
      const mes = yield* SynchronizedRef.make<AsMessage[]>([]);
      const daemonStates = yield* Ref.make<DaemonState[]>([]);
      // const timeDaemonStates = yield* Ref.make<DaemonState[]>([]);
      const fiberTimers = yield* SynchronizedRef.make<TimeDaemonState[]>([]);
      const daemonStatesQueue = yield* Queue.dropping<DaemonState>(100);  //  Echo Mcpで追加された予定をキューする

      const innerQueue = yield* Queue.bounded<GenInner>(100);
      const outerQueue = yield* Queue.bounded<GenOuter>(100);
      const talkQueue = yield* Queue.bounded<{context: AsMessage[], delta: AsMessage[]}>(100);

      const avatar = new AvatarState(
        id, templateId, name, userName, window, aConfig,
        mes,
        daemonStates,
        daemonStatesQueue,
        innerQueue,
        outerQueue,
        talkQueue,
        fiberTimers,
      );

      avatar.fiberConfig = yield* Effect.forkDaemon(configPub.changes.pipe(Stream.runForEach(a => {
          // console.log('avatarState update avatarConfig:');
          return avatar.changeApplyAvatarConfig(a); //  config更新
        }),
      ));
      // avatar.fiberInner = yield *Effect.forkDaemon(avatar.execGeneratorLoop().pipe(
      //   Effect.tapError(e => Effect.logError('fiberInner error:',e)),Effect.andThen(a => Effect.log('end gen fork'))))
      // avatar.fiberOuter = yield *Effect.forkDaemon(avatar.execExternalLoop().pipe(
      //   Effect.tapError(e => Effect.logError('fiberOuter error:',e)),Effect.andThen(a => Effect.log('end io fork'))))

      return avatar;
    });
  }

  stopAvatar() {
    //  ワンタイムでContext変動によるdaemonの実行を無視させる
    this.forcedStopDaemons = true;
  }


  addContext(bags: AsMessage[]) {
    if (bags.length === 0) {
      return Effect.void;  //  更新の無限ループ防止
    }
    console.log('addContext', bags.map(value => AsMessage.debugLog(value)).join('\n'));
    const it = this;
    return Effect.gen(function* () {
      const mesList = yield* Effect.forEach(bags, mes => {
        return Effect.gen(function* () {
          //  TODO 本来socket.ioから自分の電文は来ないはずだが、来ることがあるのでフィルタする。。。
          const current = yield* it.talkContext.get;
          const isSame = current.find(value => value.id === mes.id);
          if (isSame) {
            console.log('addContext same id:', mes);
            return undefined;
          }
          if (mes.content.mediaBin && mes.content.mimeType?.startsWith('image/')) {
            const img = Buffer.from(mes.content.mediaBin).toString('base64');
            const mediaUrl = yield* DocService.saveDocMedia(mes.id, mes.content.mimeType, img, it.templateId);
            return {
              ...mes,
              // asClass: 'daemon',
              // asRole: 'system',
              // asContext: 'outer', //  trigger mesの場合、すでにtrigger元はcontextに追加済みである。よってこれはcontextには含まれない
              content: {
                ...mes.content,
                mediaBin: undefined,
                mediaUrl: mediaUrl,
              },
            } as AsMessage;
          } else if (mes.content.mediaBin && mes.content.mimeType?.startsWith('text/')) {
            return {
              ...mes,
              // asClass: 'daemon',
              // asRole: 'system',
              // asContext: 'outer', //  trigger mesの場合、すでにtrigger元はcontextに追加済みである。よってこれはcontextには含まれない
              content: {
                ...mes.content,
                mediaBin: undefined,
                text: Buffer.from(mes.content.mediaBin).toString('utf-8'),
              },
            } as AsMessage;
          } else {
            return mes;
          }
        });

      });
      const mesOut = mesList.filter((v): v is  AsMessage => v !== undefined);
      if (mesOut.length > 0) {
        const context = yield* it.talkContext;
        return yield* it.talkQueue.offer({context: context.concat(mesOut), delta: mesOut});
      }
      // return yield* SubscriptionRef.update(it.talkContext, a => {
      //   return {context: a.context.concat(mesOut), delta: mesOut};
      // });
    });

  }

  /*
    addContext(bags: AsMessage[]) {
      const it = this;
      return Effect.gen(function* () {
        const context = yield *it.talkContext
        return yield *it.talkQueue.offer({context: context.concat(bags), delta: bags})
      })
      // return SubscriptionRef.update(this.talkContext, a => {
      //   return {context: a.context.concat(bags), delta: bags};
      // });
    }
  */

  MaxGen = 2;  //  TODO 世代の最適値は

  enterInner(inner: GenInner) {
    const it = this;
    return Effect.gen(function* () {
      yield* Queue.offer(it.innerQueue, inner);
      yield* it.rerunLoop();
      // const fiberInner = yield* Effect.fork(it.execGeneratorLoop().pipe(
      //   Effect.tapError(e => Effect.logError('fiberInner error:', e)), Effect.andThen(a => Effect.log('end gen fork'))));
      // const fiberOuter = yield* Effect.fork(it.execExternalLoop().pipe(
      //   Effect.tapError(e => Effect.logError('fiberOuter error:', e)), Effect.andThen(a => Effect.log('end io fork'))));
      // yield *Fiber.awaitAll([fiberInner, fiberOuter]).pipe(Effect.tap(_ => Effect.log('end loop fiber')))
    });
  }

  execGeneratorLoop() {
    console.log('start execGeneratorLoop');
    const it = this;
    let loop = true;
    return Effect.loop(true, {
      while: a => a,
      body: b => Effect.gen(function* () {
        // const p = yield *Queue.size(it.innerQueue);
        // const q = yield *Queue.size(it.outerQueue);
        // if (p === 0 && q === 0) {
        //   loop = false
        //   // yield* Queue.shutdown(it.innerQueue)
        //   // yield* Queue.shutdown(it.outerQueue)
        // }
        console.log('gen in queue wait');
        const inner = yield* Queue.take<GenInner>(it.innerQueue);
        // const fiber = yield* Effect.fork(Queue.take<GenInner>(InnerQueue))
        // const inner = yield* Fiber.join(fiber)
        // console.log('genLoop gen in:', inner);
        if (inner.genNum >= it.MaxGen * 2) {
          if (inner.genNum > 0) {
            yield* it.appendContextGenIn(inner);  //  innerをcontextに追加するのは生成後、そのまえで付けるとprevに入ってしまう。 ここに来るにはすでにContextに入力されているからdaemonで検出されてここに来ているのだからここで入力を追加する必要はない
          }
          return;  //  func の無限ループを防ぐ
        }
        //  Generator処理
        const sysConfig = yield* ConfigService.getSysConfig();
        const gen = (yield* ConfigService.makeGenerator(inner.toGenerator, sysConfig)); //  settings?: ContextGeneratorSetting // TODO 統合したらすべて合わせる
        // const gen = yield *OllamaTextGenerator.make({model:'llama3.1',host:'http://192.168.11.121:11434'})
        //console.log('inner:',inner);
        const res = yield* gen.generateContext(inner, it); // 処理するコンテキスト、prevとして抽出適用するコンテキストの設定、
        if (inner.genNum > 0) {
          yield* it.appendContextGenIn(inner);  //  innerをcontextに追加するのは生成後、そのまえで付けるとprevに入ってしまう。 ここに来るにはすでにContextに入力されているからdaemonで検出されてここに来ているのだからここで入力を追加する必要はない
        }
        yield* it.appendContextGenOut(res);
        //  TODO 単純テキストをコンソールに出力するのはcontext処理内なのか、io処理内なのか
        console.log('genLoop gen out:', res.map(value => it.debugGenOuter(value)).join('\n'));
        //  出力に回ることになるのはtool指示のみ
        const io = res.filter(a => a.toolCallParam).map(b => ({
          ...b,
          genNum: inner.genNum + 1,
        }));
        it.clearStreamingText();
        console.log('genLoop gen io:', io);
        if (io.length > 0) {
          yield* Queue.offerAll(it.outerQueue, io);
        }
        // const p = yield *Queue.size(it.innerQueue);
        // const q = yield *Queue.size(it.outerQueue);
        // if (p === 0 && q === 0) {
        //   loop = false
        //   yield* Queue.shutdown(it.innerQueue)
        //   yield* Queue.shutdown(it.outerQueue)
        // }
      }),
      step: b => loop,
      discard: true,
    }).pipe(Effect.catchAll(a => Effect.logError('execGeneratorLoop error:', a.message,a.stack)));
    ;
  }

  enterOuter(outer: GenOuter) {
    const it = this;
    return Effect.gen(function* () {
      yield* Queue.offer(it.outerQueue, outer);
      yield* it.rerunLoop();
    });
  }

  execExternalLoop() {
    console.log('start execExternalLoop');
    const it = this;
    let loop = true;
    return Effect.loop(true, {
      while: a => a,
      body: b => Effect.gen(function* () {
        // const p = yield *Queue.size(it.innerQueue);
        // const q = yield *Queue.size(it.outerQueue);
        // if (p === 0 && q === 0) {
        //   loop = false
        //   // yield* Queue.shutdown(it.innerQueue)
        //   // yield* Queue.shutdown(it.outerQueue)
        // }
        console.log('IO in queue wait');
        const outer = yield* Queue.take(it.outerQueue);
        // const fiber = yield* Effect.fork(Queue.take(OuterQueue))
        // const outer = yield* Fiber.join(fiber)
        // console.log('IO loop mcp in:', outer);
        //  MCP処理
        const res = yield* it.solveMcp([outer]);
        const r = res.flat();
        console.log('IO loop mcp out:', r.map(v => JSON.stringify(v).slice(0, 200)).join('\n'));
        if (r.length > 0) {
          yield* Queue.offer(it.innerQueue, {
            avatarId: outer.avatarId,
            fromGenerator: 'mcp',
            toGenerator: outer.toGenerator,
            toolCallRes: r,
            genNum: outer.genNum + 1,
          });
        }
        // const p = yield *Queue.size(it.innerQueue);
        // const q = yield *Queue.size(it.outerQueue);
        // if (p === 0 && q === 0) {
        //   loop = false
        //   yield* Queue.shutdown(it.innerQueue)
        //   yield* Queue.shutdown(it.outerQueue)
        // }
      }),
      step: b => loop,
      discard: true,
    }).pipe(Effect.catchAll(a => Effect.logError('execExternalLoop error:', a)));
  }

  solveMcp(list: GenOuter[]) {
    const it = this;
    return Effect.gen(function* () {
      // yield *Effect.forEach(list.filter(value => value.outputText),a => AvatarService.getAvatarState(a.avatarId).pipe(
      //   Effect.andThen(a1 => {
      //     const mes = AsMessage.makeMessage({
      //       innerId: a.innerId,
      //         from: a1.Name,
      //       text: a.outputText,
      //       // subCommand: SubCommandSchema,
      //       // mediaUrl: Schema.String,
      //       // mediaBin: Schema.Any, //  ArrayBuffer
      //       // mimeType: Schema.String,
      //       // toolName: Schema.String,
      //       // toolData: Schema.Any,
      //       // textParts: Schema.Array(Schema.String),
      //       // llmInfo: Schema.String,
      //       // isExternal: Schema.Boolean,
      //     },'talk','bot','surface')
      //     a1.sendToWindow([mes]);
      //   })
      // ))
      const list3 = list.filter(value => value.toolCallParam !== undefined).map(value => {
        return Effect.gen(function* () {
          const x = value.toolCallParam!!.map(value1 => {
            console.log('call:', value1);
            return McpService.callFunction(it, value1).pipe(Effect.catchIf(a => a instanceof Error, e => {
                return Effect.succeed({
                  toLlm: {content: [{type: 'text', text: e.message}]}, call_id: value.innerId, status: 'ok',
                });
              }),
              Effect.andThen(a => {
                return {
                  name: value1.name,
                  callId: a.call_id,
                  results: a.toLlm as z.infer<typeof CallToolResultSchema>,
                };
              }));
          });
          return yield* Effect.all(x);
        });
        // return AvatarService.getAvatarState(value.avatarId).pipe(
        //   Effect.andThen(a => {
        //     const x = value.toolCallParam?.map(value1 => {
        //       return McpService.callFunction(a, value1);
        //     })
        //   }));
      });
      // const list2 = Effect.forEach(list.filter(value => value.toolCallParam !== undefined),value => {
      //   return AvatarService.getAvatarState(value.avatarId).pipe(
      //     Effect.andThen(a => McpService.callFunction(a, value.toolCallParam!!))
      //   )
      // })

      return yield* Effect.all(list3);
    });
  }


  checkGeneratorCount() {
    if (this.generatorMaxUseCount === undefined) {
      return false;
    }
    if (this.generatorMaxUseCount >= 0) {
      this.generatorMaxUseCount--;
      return false;
    }
    return true;
  }

  overMes = AsMessage.makeMessage({
    from: this.Name,
    text: 'generatorMaxUseCount is over',
  }, 'talk', 'bot', 'outer');

  /**
   * Executes a generator function with the provided messages and context.
   * ジェネレーター単体実行 ログに追加するかどうかは呼び元で考える
   * @param {ContextGenerator} gen - The generator instance to handle context generation and processing.
   * @param {AsMessage[]} message - An array of messages to be processed by the generator.
   * @param setting
   * @return {Effect} The resulting effect of the generator execution, typically a new context generated by the generator.
   */
  execGenerator(gen: ContextGenerator, message: AsMessage, setting:ContextGeneratorSetting) {  //  context: AsMessage[] = []
    const it = this;
    console.log('in execGenerator:',AsMessage.debugLog(message))
    // console.log('in execGenerator:', JSON.stringify(message).slice(0, 200), JSON.stringify(context).slice(0, 200));
    return Effect.gen(function* () {
      it.sendRunningMark(message.id, true, gen.Name);
      //  log出力はgenerateContext内で行っている
      yield* it.enterInner({
        avatarId: it.id,
        fromGenerator: message.content.generator || 'external',
        toGenerator: gen.Name,
        input: {
          from: message.content.from,
          text: message.content.text,
        },
        genNum: 1,  //  この入力はまだcontextに追加されていないので1から開始して追加させる
        setting: {
          // noTool:true
          toClass:setting.toClass,
          toRole:setting.toRole,
          toContext:setting.toContext,
        },
      });
      //   .pipe(
      //   // Effect.tap(a => it.addContext(a)),
      //   Effect.tap(a => {
      //     //  TODO 組み込みMCPが追加スケジュールをコールバックpostしている形になっている。ここでPostがあれば内容のスケジュールを追加して、スケジューラーを構築しなおす
      //     const now = dayjs();
      //     console.log('in spool:');
      //     return it.daemonStatesQueue.takeAll.pipe(Effect.andThen(a1 => {
      //       Chunk.forEach(a1, daemon =>
      //         it.makeTimeDaemon(daemon, now).pipe(Effect.andThen(daemonFiber => {
      //           if (daemonFiber.length > 0) {
      //             it.fiberTimers.pipe(SynchronizedRef.update(a2 => {
      //               a2.push(daemonFiber[0]);
      //               return a2;
      //             }));
      //           }
      //         })));
      //       console.log('end spool:');
      //       return Effect.succeed(1);
      //     }));
      //   }),
      //   // Effect.tap(_ => it.clearStreamingText()),
      //   Effect.tap(_ => it.sendRunningMark(message.id, false)),
      // );
      console.log('start loop');
      // yield *Fiber.awaitAll([fiberInner]).pipe(Effect.tap(_ => Effect.log('end loop fiber')))

      const now = dayjs();
      console.log('in spool:');
      return yield* it.daemonStatesQueue.takeAll.pipe(Effect.andThen(a1 => {
        Chunk.forEach(a1, daemon =>
          it.makeTimeDaemon(daemon, now).pipe(Effect.andThen(daemonFiber => {
            if (daemonFiber.length > 0) {
              it.fiberTimers.pipe(SynchronizedRef.update(a2 => {
                a2.push(daemonFiber[0]);
                return a2;
              }));
            }
          })));
        console.log('end spool:');
        return Effect.succeed(1);
      }));
    })
      .pipe(
        Effect.tap(a => {
          it.sendRunningMark(message.id, false);
        }),
        Effect.catchAll(e => {
          console.log('execGenerator error:', e);
          it.sendRunningMark(message.id, false);
          this.showAlert(`execGenerator error:${e}`);
          return Effect.fail(e);
        }),
      );
  }

  private rerunLoop() {
    const it = this;
    return Effect.gen(function* () {
      if (it.fiberInner) {
        const s = yield* it.fiberInner.status;
        // console.log('fiberInner status:', s);
        if (FiberStatus.isDone(s)) {
          it.fiberInner = yield* Effect.forkDaemon(it.execGeneratorLoop().pipe(
            Effect.tapError(e => Effect.logError('fiberInner error:', e)), Effect.andThen(a => Effect.log('end gen fork'))));
        }
      } else {
        it.fiberInner = yield* Effect.forkDaemon(it.execGeneratorLoop().pipe(
          Effect.tapError(e => Effect.logError('fiberInner error:', e)), Effect.andThen(a => Effect.log('end gen fork'))));
      }
      if (it.fiberOuter) {
        const s = yield* it.fiberOuter.status;
        // console.log('fiberOuter status:', s);
        if (FiberStatus.isDone(s)) {
          it.fiberOuter = yield* Effect.forkDaemon(it.execExternalLoop().pipe(
            Effect.tapError(e => Effect.logError('fiberOuter error:', e)), Effect.andThen(a => Effect.log('end io fork'))));
        }
      } else {
        it.fiberOuter = yield* Effect.forkDaemon(it.execExternalLoop().pipe(
          Effect.tapError(e => Effect.logError('fiberOuter error:', e)), Effect.andThen(a => Effect.log('end io fork'))));
      }
    });
  }

  /**
   * ジェネレーター単体実行→結果を会話コンテキストに追加する
   * 生成元を追加するかどうかは
   * @param gen
   * @param modUserMessage
   */

  /*
    execGeneratorToContext(gen: ContextGenerator, modUserMessage: AsMessage[]) {
      const it = this;
      return Effect.gen(function* () {
        if (it.checkGeneratorCount()) {
          return [it.overMes];
        }
        if (modUserMessage.length === 0) {
          return [];
        }
        it.sendRunningMark(modUserMessage[0].id, true, gen.Name);
        const context = yield* it.TalkContextEffect;
        yield* gen.setPreviousContext(context);
        const {task} = yield* gen.setCurrentContext(modUserMessage.map(value => value.content));
        const output = modUserMessage.map((a, i) =>
          AsOutput.makeOutput(a, {
            provider: gen.Name,
            model: gen.Model,
            isExternal: false,
          }, i === 0 && Option.isSome(task) ? [task.value] : []));
        // const {task, output} = yield* gen.setCurrentContext(modUserMessage);
        // yield* it.addContext(modUserMessage);
        yield* DocService.addLog(output, it);
        const append = yield* gen.generateContext(task, it);    //  log出力はgenerateContext内で行っている
        yield* it.addContext(append);
        it.sendRunningMark(modUserMessage[0].id, false);
        console.log('execGeneratorToContext end');
        return append;
      });
    }
  */

  /**
   * MCP tool呼び出しなどのLLM外からのtool呼び出しを処理する
   * ユーザ入力操作に相当するため、
   * toolの出力結果からtextのデータのみ取りだし、ユーザからのenterInternalとして入力する
   */
  callMcpToolByExternal(params: ToolCallParam, gen: GeneratorProvider) {
    const it = this;
    return Effect.gen(function* () {
      const res = yield* McpService.callFunction(it, params).pipe(Effect.catchIf(a => a instanceof Error, e => {
        return Effect.succeed({
          toLlm: {content: [{type: 'text', text: e.message}]}, call_id: params.callId, status: 'ok',
        });
      }));
      let text = ''
      if (typeof res.toLlm.content === 'string') {
        text = res.toLlm.content;
      } else {
        text = (res.toLlm.content as {text:string}[]).map(value => value.text).join('\n');
      }
      console.log('callMcpToolByExternal text:',text);
      //  TODO MCP-UIからのtool呼び出しの場合はその結果をとりあえずAIには渡さない ここにhtmlが来ていればそれは描画に送ってもよいかもしれない
      //         テキストのみをAIにテキストとして送る。htmlはリソースとして再描画に回したい その処理を行っているのはappendContextGenIn()だがこれを使い回せるのか、別実装を置いておくべきなのか。。
      yield *it.enterInner({
        avatarId: it.id,
        fromGenerator: 'external',
        toGenerator: gen,
        input: {
          from: it.Name,
          text: text,
          isExternal: true,
        },
        genNum: 0,
      });
      return 'ok'
    });

  }

  clearStreamingText() {
    this.sendToWindow([AsMessage.makeMessage({subCommand: 'deleteTextParts'}, 'system', 'system', 'outer')]);
  }

  sendRunningMark(id: string, isRunning: boolean, status = '') {
    this.sendToWindow([AsMessage.makeMessage({
        innerId: id,
        subCommand: isRunning ? 'addRunning' : 'delRunning',
        text: status,
      }, 'system', 'system', 'outer'),
      ],
    );

  }

  appendContextGenIn(a: GenInner) {
    console.log('appendContextGenIn:',this.debugGenInner(a).slice(0, 200));
    const list: AsMessageContent[] = [];
    if (a.input?.text) {
      const content: AsMessageContent = {
        innerId: a.input.innerId || short.generate(),
        from: this.Name,
        text: a.input.text,
        generator: a.toGenerator,
      };
      list.push(content);
    }
    if (a.toolCallRes) {
      const content: AsMessageContent[] = a.toolCallRes.map(value => {
        return {
          innerId: value.callId,
          from: this.Name,
          toolName: value.name,
          toolRes: value.results,
          generator: a.toGenerator,
        } as AsMessageContent;
      });
      list.push(...content);
    }
    return this.appendContext(list, a.setting);
  }
    appendContext(a: AsMessageContent[], setting?: ContextGeneratorSetting) {
      //  TODO 属性設定は再検討要
      const it = this;
      return Effect.gen(function* () {
        const bags = yield* Effect.forEach(a, value => {
          return Effect.gen(function* () {
            if (value.text) {
              return [AsMessage.makeMessage(value, setting?.toClass || 'talk', setting?.toRole || (value.isExternal ? 'human': 'bot'), setting?.toContext || 'surface')];
            }
            if (value.toolRes) {
              //  toolDataはここでmessage分解する
              const mes = yield* Effect.forEach((value.toolRes as z.infer<typeof CallToolResultSchema>).content, a2 => {
                return Effect.gen(function* () {
                  console.log('add toolCallRes:', JSON.stringify(a2).slice(0, 200));
                  if (a2.type === 'image') {
                    // con.mediaUrl = yield* DocService.saveDocMedia(nextId, a2.mimeType, a2.data, it.TemplateId);
                    // con.mimeType = 'image/png';
                    return [AsMessage.makeMessage({
                      from: it.Name,
                      innerId: value.innerId,
                      mediaUrl: yield* DocService.saveDocMedia(value.innerId || short.generate(), a2.mimeType, a2.data, it.TemplateId), //  TODO
                      mimeType: 'image/png',
                      generator: value.generator,
                    }, 'daemon', 'bot', 'outer')];
                  } else if (a2.type === 'resource') {
                    //  resourceはuriらしい resourceはLLMに回さないらしい
                    //  MCP UIの拡張uriを受け付ける htmlテキストはかなり大きくなりうるのでimageと同じくキャッシュ保存にする
                    // con.mediaUrl = a2.resource.uri;
                    // con.mimeType = a2.resource.mimeType;
                    if (a2.resource.uri && a2.resource.uri.startsWith('ui:/')) {
                      console.log('to save html');
                      //  TODO なんで型があってないんだろう。。
                      yield* DocService.saveMcpUiMedia(a2.resource.uri, a2.resource.text as string);
                    }
                    console.log('ui: generator:',value);
                    return [AsMessage.makeMessage({
                      from: it.Name,
                      innerId: value.innerId,
                      mediaUrl: a2.resource.uri,
                      toolName: value.toolName,
                      mimeType: a2.resource.mimeType,
                      generator: value.generator,
                    }, 'daemon', 'bot', 'outer')];
                  }
                  return [];

                });
              });
              return [AsMessage.makeMessage(value, setting?.toClass || 'physics', setting?.toRole || (value.toolReq ? 'toolIn' : 'toolOut'), 'inner')].concat(mes.flat());
            }
            return [];
          });
        }).pipe(Effect.andThen(a1 => a1.flat()));
        console.log('appendContext:\n', bags.map(value => AsMessage.debugLog(value)).join('\n'));
        it.sendToWindow(bags);
        // return Effect.succeed(bags);
        return yield* it.addContext(bags);
      });
    }

  appendContextGenOut(add: GenOuter[]) {
    const it = this;
    return Effect.forEach(add, a => {
      return Effect.gen(function* () {
        const list: AsMessage[] = [];
        if (a.outputText) {
          const content: AsMessageContent = {
            innerId: a.innerId,
            from: it.Name,
            text: a.outputText,
            generator: a.fromGenerator,
          };
          list.push(AsMessage.makeMessage(content, a.setting?.toClass || 'talk', a.setting?.toRole || 'bot', a.setting?.toContext || 'surface'));
        }
        if (a.outputImage) {
          const mime = 'image/png';
          const mediaUrl = yield* DocService.saveDocMedia(a.innerId, mime, a.outputImage, it.TemplateId);
          const content: AsMessageContent = {
            innerId: a.innerId,
            from: it.Name,
            mediaUrl,
            mimeType: mime,
            generator: a.fromGenerator,
          };
          list.push(AsMessage.makeMessage(content, a.setting?.toClass || 'talk', a.setting?.toRole || 'bot', a.setting?.toContext || 'outer'));
        }
        if (a.outputMediaUrl) {
          //  TODO 画像はこっちまでもってきて保存しているが、ボイスは生成時に保存しているがつじつまよいのか
          const content: AsMessageContent = {
            innerId: a.innerId,
            from: it.Name,
            mediaUrl: a.outputMediaUrl,
            mimeType: a.outputMime,
            generator: a.fromGenerator,
          };
          list.push(AsMessage.makeMessage(content, a.setting?.toClass || 'talk', a.setting?.toRole || 'bot', a.setting?.toContext || 'outer'));
        }
        if (a.toolCallParam) {
          const content: AsMessageContent[] = a.toolCallParam.map(value => {
            return {
              innerId: a.innerId,
              from: it.Name,
              toolName: value.name,
              toolReq: value,
              generator: a.fromGenerator,
            };
          });
          list.push(...content.map(value => AsMessage.makeMessage(value, 'physics', 'toolIn', 'inner')));
        }
        return list;
      });
    }).pipe(Effect.andThen(a => {
      const bags = a.flat();
      this.sendToWindow(bags);
      // return bags
      return this.addContext(bags);
    }));
  }


  debugGenInner(a: GenInner) {
    return `${a.fromGenerator},${a.toGenerator},${a.input?.text},${a.toolCallRes?.map(value => value.name).join(',')}`;
  }

  debugGenOuter(a: GenOuter) {
    return `${a.fromGenerator},${a.toGenerator},${a.outputText},${a.outputImage},${a.outputMediaUrl},${a.toolCallParam?.map(value => value.name).join(',')}`;
  }
  /*
  Asのジェネレータのコンテキストとの対応パターン

  1. 入力 実操作-user-context,mainLLM,出力assist でcontext追加(通常会話)
  2. 入力 スケジュール-user-context,mainLLM,出力 assist (スケジューラー強制指示、echoスケジューラー,idleタスク,openAI画像追記)
  3. 入力 user-context-加工,mainLLM,出力 assist (外部会話)
  4. 入力 system-noContext,別LLM, 出力 user-context-加工 (スケジューラー時報、スケジューラー補助画像生成)
  5. 入力 スケジュール-user-Context,mainLLM,出力 assist、contextリセット(サマライザー1)
  5. 入力 スケジュール-user-noContext,別LLM,出力 user-context加工、contextリセット(サマライザー2)
  6. 入力 assist 出力 system noContext 外部へ (音声合成)

  大きくパターンは
  加工してuserのようにしてmainLLMへ出力(一種のauto User)

  別LLM(generator)で会話/コンテンツ処理して、結果を 加工してuserとしてmainLLMの入力にする(他LLM処理でのautoUser)

  別会話を入力も出力も加工して、別の人が話したようにそぶって加工してuserとしてmainLLMの入力にする(外部情報としてのuser追記)

  まったく関係なくデーモンとしてcontext処理(単純自動処理)



   */
}
