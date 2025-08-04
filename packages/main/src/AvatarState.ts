import {
  Chunk,
  Duration,
  Effect,
  Fiber,
  Queue,
  Ref,
  Schedule,
  Stream,
  SubscriptionRef,
  SynchronizedRef,
  Option,
} from 'effect';
import {
  AlertTask,
  AsMessage, AvatarSetting,
  ContextTrigger,
  ContextTriggerList, DaemonConfig,
  SchedulerList,
  TimerTriggerList, SysConfig, AsOutput,
} from '../../common/Def.js';
import {BrowserWindow} from 'electron';
import dayjs from 'dayjs';
import {ConfigService} from './ConfigService.js';
import {DocService} from './DocService.js';
//  @ts-ignore
import duration from 'dayjs/plugin/duration';
import {ContextGenerator} from './ContextGenerator.js';
import short from 'short-uuid';
//  @ts-ignore
import expand_template from 'expand-template';
import {MediaService} from './MediaService.js';
import {McpService} from './McpService.js';

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

export class AvatarState {
  private readonly tag: string;
  // private mainLlmGenerator?: ContextGenerator;
  private summaryCounter: number = 0;
  private externalTalkCounter: number = 0;
  private generatorMaxUseCount: number | undefined;

  fiberConfig: Fiber.RuntimeFiber<any, any> | undefined;
  fiberTalkContext: Fiber.RuntimeFiber<any, any> | undefined;

  constructor(
    private id: string,
    private templateId: string,
    private name: string,
    private userName: string,
    private window: BrowserWindow,
    private avatarConfig: AvatarSetting,
    private talkContext: SubscriptionRef.SubscriptionRef<{context: AsMessage[], delta: AsMessage[]}>,
    private talkSeq: number,
    private daemonStates: Ref.Ref<DaemonState[]>,
    private daemonStatesQueue: Queue.Queue<DaemonState>,  //  Echo Mcpで追加された予定をキューする
    // private timeDaemonStates: Ref.Ref<DaemonState[]>,
    private fiberTimers: SynchronizedRef.SynchronizedRef<TimeDaemonState[]>,
  ) {
    // this.previousResponseId = null;
    this.tag = `${id}_${name}_${dayjs().format('YYYYMMDDHHmmss')}`;
  }

