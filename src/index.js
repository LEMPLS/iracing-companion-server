const dotenv = require('dotenv');
const colors = require('colors');
const WebSocket = require('ws');

dotenv.config();
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

const messageTypes = {
  MESSAGE_TYPE_TELEMETRY: 1,
  MESSAGE_TYPE_CROSS_LINE: 2,
};

const telemetryConst = {
  RESET: 0,
  PITSTOP_START: 1,
  PITSTOP_END: 2,
};

const defaultTelemetryValues = {
  PitStop: false,
  LastPitLap: 0,
  LapCompleted: 0,
  RaceLapsRemaining: 0,
  SessionNum: null,
  GapToAhead: null,
  GapToBehind: null,
};

const irsdk = require('node-irsdk');
irsdk.init({
  telemetryUpdateInterval: 50,
  sessionInfoUpdateInterval: 1000,
});

const iracing = irsdk.getInstance();

iracing.on('Connected', () => {
  console.log('Connected to iRacing'.green);
});

iracing.on('Disconnected', () => {
  console.log('iRacing shut down'.yellow);
});

wss.on('connection', (ws, req) => {
  console.log(`Dashboard connected (${req.connection.remoteAddress})`.green);

  const Telemetry = defaultTelemetryValues;

  const Session = {
    SessionLaps: null,
  };

  const sessionInfoCallback = ({ data }) => {
    if (data.SessionInfo.Sessions && !!data.SessionInfo.Sessions.length) {
      const sessionLapsCheck = () => {
        if (Telemetry.SessionNum === null) {
          setTimeout(sessionLapsCheck, 1000);
        } else {
          const currentSession = data.SessionInfo.Sessions.find(
            session => session.SessionNum === Telemetry.SessionNum,
          );

          Session.SessionLaps =
            currentSession && currentSession.SessionLaps === 'unlimited'
              ? null
              : currentSession.SessionLaps;
        }
      };

      sessionLapsCheck();
    }
  };

  const telemetryCallback = ({ values }) => {
    Telemetry.SessionNum = values.SessionNum;
    Telemetry.LapCompleted = values.LapCompleted;
    Telemetry.RaceLapsRemaining = Session.SessionLaps
      ? Session.SessionLaps - Telemetry.LapCompleted
      : null;

    if (
      !Telemetry.PitStop &&
      values.EnterExitReset === telemetryConst.PITSTOP_START
    ) {
      Telemetry.LastPitLap = Telemetry.LapCompleted;
      Telemetry.PitStop = true;
    }

    if (
      Telemetry.PitStop &&
      values.EnterExitReset !== telemetryConst.PITSTOP_START
    ) {
      Telemetry.PitStop = false;
    }

    const playerCarIdx = values.PlayerCarIdx;
    const playerCarPosition = values.CarIdxPosition[playerCarIdx];

    const carAheadIdx = values.CarIdxPosition.indexOf(playerCarPosition - 1);

    const playerCarF2Time = values.CarIdxF2Time[values.PlayerCarIdx];
    const carAheadF2Time = values.CarIdxF2Time[carAheadIdx];

    Telemetry.GapToAhead = playerCarF2Time - carAheadF2Time;

    // Send data to dashboards
    ws.send(
      JSON.stringify({
        type: messageTypes.MESSAGE_TYPE_TELEMETRY,
        payload:
          {
            ...Telemetry,
          } || {},
      }),
    );
  };

  if (ws.readyState === WebSocket.OPEN) {
    iracing.on('Telemetry', telemetryCallback);
    iracing.on('SessionInfo', sessionInfoCallback);
  }

  ws.on('close', () => {
    console.log(`Dashboard disconnected`.yellow);
    iracing.removeListener('Telemetry', telemetryCallback);
    iracing.removeListener('SessionInfo', sessionInfoCallback);
  });
});

console.log(`Server started at ws://localhost:${port}`);

process.on('uncaughtException', err => {
  switch (err.code) {
    case 'EADDRINUSE':
      return console.log(
        `Port ${port} is already in use - please choose a different one.`.red,
      );
    default:
      console.error(err);
  }
  process.exit(1);
});
