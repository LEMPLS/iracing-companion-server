const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const messageTypes = {
  MESSAGE_TYPE_TELEMETRY: 1,
  MESSAGE_TYPE_CROSS_LINE: 2,
};

// TODO : Replace with irsdk
wss.on('connection', ws => {
  let timer;
  let timerCross;

  let laps = 2000;

  const sendMessage = () => {
    timer = setTimeout(() => {
      ws.send(
        JSON.stringify({
          type: messageTypes.MESSAGE_TYPE_TELEMETRY,
          values: {
            LapsToPit: --laps,
          },
        }),
      );
      sendMessage();
    }, 100);
  };

  const sendCrossLine = () => {
    timerCross = setTimeout(() => {
      ws.send(
        JSON.stringify({
          type: messageTypes.MESSAGE_TYPE_CROSS_LINE,
        }),
      );
      sendCrossLine();
    }, 10000);
  };

  sendMessage();
  sendCrossLine();

  ws.on('close', () => {
    clearTimeout(timer);
    clearTimeout(timerCross);
  });
});
