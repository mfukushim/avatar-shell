import {
  Chunk, Duration, Effect, Fiber, Queue, Ref, Schedule, Stream, SubscriptionRef, SynchronizedRef, FiberStatus,
} from 'effect';
import {
  AlertTask,
  AsMessage,
  AsMessageContent,
  AsOutput,
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
  info?: string,
}

interface TimeDaemonState {
  config: DaemonConfig,
  generator: ContextGenerator,
  info?: string,
  fiber: Fiber.RuntimeFiber<any, any>
}

export interface GenInner {
  avatarId: string;
  fromGenerator: ContentGenerator;
  toGenerator: GeneratorProvider;
  input?: AsMessage;
  // input?: AsMessageContent;
  toolCallRes?: {
    name: string,
    callId: string,
    results: z.infer<typeof CallToolResultSchema>
  }[],
  genNum: number,
  setting?: ContextGeneratorSetting,
}

export interface GenOuter {
  avatarId: string;
  fromGenerator: ContentGenerator;
  toGenerator: GeneratorProvider;
  innerId: string;
  toolCallParam?: ToolCallParam[];
  outputText?: string;
  outputRaw?: string;
  outputMediaUrl?: string;
  outputMime?: string;
  genNum: number
  setting?: ContextGeneratorSetting,
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
    private prevBuffer: SynchronizedRef.SynchronizedRef<AsMessage[]>,
    private talkContext: SynchronizedRef.SynchronizedRef<AsMessage[]>,
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
    this.avatarConfig = config; //  TODO 強制置き換えでよいか? llmの途中置き換えがあるならaskAiとの間にはロックがあるべき。。
    if (config.general.maxGeneratorUseCount === 0) {
      this.generatorMaxUseCount = undefined;
    } else {
      this.generatorMaxUseCount = config.general.maxGeneratorUseCount;
    }
    const it = this;
    return Effect.gen(function* () {
      yield* it.restartDaemonSchedules(config.daemons).pipe(
        Effect.catchAll(e => {
          console.log('changeApplyAvatarConfig error:', e);
          it.showAlert(`avatar config error:${e}`);
          return Effect.void;
        }));
      const needWizard = yield* ConfigService.needWizard();
      if (it.window) {
        it.window.webContents.send('init-avatar', it.id, it.Name, config, needWizard, it.userName);
      }
      const start = yield* it.talkContext.get.pipe(Effect.map(a => a.length === 0));
      if (start) {
        yield* it.daemonStates.pipe(Ref.get).pipe(Effect.andThen(Effect.forEach(a => {
          if (a.config.trigger.triggerType === 'Startup') {
            return it.execDaemon(a, []);
          }
          return Effect.succeed([]);
        })));
      }
    });
    /*
        return this.restartDaemonSchedules(config.daemons).pipe(
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
          Effect.andThen(_ => {
            if(this.TalkContextEffect.get.pipe(Effect.map(a => a.length === 0)))
            return  this.daemonStates.pipe(Ref.get).pipe(Effect.andThen(Effect.forEach(a => {
              console.log('a:',a);
              if(a.config.trigger.triggerType === 'Startup')  {
                return this.execDaemon(a, []);
              }
              return Effect.succeed([]);
            })), Effect.andThen(a => a.flat()));

          }),
        );
    */
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
              const items = take.delta.map(a => {
                return {
                  ...a,
                  isContextAdded: true,
                };
              });
              yield* SynchronizedRef.update(it.talkContext, a => a.concat(items));
              yield* DocService.addLog(items.map(value => (AsOutput.makeOutput(value))), it);
              yield* it.detectTalkContext(take);
            }),
          step: c => c,
          discard: true,
        }),
      );
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
      console.log('timeDaemonList:',timeDaemonList);
      const daemonList = yield* Effect.forEach(timeDaemonList, a => it.makeDaemonSet(a, sysConfig));
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
    console.log('makeTimeDaemon:', daemon);
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
        sec = (daemon.config.trigger.condition.min || 1) * 60;
        console.log('TimerMin:', sec);
        break;
      case 'TalkAfterMin': //リスタート時は登録しない。askAi以降で実行
        sec = 10000
        console.log('TalkAfterMin:', sec);
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
      yield* Queue.offer(it.daemonStatesQueue, daemon);
    });
  }

  rebuildIdle(): Effect.Effect<void, Error, ConfigService | DocService | McpService | MediaService> {
    //  現在機能しているTimerMinとTalkAfterMin(繰り返しが発生しうるもののみ,context追加でリセットがかかるもの)のみについて再タイマーを設定する
    console.log('rebuildIdle');
    return this.resetTimerDaemon(a => a.isEnabled && a.trigger.triggerType === 'TalkAfterMin');
  }

  //  この中ではfiberの条件は変更しないことにする。変更できると処理が複雑すぎる。条件のものを停止してタイマー再起動するだけ、破棄生成もしない
  resetTimerDaemon(resetFilter: (a: DaemonConfig) => boolean) {
    const it = this;
    //  既存の動いているfiberの中で指定条件で動いているfiberをすべて止める。generatorは破棄しない
    //  新たにdaemonsリストから再起動するべきdaemonを選ぶ
    console.log('resetTimerDaemon:')
    return Effect.gen(function* () {
      // const stopList = (yield *it.timeDaemonStates.get).filter(a => resetFilter(a.config));
      yield* it.fiberTimers.get.pipe(Effect.andThen(a1 => {
        console.log('fiberTimers:',a1);
        return Effect.forEach(a1.filter(value => resetFilter(value.config)), a => Fiber.interrupt(a.fiber));
      }));
      const now = dayjs();
      return yield* SynchronizedRef.updateEffect(it.fiberTimers, b => {
        console.log('fiberTimers2:',b);
        return Effect.forEach(b.filter(value => resetFilter(value.config)), a => {
          console.log('oneTimer reset:',a.config);
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


  detectTalkContext(updated: {context: AsMessage[], delta: AsMessage[]}) {
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
      console.log('execScheduler:', daemon.config.name, daemon);
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
      let addToBuffer = true
      if (triggerMes) {
        //  TODO trigger型の場合、そのメッセージはすでにcontextに追加されているものであり、以前のcontextはそのメッセージの前までになる 電文は基本再加工されない。電文の再加工が許されるのは入出力ともにコンテキストに追加しない場合のみ
        if (daemon.config.exec.directTrigger) {
          //  ダイレクト
          message = triggerMes;  //  すでに追加済みなのでaddContentには追加しない
          // console.log('direct trigger:',triggerMes);
          addToBuffer = !triggerMes.isContextAdded;
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
              generator:'daemon',
            },
          } as AsMessage;
          const ext = yield *state.extendAndSaveContext([message],true)
          yield *state.addContext(ext)
          //  ここは新規なので追加
        }
        //  トリガーの場合はコンテキストはトリガー位置まででフィルタする
        const pos = context.findLastIndex(value => value.id === triggerMes.id);
        if (pos >= 0) {
          context = context.slice(0, pos);
        }
      } else {
        //  非トリガー
        text = daemon.config.exec.templateGeneratePrompt;
        //  非トリガーの指示はdaemon,system,innerである。その生成結果はtoClass,toRole,toContextになる
        message =
          AsMessage.makeMessage({
            from: state.Name,
            text: text,
            generator: 'daemon', //daemon.generator.Name,
            isExternal: true, //  LLMループの外からの操作なのでtrue
          }, 'daemon', 'system', 'inner');
        //  ここは新規なので追加
        const ext = yield *state.extendAndSaveContext([message])
        yield *state.addContext(ext)

      }
      //  TODO generatorが処理するprevContextはsurface,innerのみ、またaddDaemonGenToContext=falseの実行daemonは起動、結果ともにcontextには記録しない また重いメディアは今は送らない
      const out = yield* state.execGenerator(daemon.generator, message, daemon.config.exec.setting,addToBuffer);  //  filteredContext
      console.log('execGenerator out:', out);
      return [];
    });
  }


  get ScheduleList() {
    const it = this;
    return Effect.gen(function* () {
      const daemons = yield* it.daemonStates.pipe(Ref.get, Effect.andThen(a => {
        return a.map(v => ({
          id: v.config.id,
          name: v.config.name,
          trigger: v.config.trigger,
          info: v.info
        }));
      }));
      return daemons.concat(yield* it.fiberTimers.pipe(Ref.get, Effect.andThen(a => {
        return a.map(v => {
          return ({
            id: v.config.id,
            name: v.config.name,
            trigger: v.config.trigger,
            info: v.info,
          });
        });
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
      const prevMes = yield* SynchronizedRef.make<AsMessage[]>([]);
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
        prevMes,
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
      return avatar;
    });
  }

  stopAvatar() {
    //  ワンタイムでContext変動によるdaemonの実行を無視させる
    this.forcedStopDaemons = true;
  }


  /**
   *
   * @param bags
   * @param isExternal 外部から与えたコンテキスト これはLLMのprev contextには追加されない LLMの認識できるコンテキストはLLM自身が発生したものとdaemonが検出したものだけになるべきだから?
   */
  extendAndSaveContext(bags: AsMessage[], isExternal?: boolean) {
    if (bags.length === 0) {
      return Effect.succeed([]);  //  更新の無限ループ防止
    }
    console.log('extendAndSaveContext', bags.map(value => AsMessage.debugLog(value)).join('\n'));
    const it = this;
    return Effect.forEach(bags, mes => {
        return Effect.gen(function* () {
          //  TODO 本来socket.ioから自分の電文は来ないはずだが、来ることがあるのでフィルタする。。。
          const current = yield* it.talkContext.get;
          const isSame = current.find(value => value.id === mes.id);
          if (isSame) {
            console.log('extendAndSaveContext same id:', mes);
            return undefined;
          }
          if (mes.content.mediaBin && mes.content.mimeType?.startsWith('image/')) {
            const img = Buffer.from(mes.content.mediaBin).toString('base64');
            const mediaUrl = yield* DocService.saveDocMedia(mes.id, mes.content.mimeType, img, it.templateId);
            return {
              ...mes,
              content: {
                ...mes.content,
                mediaBin: undefined,
                mediaUrl: mediaUrl,
                isExternal,
              },
            } as AsMessage;
          } else if (mes.content.mediaBin && mes.content.mimeType?.startsWith('text/')) {
            return {
              ...mes,
              content: {
                ...mes.content,
                mediaBin: undefined,
                text: Buffer.from(mes.content.mediaBin).toString('utf-8'),
                isExternal,
              },
            } as AsMessage;
          } else {
            return {
              ...mes,
              content: {
                ...mes.content,
                isExternal,
              },
            };
          }
        });
      }).pipe(Effect.andThen(a => a.filter((v): v is  AsMessage => v !== undefined)));
  }

  addContext(bags: AsMessage[]) {
    const it = this;
    return Effect.gen(function* () {
      if (bags.length > 0) {
        const context = yield* it.talkContext;
        return yield* it.talkQueue.offer({context: context.concat(bags), delta: bags});
      }
    })
  }

  MaxGen = 2;  //  TODO 世代の最適値は

  enterInner(inner: GenInner,addToBuffer=true) {
    const it = this;
    return Effect.gen(function* () {
      if (addToBuffer) {
        yield* it.appendPreBufferGenIn(inner);
      }
      yield* Queue.offer(it.innerQueue, inner);
      yield* it.rerunLoop();
    });
  }

  execGeneratorLoop() {
    console.log('start execGeneratorLoop');
    const it = this;
    let loop = true;
    return Effect.loop(true, {
      while: a => a,
      body: b => Effect.gen(function* () {
        console.log('gen in queue wait');
        const inner = yield* Queue.take<GenInner>(it.innerQueue);
        if (inner.genNum >= it.MaxGen * 2) {
          // if (inner.genNum > 0) {
          //   yield* it.appendContextGenIn(inner);  //  innerをcontextに追加するのは生成後、そのまえで付けるとprevに入ってしまう。 ここに来るにはすでにContextに入力されているからdaemonで検出されてここに来ているのだからここで入力を追加する必要はない
          // }
          yield *it.resetPrevBuffer()
          it.clearStreamingText();
          return;  //  func の無限ループを防ぐ
        }
        //  Generator処理
        const sysConfig = yield* ConfigService.getSysConfig();
        const gen = (yield* ConfigService.makeGenerator(inner.toGenerator, sysConfig)); //  settings?: ContextGeneratorSetting // TODO 統合したらすべて合わせる
        const res = yield* gen.generateContext(inner, it); // 処理するコンテキスト、prevとして抽出適用するコンテキストの設定、
        // if (inner.genNum > 0) {
        //   yield* it.appendContextGenIn(inner);  //  innerをcontextに追加するのは生成後、そのまえで付けるとprevに入ってしまう。 ここに来るにはすでにContextに入力されているからdaemonで検出されてここに来ているのだからここで入力を追加する必要はない
        // }
        yield *it.resetPrevBuffer()
        yield* it.appendContextGenOut(res);
        //  TODO 単純テキストをコンソールに出力するのはcontext処理内なのか、io処理内なのか
        console.log('genLoop gen out:', res.map(value => it.debugGenOuter(value)).join('\n'));
        //  出力に回ることになるのはtool指示のみ
        const io = res.filter(a => a.toolCallParam).map(b => ({
          ...b,
          genNum: inner.genNum + 1,
        }));
        // it.clearStreamingText();
        console.log('genLoop gen io:', io.map(v => it.debugGenOuter(v)));
        if (io.length > 0) {
          yield* Queue.offerAll(it.outerQueue, io);
        } else {
          it.clearStreamingText();
        }
      }),
      step: b => loop,
      discard: true,
    }).pipe(Effect.catchAll(a => Effect.logError('execGeneratorLoop error:', a.message, a.stack)));
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
        console.log('IO in queue wait');
        const outer = yield* Queue.take(it.outerQueue);
        //  MCP処理
        const res = yield* it.solveMcp([outer]);
        const r = res.flat();
        console.log('IO loop mcp out:', r.map(v => JSON.stringify(v).slice(0, 200)).join('\n'));
        if (r.length > 0) {
          const inner:GenInner = {
            avatarId: outer.avatarId,
            fromGenerator: 'mcp',
            toGenerator: outer.toGenerator,
            toolCallRes: r,
            genNum: outer.genNum + 1,
          };
          yield* it.appendPreBufferGenIn(inner);  //  io結果は追加する
          yield* Queue.offer(it.innerQueue, inner);
        }
      }),
      step: b => loop,
      discard: true,
    }).pipe(Effect.catchAll(a => Effect.logError('execExternalLoop error:', a)));
  }

  solveMcp(list: GenOuter[]) {
    const it = this;
    return Effect.gen(function* () {
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
      });
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
   * @param addToBuffer
   * @return {Effect} The resulting effect of the generator execution, typically a new context generated by the generator.
   */
  execGenerator(gen: ContextGenerator, message: AsMessage, setting: ContextGeneratorSetting,addToBuffer=true) {  //  context: AsMessage[] = []
    const it = this;
    console.log('in execGenerator:',addToBuffer, AsMessage.debugLog(message));
    // console.log('in execGenerator:', JSON.stringify(message).slice(0, 200), JSON.stringify(context).slice(0, 200));
    return Effect.gen(function* () {
      it.sendRunningMark(message.id, true, gen.Name);
      //  log出力はgenerateContext内で行っている
      yield* it.enterInner({
        avatarId: it.id,
        fromGenerator: message.content.generator || 'external',
        toGenerator: gen.Name,
        input:message,
        // input: {
        //   from: message.content.from,
        //   text: message.content.text,
        //   isExternal: message.content.isExternal,
        //   // isExternal: true  //  TODO execGeneratorから来るものを外部=userと見なしてよいのかは検討要
        // },
        genNum: 1,  //  この入力はまだcontextに追加されていないので1から開始して追加させる
        setting: {
          // noTool:true
          toClass: setting.toClass,
          toRole: setting.toRole,
          toContext: setting.toContext,
        },
      },addToBuffer);
      console.log('start loop');

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
      let text = '';
      if (typeof res.toLlm.content === 'string') {
        text = res.toLlm.content;
      } else {
        text = (res.toLlm.content as {text: string}[]).map(value => value.text).join('\n');
      }
      console.log('callMcpToolByExternal text:', text);
      //  TODO MCP-UIからのtool呼び出しの場合はその結果をとりあえずAIには渡さない ここにhtmlが来ていればそれは描画に送ってもよいかもしれない
      //         テキストのみをAIにテキストとして送る。htmlはリソースとして再描画に回したい その処理を行っているのはappendContextGenIn()だがこれを使い回せるのか、別実装を置いておくべきなのか。。
      yield* it.enterInner({
        avatarId: it.id,
        fromGenerator: 'external',
        toGenerator: gen,
        input: AsMessage.makeMessage({
            from: it.Name,
            text: text,
            isExternal: true,
        },'physics','toolOut','inner'),
        // input: {
        //   from: it.Name,
        //   text: text,
        //   isExternal: true,
        // },
        genNum: 0,
      });
      return 'ok';
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

/*
  appendPreBufferGenIn(a: GenInner) {
    console.log('appendPreBufferGenIn:', this.debugGenInner(a).slice(0, 200));
    console.log(a);
    const list: AsMessage[] = [];
    if (a.input) {
      list.push(a.input);
    }
    // if (a.input?.text) {
    //   const content: AsMessageContent = {
    //     innerId: a.input.innerId || short.generate(),
    //     from: this.Name,
    //     text: a.input.text,
    //     generator: a.toGenerator,
    //     isExternal: a.input.isExternal,
    //   };
    //   list.push(content);
    // }
    if (a.toolCallRes) {
      const content: AsMessage[] = a.toolCallRes.map(value => {
        return AsMessage.makeMessage({
          innerId: value.callId,
          from: this.Name,
          toolName: value.name,
          toolRes: value.results,
          generator: a.toGenerator,
          isExternal: a.input?.content?.isExternal,
        },'physics','toolOut','inner');
        // return {
        //   innerId: value.callId,
        //   from: this.Name,
        //   toolName: value.name,
        //   toolRes: value.results,
        //   generator: a.toGenerator,
        //   isExternal: a.input?.isExternal,
        // } as AsMessageContent;
      });
      list.push(...content);
    }
    return this.appendPrevBuffer(list, a.setting);
  }
*/

  appendPreBufferGenIn(a: GenInner,addToBuffer=true) {
    //  TODO 属性設定は再検討要
    const it = this;
    return Effect.gen(function* () {
      const bags:AsMessage[] = [];
      if (a.input) {
        bags.push(a.input);
      }
      if (a.toolCallRes) {
        const bags2 = yield* Effect.forEach(a.toolCallRes, value => {
          //  toolDataはここでmessage分解する
          return Effect.forEach((value.results as z.infer<typeof CallToolResultSchema>).content, a2 => {
            return Effect.gen(function* () {
              console.log('add toolCallRes:', JSON.stringify(a2).slice(0, 200));
              //  ここでtool結果から抽出するのは、ユーザ都合で表示させたい画像やhtmlだけなので、これはouterで抽出する
              if (a2.type === 'text') {
                return [AsMessage.makeMessage({
                  from: it.Name,
                  innerId: value.callId,
                  text: a2.text,
                  generator: a.fromGenerator,
                }, 'daemon', 'toolOut', 'surface')];
              } else if (a2.type === 'image') {
                // con.mediaUrl = yield* DocService.saveDocMedia(nextId, a2.mimeType, a2.data, it.TemplateId);
                // con.mimeType = 'image/png';
                return [AsMessage.makeMessage({
                  from: it.Name,
                  innerId: value.callId,
                  mediaUrl: yield* DocService.saveDocMedia(value.callId || short.generate(), a2.mimeType, a2.data, it.TemplateId), //  TODO
                  mimeType: 'image/png',
                  generator: a.fromGenerator,
                }, 'daemon', 'toolOut', 'surface')];
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
                console.log('ui: generator:', value);
                return [AsMessage.makeMessage({
                  from: it.Name,
                  innerId: value.callId,
                  mediaUrl: a2.resource.uri,
                  toolName: value.name,
                  mimeType: a2.resource.mimeType,
                  generator: a.fromGenerator,
                }, 'daemon', 'toolOut', 'outer')];
              }
              return [];

            });
            //  AIはtool responseがあったことを対として認識できないといけない。そのための独立toolRes。これを実際にLLMのprevに戻すべきかは各LLMの特性による
            // return [AsMessage.makeMessage(value, setting?.toClass || 'daemon', setting?.toRole || (value.toolReq ? 'toolIn' : 'toolOut'), 'inner')].concat(mes.flat()); //  テキストはLLMに読ませてLLMから返答させる必要があるからinner
          }).pipe(Effect.andThen(a1 => a1.flat()));

        })
        bags.push(...bags2.flat());
      }
      console.log(`appendContext:addToBuffer:${addToBuffer}\n`, bags.map(value => AsMessage.debugLog(value)).join('\n'));
      it.sendToWindow(bags);
      // return Effect.succeed(bags);
      if (addToBuffer) {
        return yield* it.addPrevBuffer(bags);
      }
      const ext = yield *it.extendAndSaveContext(bags)
      return yield *it.addContext(ext)
    });
  }

  addPrevBuffer(bags: AsMessage[]) {
    return SynchronizedRef.update(this.prevBuffer, a => a.concat(bags));
  }

  resetPrevBuffer() {
    const it = this;
    return SynchronizedRef.updateEffect(this.prevBuffer, bags => {
      return Effect.gen(function* () {
        const ext = yield *it.extendAndSaveContext(bags)
        yield *it.addContext(ext)
        return [];
      })
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
        if (a.outputRaw && a.outputMime) {
          const mediaUrl = yield* DocService.saveDocMedia(a.innerId, a.outputMime, a.outputRaw, it.TemplateId);
          const content: AsMessageContent = {
            innerId: a.innerId,
            from: it.Name,
            mediaUrl,
            mimeType: a.outputMime,
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
          list.push(...content.map(value => AsMessage.makeMessage(value, 'daemon', 'toolIn', 'inner')));
        }
        return list;
      });
    }).pipe(Effect.andThen(a => {
      const bags = a.flat();
      this.sendToWindow(bags);
      // return bags
      return this.extendAndSaveContext(bags)
    }),Effect.andThen(a => this.addContext(a)));
  }


  debugGenInner(a: GenInner) {
    return `%%${a.fromGenerator},${a.toGenerator},${a.input?.content?.text},${a.toolCallRes?.map(value => value.name).join(',')}`;
  }

  debugGenOuter(a: GenOuter) {
    return `&&${a.fromGenerator},${a.toGenerator},${a.outputText},${a.outputRaw?.slice(0, 100)},${a.outputMediaUrl},${a.toolCallParam?.map(value => value.name).join(',')}`;
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
