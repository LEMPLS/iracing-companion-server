const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

const messageTypes = {
  MESSAGE_TYPE_TELEMETRY: 1,
  MESSAGE_TYPE_CROSS_LINE: 2,
};

// TODO : Replace with irsdk
wss.on('connection', ws => {
  console.log('Dashboard connected');

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
    console.log('Dashboard disconnected');
    clearTimeout(timer);
    clearTimeout(timerCross);
  });
});

console.log('Server is running, waiting for connections...');