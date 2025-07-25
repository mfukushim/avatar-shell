import {Effect, Stream} from 'effect';

import {Server} from 'socket.io';
import {AsMessage, SysConfig} from '../../common/Def.js';
import {ConfigService, ConfigServiceLive} from './ConfigService.js';

export class SocketService extends Effect.Service<SocketService>()('avatar-shell/SocketService', {
  accessors: true,
  effect: Effect.gen(function* () {
    console.log('top');
    let ioServer: Server | undefined;
    const sysConfig = yield* ConfigService.getSysConfigPub();
    // yield* sysConfig.pipe(SubscriptionRef.get, Effect.andThen(a => updateSysConfig(a)));
    yield* Effect.forkDaemon(sysConfig.changes.pipe(Stream.runForEach(a => {
      console.log('SocketService sys change:');
      return updateSysConfig(a);
    })));


    function updateSysConfig(v: SysConfig) {
      console.log('in update');
      return Effect.gen(function* () {
        //  sys変更
        console.log('SocketService changed sysConfig');
        if ((ioServer !== undefined) !== (v.websocket.useServer)) {
          if (ioServer) {
            ioServer.disconnectSockets(true);
            yield* Effect.tryPromise(() => ioServer!!.close());
            ioServer = undefined;
          }
          if (v.websocket.useServer) {
            starUp(v);
          }
        }
      });
    }

    function starUp(sys: SysConfig) {
      console.log('in startup');
      if (sys.websocket.useServer) {
        // console.log('ComServer start');
        ioServer = new Server({
          // オプション設定（必要に応じて）
          cors: {
            origin: '*', // クライアントのアクセスを許可（必要に応じて制限してください）
            methods: ['GET', 'POST'],
          },
        });
        ioServer.on('connection', (socket) => {
          console.log('connect client:', socket.id);

          socket.on('asMessage', (msg: AsMessage) => {
            // console.log('received asMessage:', msg);

            // クライアントに返信
            socket.broadcast.emit('asMessage', msg);
          });

          socket.on('disconnect', () => {
            // console.log('disconnect client:', socket.id);
          });
        });
        ioServer.listen(sys.websocket.serverPort || 3000);
      }
    }

    function close() {
      console.log('in close');
      return Effect.gen(function* () {
        if (ioServer) {
          ioServer.disconnectSockets(true);
          yield* Effect.async((resume) => {
            if (ioServer) {
              ioServer.close().finally(() => resume(Effect.succeed(true)));
            }
            resume(Effect.succeed(true));
          });
          ioServer = undefined;
        }
      });
    }

    return {
      close,
    };
  }),
  dependencies: [ConfigServiceLive],
}) {
}

export const SocketServiceLive = SocketService.Default;
