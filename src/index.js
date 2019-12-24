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

wss.on('connection', ws => {
  console.log('Dashboard connected'.green);
  let connected = true;

  const Telemetry = {
    PitStop: false,
    LastPitLap: 0,
    LapCompleted: 0,
    RaceLapsRemaining: 0,
    SessionNum: null,
    GapToAhead: null,
    GapToBehind: null,
  };

  let Session = {
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
    // Crossed the line
    if (Telemetry.LapCompleted < values.LapCompleted) {
      // Wait a bit for the gap to update
      setTimeout(() => {
        const PlayerCarIdx = values.PlayerCarIdx;

        const GapToAhead =
          PlayerCarIdx === 0
            ? null
            : values.CarIdxF2Time[PlayerCarIdx] -
              values.CarIdxF2Time[PlayerCarIdx - 1];

        const GainedToAhead = Telemetry.GapToAhead
          ? GapToAhead - Telemetry.GapToAhead
          : 0;

        ws.send(
          JSON.stringify({
            type: messageTypes.MESSAGE_TYPE_CROSS_LINE,
            payload:
              {
                GapToAhead,
                GainedToAhead,
              } || {},
          }),
        );

        Telemetry.GapToAhead = GapToAhead;
      }, 2000);
    }

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

    const LapCompletedSincePit = Math.abs(
      Telemetry.LapCompleted - Telemetry.LastPitLap,
    );

    // Send data to dashboards
    ws.send(
      JSON.stringify({
        type: messageTypes.MESSAGE_TYPE_TELEMETRY,
        payload:
          {
            ...values,
            LapCompletedSincePit,
            RaceLapsRemaining: Telemetry.RaceLapsRemaining,
          } || {},
      }),
    );
  };

  if (ws.readyState === WebSocket.OPEN) {
    iracing.on('Telemetry', telemetryCallback);
    iracing.on('SessionInfo', sessionInfoCallback);
  }

  ws.on('close', () => {
    console.log('Dashboard disconnected'.red);
    iracing.removeListener('Telemetry', telemetryCallback);
    iracing.removeListener('SessionInfo', sessionInfoCallback);
    connected = false;
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
