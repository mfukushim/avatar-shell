
import { Effect, Layer } from 'effect';
import {expect, describe, it, afterEach, afterAll} from 'vitest';
import { io as Client } from 'socket.io-client';
import { SocketServiceLive } from '../src/SocketService';
import { ConfigServiceLive } from '../src/ConfigService';
import {AsMessage} from '../../common/Def';
import {runPromise} from 'effect/Effect';
import {beforeAll} from '@effect/vitest';

const AppConfigLive = Layer.merge(ConfigServiceLive,SocketServiceLive); //  TODO なぜかメモ化は走らない?

describe('SocketService', () => {

  let clientSocket: ReturnType<typeof Client>;

  beforeAll(async () => {
    await Effect.gen(function* () {
    }).pipe(
      Effect.tap(a => Effect.log(a)),
      Effect.provide(AppConfigLive),
      runPromise,
    );
  });

  afterEach(async () => {
    if (clientSocket) {
      clientSocket.close();
    }
  });

  afterAll(async suite => {
    // await Effect.runPromise(SocketService.close().pipe(Effect.provide(AppConfigLive)));  //  TODO
  })

  it.sequential('start', async () => {
    //  vitest --run --testNamePattern=start SocketService.unit.spec.ts
    // クライアント接続を試行
    clientSocket = Client(`http://localhost:3000`);

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        resolve();
      });
    });

    expect(clientSocket.connected).toBe(true);
  });

  it.sequential('asMessageイベントが正しくブロードキャストされること', async () => {

      const testMessage: AsMessage = {
        id:'aaa',
        tick:1,
        asClass:'system',
        role:'system',
        isRequestAction:false,
        content:{
          text:'test data'
        }
      };

      // 2つのクライアントを接続
      const client1 = Client(`http://localhost:3000`);
      const client2 = Client(`http://localhost:3000`);

      await Promise.all([
        new Promise<void>(resolve => client1.on('connect', resolve)),
        new Promise<void>(resolve => client2.on('connect', resolve))
      ]);

      const messagePromise = new Promise<AsMessage>(resolve => {
        client2.on('asMessage', (msg) => {
          resolve(msg);
        });
      });

      // client1からメッセージを送信
      client1.emit('asMessage', testMessage);

      const receivedMessage = await messagePromise;
      expect(receivedMessage).toEqual(testMessage);

      client1.close();
      client2.close();
    })

/*
TODO
  it.sequential('設定変更時にサーバーが再起動すること', async () => {
    await Effect.gen(function* () {
        const sysConfig = yield *ConfigService.getSysConfig()
        // yield* SocketService.boot()

        // 一旦サーバーを停止
        const mockConfigRef:SysConfigMutable = {
          ...sysConfig,
          websocket: {...sysConfig.websocket, useServer: false}
        }
        yield *ConfigService.updateSysConfig(() => mockConfigRef)
      }).pipe(
        Effect.tap(a => Effect.log(a)),
        Effect.provide(AppConfigLive),
        runPromise,
      );

      // 接続を試みて失敗することを確認
      await expect(
        new Promise((_, reject) => {
          const socket = Client(`http://localhost:3000`, {
            timeout: 1000
          });
          socket.on('connect_error', () => {
            socket.close();
            reject(new Error('Connection failed as expected'));
          });
        })
      ).rejects.toThrow();

      // サーバーを再起動
    await Effect.gen(function* () {
      const sysConfig = yield *ConfigService.getSysConfig()
      // yield* SocketService.boot()

      // 一旦サーバーを停止
      const mockConfigRef:SysConfigMutable = {
        ...sysConfig,
        websocket: {...sysConfig.websocket, useServer: true}
      }
      yield *ConfigService.updateSysConfig(() => mockConfigRef)
    }).pipe(
      Effect.tap(a => Effect.log(a)),
      Effect.provide(AppConfigLive),
      runPromise,
    );

      // 接続が成功することを確認
      clientSocket = Client(`http://localhost:3000`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      expect(clientSocket.connected).toBe(true);
    });
*/
},5*60*1000);
