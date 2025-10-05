/*! avatar-shell | Apache-2.0 License | https://github.com/mfukushim/avatar-shell */
import {Effect, Stream} from 'effect';
import {Server} from 'socket.io';
import {AsMessage, SysConfig} from '../../common/Def.js';
import {ConfigService, ConfigServiceLive} from './ConfigService.js';

export class SocketService extends Effect.Service<SocketService>()('avatar-shell/SocketService', {
  accessors: true,
  effect: Effect.gen(function* () {
    let ioServer: Server | undefined;
    const sysConfig = yield* ConfigService.getSysConfigPub();
    yield* Effect.forkDaemon(sysConfig.changes.pipe(Stream.runForEach(a => {
      console.log('SocketService sys change:');
      return updateSysConfig(a);
    })));

    function updateSysConfig(v: SysConfig) {
      return Effect.gen(function* () {
        //  sys変更
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
      if (sys.websocket.useServer) {
        ioServer = new Server({
          // オプション設定（必要に応じて）
          cors: {
            origin: '*', // クライアントのアクセスを許可（必要に応じて制限してください）
            methods: ['GET', 'POST'],
          },
        });
        ioServer.on('connection', (socket) => {
          socket.on('asMessage', (msg: AsMessage[]) => {
            // console.log('received asMessage:', msg);

            // クライアントに返信
            socket.broadcast.emit('asMessage', msg);
          });

          socket.on('disconnect', () => {
          });
        });
        ioServer.listen(sys.websocket.serverPort || 3010);
      }
    }

    function close() {
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