  private changeApplyAvatarConfig(config: AvatarSetting) {
    console.log('update changeApplyAvatarConfig:');
    const state = this;
    return Effect.gen(function* () {
      state.avatarConfig = config; //  TODO 強制置き換えでよいか? llmの途中置き換えがあるならaskAiとの間にはロックがあるべき。。

      // const sysConfig = yield* ConfigService.getSysConfig();
      // state.mainLlmGenerator = yield *ConfigService.makeLlmGenerator(state.avatarConfig.general.useLlm,sysConfig,config.general.mainLlmSetting)
      if (config.general.maxGeneratorUseCount === 0) {
        state.generatorMaxUseCount = undefined;
      } else {
        state.generatorMaxUseCount = config.general.maxGeneratorUseCount;
      }
      yield* state.restartDaemonSchedules(config.daemons);
    }).pipe(
      Effect.catchAll(e => {
        console.log('changeApplyAvatarConfig error:', e);
        state.showAlert(`avatar config error:${e}`);
        return Effect.void;
      }), //  configの設定エラーは普通に起きうる
      // Effect.catchAll(showAlertIfFatal('avatar config')), //  configの設定エラーは普通に起きうる
      Effect.andThen(_ => ConfigService.needWizard()),
      Effect.andThen(needWizard => {
        if (state.window) {
          state.window.webContents.send('init-avatar', state.id, state.Name, config, needWizard, state.userName);
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
      it.fiberTalkContext = yield* Effect.forkDaemon(it.talkContext.changes.pipe(Stream.runForEach(a => {
        console.log('avatarState update talkContext');
        return it.changeTalkContext(a);
      })));
    });
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
      return ConfigService.makeGenerator(config.exec.generator, sysConfig, config.exec.setting).pipe(Effect.andThen(a => {
        // yield *gen.initialize(sysConfig, a.exec.setting)
        return {
          config: config,
          generator: a,
        } as DaemonState;
      }));
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
        schedule = Schedule.fixed(interval);
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
    // return Effect.gen(function* () {
    //   const idleDaemonList = state.avatarConfig.daemons.filter(a => a.isEnabled && a.trigger.triggerType === 'TalkAfterMin');
    //   const daemonList = yield *Effect.forEach(idleDaemonList,a => {
    //     return Effect.gen(function*() {
    //       if (a.exec.generator) {
    //         const gen = yield * ConfigService.makeGenerator(a.exec.generator, sysConfig, a.exec.setting);
    //         // yield *gen.initialize(sysConfig, a.exec.setting)
    //         return {
    //           config:a,
    //           generator:gen
    //         } as DaemonState;
    //       }
    //       return {
    //         config:a,
    //       } as DaemonState;
    //
    //     })
    //   })
    //
    //   return yield* SynchronizedRef.updateEffect(state.fiberTimers, b => {
    //     return Effect.forEach(daemonList, a => {
    //       return Effect.gen(function* () {
    //         console.log('rebuild:',a);
    //         const find = b.find(value => value.config.id = a.config.id);
    //         if (find) {
    //           yield* Fiber.interrupt(find.fiber);
    //         }
    //         let interval;
    //         let schedule;
    //         if (a.config.trigger.condition.isRepeatMin) {
    //           const interval = Duration.decode(`${a.config.trigger.condition.min || 1} minutes`);
    //           schedule = Schedule.fixed(interval);
    //         } else {
    //           interval = Duration.decode(`${a.config.trigger.condition.min || 0} minutes`);
    //         }
    //         if (interval) {
    //           console.log('interval:',interval);
    //           return yield* Effect.forkDaemon(Effect.sleep(interval).pipe(Effect.andThen(_ => state.doTimeSchedule(a))))
    //             .pipe(Effect.andThen(a1 => [{config: a.config, fiber: a1}]));
    //         }
    //         if (schedule) {
    //           return yield* Effect.forkDaemon(state.doTimeSchedule(a).pipe(Effect.repeat(schedule)))
    //             .pipe(Effect.andThen(a1 => [{config: a.config, fiber: a1}]));
    //         }
    //         return [];
    //       });
    //     }).pipe(Effect.andThen(a1 => a1.flat()));
    //   });
    //
    // })
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
    console.log('changeTalkContext:', updated.context.length, updated.delta.length, updated.delta.map(value => JSON.stringify(value).slice(0, 200)).join('\n'));
    const state = this;
    return Effect.gen(function* () {
      //  TODO talkContextが更新されたら、daemon scheduleをチェックする
      const appendContext = yield* state.daemonStates.pipe(Ref.get).pipe(Effect.andThen(Effect.forEach(a => {
        console.log('update changeTalkContext len:', updated.context.length, updated.delta.length);
        switch (a.config.trigger.triggerType as ContextTrigger) {
          case 'Startup':
            if (updated.context.length === 0 && updated.delta.length == 0) {
              return state.execDaemon(a, updated.context);
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
            return find ? state.execDaemon(a, updated.context, find) : Effect.succeed([]);
          case 'IfSummaryCounterOver':
            //  TODO 今は簡略化のため、会話数で決定する
            state.summaryCounter += updated.delta.length;
            if (a.config.trigger.condition.countMax && state.summaryCounter > a.config.trigger.condition.countMax) {
              return state.execDaemon(a, updated.context).pipe(Effect.tap(_ => state.summaryCounter = 0));
            }
            return Effect.succeed([]);
          case 'IfExtTalkCounterOver':
            state.externalTalkCounter += updated.delta.filter(value => value.content.isExternal).length;
            if (a.config.trigger.condition.countMax && state.externalTalkCounter > a.config.trigger.condition.countMax) {
              return state.execDaemon(a, updated.context).pipe(Effect.tap(_ => state.externalTalkCounter = 0));
            }
            return Effect.succeed([]);
        }
        return Effect.fail(new Error('unknown triggerType'));
      })), Effect.andThen(a => a.flat()));
      //yield* state.addContext(appendContext); 各execScheduler内で追加判断している それに全部をループする前に追加をするものもあるのでdeltaが更新されない
    });
  }

  private calcTemplate(template: string, source: AsMessage) {
    return expand(template, {
      from: source.content.from,
      body: source.content.text,
    });
  }

  execDaemon(daemon: DaemonState, context: AsMessage[], triggerMes?: AsMessage) {
    const state = this;
    return Effect.gen(function* () {
      console.log('execScheduler:', daemon.config.name, triggerMes);
      /*
      テンプレートの基本構文
      from: 送付者のハンドル
      output: generateされたテキスト本体
      それ以外は必要時に追加していく
      '{from} said, "{output}"'
       */
      let toLlm: AsMessage[] = [];
      let text: any;
      let message: AsMessage|undefined;
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
          message = triggerMes  //  すでに追加済みなのでaddContentには追加しない
        } else {
          //  再加工
          text = daemon.config.exec.templateGeneratePrompt ? state.calcTemplate(daemon.config.exec.templateGeneratePrompt, triggerMes):triggerMes;
          message = {
            ...triggerMes,
            asClass: 'daemon',
            asRole: 'system',
            asContext: 'outer', //  trigger mesの場合、すでにtrigger元はcontextに追加済みである。よってこれはcontextには含まれない
            content: {
              ...triggerMes.content,
              text: text,
            },
          } as AsMessage
          yield *state.addContext([message])  //  ここは新規なので追加
        }
        //  トリガーの場合はコンテキストはトリガー位置まででフィルタする
        const pos = context.findLastIndex(value => value.id === triggerMes.id);
        if (pos >= 0) {
          context = context.slice(0, pos );
        }
          // console.log('execScheduler triggerMes:', text);
        // }
      } else {
        //  非トリガー
        text = daemon.config.exec.templateGeneratePrompt;
        message =
          AsMessage.makeMessage({
            from: state.Name,
            text: text,
          }, 'daemon', 'system', daemon.config.exec.setting.toContext || 'inner') //  TODO 調整要 非trigger mesの場合、条件によって自律生成される。これはaddDaemonGenToContextにより、trueならinner,falseならouterになる 'inner'
        yield *state.addContext([message])  //  ここは新規なので追加
      }
      //  TODO generatorが処理するprevContextはsurface,innerのみ、またaddDaemonGenToContext=falseの実行daemonは起動、結果ともにcontextには記録しない また重いメディアは今は送らない

      const filteredContext = context.filter(value => value.asContext !== 'outer' && (!value.content.mimeType || !value.content.mimeType.startsWith('text')));

      console.log('execScheduler in:', message);
      const out = yield* state.execGenerator(daemon.generator, [message], filteredContext);
      console.log('execScheduler out:', out);
      //  出力用にroleとtextは再加工する
      toLlm = out.filter(a => (a.asRole === 'bot' || a.asRole === 'toolIn' || a.asRole === 'toolOut')).map(a => {
        if (a.asRole === 'toolIn' || a.asRole === 'toolOut') {
          return a;  //  tool入出力はクラス加工しない 原則そのまま
        }
        return {
          ...a,
          asClass: daemon.config.exec.setting?.toClass || 'daemon',
          asRole: daemon.config.exec.setting?.toRole || 'bot',
          asContext: daemon.config.exec.setting?.toContext || 'surface',
          content: {
            ...a.content,
          },
        } as AsMessage;
      });
      //  個別加工したプロンプトを会話コンテキストに送る
      console.log('toLlm:', toLlm.map(value => JSON.stringify(value).slice(0, 200)).join('\n'));
      if (toLlm.length > 0) {
        //  音声合成コンテンツの場合はここでrenderer側で音声再生を呼ぶ
        state.sendToWindow(toLlm);

        //  TODO addDaemonGenToContexthは意味合い上、class/roleの違いとしてコンテキストとして検出可能なものとして追加するかどうか、会話トリガーを発生させるものかどうかを分ける形になるはず
        //  TODO とりあえずの意味としてはトリガーになるかどうかの差になるのではないか?
        return toLlm; //  addContextは外で行う
      }

      return [];
    });
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
    return this.talkContext.pipe(SubscriptionRef.get, Effect.andThen(a => a.context));
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

  sendToWindow(bag: AsMessage[]) {
    if (this.window) {
      this.window.webContents.send('update-llm', bag);
    }
  }

  static make(id: string, templateId: string, name: string, window: BrowserWindow, userName: string) {
    return Effect.gen(function* () {
      console.log('avatarstate make');
      const configPub = yield* ConfigService.getAvatarConfigPub(templateId);

      const aConfig = yield* SubscriptionRef.get(configPub);
      const mes = yield* SubscriptionRef.make<{context: AsMessage[], delta: AsMessage[]}>({context: [], delta: []});
      const daemonStates = yield* Ref.make<DaemonState[]>([]);
      // const timeDaemonStates = yield* Ref.make<DaemonState[]>([]);
      const fiberTimers = yield* SynchronizedRef.make<TimeDaemonState[]>([]);
      const daemonStatesQueue = yield* Queue.dropping<DaemonState>(100);  //  Echo Mcpで追加された予定をキューする

      const avatar = new AvatarState(
        id, templateId, name, userName, window, aConfig,
        mes,
        0,
        daemonStates,
        daemonStatesQueue,
        // timeDaemonStates,
        fiberTimers,
      );

      avatar.fiberConfig = yield* Effect.forkDaemon(configPub.changes.pipe(Stream.runForEach(a => {
          console.log('avatarState update avatarConfig:');
          return avatar.changeApplyAvatarConfig(a); //  config更新
        }),
      ));

      return avatar;
    });
  }


  addContext(bags: AsMessage[], isExternal = false) {
    if (bags.length === 0) {
      return Effect.void;  //  更新の無限ループ防止
    }
    if (isExternal) {
      this.externalTalkCounter += bags.length;
    }
    console.log('addContext',bags.map(value => JSON.stringify(value).slice(0, 200)).join('\n'));
    // TODO ここにmediaBin等の変換保存を移動させる
    const it = this;
    return Effect.gen(function* () {
      const mesList = yield* Effect.forEach(bags, mes => {
        return Effect.gen(function* () {
          if (mes.content.mediaBin && mes.content.mimeType?.startsWith('image/')) {
            const img = Buffer.from(mes.content.mediaBin).toString('base64');
            const mediaUrl = yield* DocService.saveDocMedia(mes.id, mes.content.mimeType, img, it.templateId);
            return {
              ...mes,
              asClass: 'daemon',
              asRole: 'system',
              asContext: 'outer', //  trigger mesの場合、すでにtrigger元はcontextに追加済みである。よってこれはcontextには含まれない
              content: {
                ...mes.content,
                mediaBin: undefined,
                mediaUrl: mediaUrl,
              },
            } as AsMessage;
            /*
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
            */
          } else if (mes.content.mediaBin && mes.content.mimeType?.startsWith('text/')) {
            return {
              ...mes,
              asClass: 'daemon',
              asRole: 'system',
              asContext: 'outer', //  trigger mesの場合、すでにtrigger元はcontextに追加済みである。よってこれはcontextには含まれない
              content: {
                ...mes.content,
                mediaBin: undefined,
                text: Buffer.from(mes.content.mediaBin).toString('utf-8'),
              },
            } as AsMessage;
            /*
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
*/
          } else {
            return mes;
          }
        });

      });
      return yield* SubscriptionRef.update(it.talkContext, a => {
        return {context: a.context.concat(mesList), delta: mesList};
      });
    });

  }

  /**
   * 会話コンテキストを持つLLM実行
   * @param message
   */

  /*
    askAi(message: AsMessage[]) {
      return Effect.forEach(message, asMessage => {
        if (!this.mainLlmGenerator) {
          return Effect.fail(new Error('main llm not init'));
        }
        //  askAiから来るコンテンツには画像がmediaBinで来ることがあるので、それはmediaUrlに変換しておく
        if (asMessage.content.mimeType?.startsWith('image/') && asMessage.content.mediaBin) {
          const img = Buffer.from(asMessage.content.mediaBin).toString('base64');
          return DocService.saveDocMedia(asMessage.id, asMessage.content.mimeType, img, this.TemplateId).pipe(
            Effect.andThen(a => {
              return {
                ...asMessage,
                content: {
                  ...asMessage.content,
                  mediaBin: undefined,
                  mediaUrl: a,
                },
              };
            }),
          );
        }
        return Effect.succeed(asMessage);
      }).pipe(
        Effect.andThen(mes => this.execGeneratorToContext(this.mainLlmGenerator!!, mes)),
        Effect.tap(a => this.sendToWindow(a)),
        Effect.catchAll(e => {
          console.log('askAi error:', e);
          this.showAlert(`ask ai error:${e}`);
          return Effect.succeed([] as AsMessage[]);
        }),
      );
    }
  */

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
   * @param {AsMessage[]} [context=[]] - An optional context array to be used as the previous context.
   * @return {Effect} The resulting effect of the generator execution, typically a new context generated by the generator.
   */
  execGenerator(gen: ContextGenerator, message: AsMessage[], context: AsMessage[] = []) {
    const it = this;
    console.log('in execGenerator:', JSON.stringify(message), JSON.stringify(context));
    return Effect.gen(function* () {
      if (it.checkGeneratorCount()) {
        return [it.overMes];
      }
      if (message.length === 0) {
        return [];
      }
      it.sendRunningMark(message[0].id, true, gen.Name);
      yield* gen.setPreviousContext(context);
      const {task} = yield* gen.setCurrentContext(message.map(value => value.content));
      const output = message.map((a, i) =>
        AsOutput.makeOutput(a, {
          provider: gen.Name,
          model: gen.Model,
          isExternal: false,
        }, i === 0 && Option.isSome(task) ? [task.value] : []));
      // yield* it.addContext(message, false);
      yield* DocService.addLog(output, it);
      //  log出力はgenerateContext内で行っている
      return yield* gen.generateContext(task, it).pipe(
        Effect.tap(a => it.addContext(a)),
        Effect.tap(a => {
          //  TODO 組み込みMCPが追加スケジュールをコールバックpostしている形になっている。ここでPostがあれば内容のスケジュールを追加して、スケジューラーを構築しなおす
          const now = dayjs();
          console.log('in spool:');
          return it.daemonStatesQueue.takeAll.pipe(Effect.andThen(a1 => {
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
        }),
        Effect.tap(_ => it.sendRunningMark(message[0].id, false)),
      );
    })
      .pipe(
        Effect.catchAll(e => {
          console.log('execGenerator error:', e);
          this.showAlert(`execGenerator error:${e}`);
          return Effect.fail(e);
        }),
      );
  }

  /**
   * ジェネレーター単体実行→結果を会話コンテキストに追加する
   * 生成元を追加するかどうかは
   * @param gen
   * @param modUserMessage
   */
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
