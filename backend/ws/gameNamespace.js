const sessionService = require('../services/sessionService');
const roundService = require('../services/roundService');

/**
 * Game Namespace WebSocket Handler
 * Path: /ws/game
 *
 * This namespace is for the game visualization iframe.
 * It receives game state updates (read-only):
 * - betting_phase
 * - round_reveal
 * - round_finished
 */

function setupGameNamespace(io) {
  const gameNamespace = io.of('/flip/ws/game');

  gameNamespace.on('connection', (socket) => {
    const sessionId = socket.handshake.query.sessionId;

    console.log(`[GameNamespace] Connection attempt with sessionId: ${sessionId}`);

    // Validate session
    const session = sessionService.getSession(sessionId);
    if (!session) {
      console.log(`[GameNamespace] Invalid session, disconnecting: ${sessionId}`);
      socket.emit('error', { code: 'INVALID_SESSION', message: 'Invalid or expired session' });
      socket.disconnect(true);
      return;
    }

    // Store socket ID in session
    sessionService.setGameSocket(sessionId, socket.id);

    // Store session data on socket for easy access
    socket.sessionId = sessionId;
    socket.playerId = session.playerId;

    console.log(`[GameNamespace] Player ${session.playerId} connected (game iframe)`);

    // Send current game state
    sendCurrentState(socket);

    // Send round history
    socket.emit('history', roundService.getHistory(20));

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[GameNamespace] Player ${socket.playerId} disconnected: ${reason}`);
      sessionService.clearSocket(sessionId, 'game');
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[GameNamespace] Socket error for ${socket.playerId}:`, error);
    });
  });

  return gameNamespace;
}

/**
 * Send current game state to newly connected socket
 */
function sendCurrentState(socket) {
  const round = roundService.getCurrentRoundState();

  if (!round) {
    socket.emit('waiting', { message: 'Waiting for next round...' });
    return;
  }

  switch (round.status) {
    case 'betting':
      socket.emit('betting_phase', {
        roundId: round.id,
        serverSeedHash: round.serverSeedHash,
        clientSeed: round.clientSeed,
        nonce: round.nonce
      });
      break;

    case 'revealing':
      socket.emit('round_revealing', {
        roundId: round.id,
        serverSeedHash: round.serverSeedHash,
        result: round.result
      });
      break;

    case 'finished':
      socket.emit('round_finished', {
        roundId: round.id,
        result: round.result
      });
      break;

    default:
      socket.emit('waiting', { message: 'Waiting for next round...' });
  }
}

module.exports = setupGameNamespace;

