// Peer-to-peer online play over WebRTC using PeerJS (global `Peer`).
// The host owns the authoritative game; the guest receives the full move
// list on connect so a refresh on either side can resync.

const PREFIX = 'rationalbonding-chess3d-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Optional PeerJS options (e.g. a self-hosted signalling server); defaults to the free PeerJS cloud.
const peerOptions = () => window.CHESS3D_PEER_OPTIONS || {};

export const randomCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

// Identifies this tab across reloads, so a returning guest can take back its seat
// before the host has noticed the old connection died. Per tab, not per browser,
// so two tabs on one machine don't keep kicking each other out.
function guestId() {
  try {
    let id = sessionStorage.getItem('chess3d-guest-id');
    if (!id) sessionStorage.setItem('chess3d-guest-id', (id = randomCode() + randomCode()));
    return id;
  } catch {
    return randomCode() + randomCode();
  }
}

export class Link {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.peer = null;
    this.conn = null;
    this.role = null;
    this.code = null;
  }

  get connected() {
    return !!(this.conn && this.conn.open);
  }

  host(code, attempt = 0) {
    this.close();
    this.role = 'host';
    this.code = code;
    this.onStatus('Opening room…');
    const peer = new Peer(PREFIX + code, peerOptions());
    this.peer = peer;
    peer.on('open', () => this.onStatus('Waiting for your friend to join…'));
    peer.on('connection', (conn) => {
      const id = conn.metadata?.guestId;
      if (this.connected && id !== this.guestId) {
        // Answer the guest's hello, so we know its side of the channel is listening.
        conn.on('data', (msg) => {
          if (msg?.type !== 'hello') return;
          conn.send({ type: 'full' });
          setTimeout(() => conn.close(), 1000);
        });
        return;
      }
      // Same guest coming back (or the seat is free): the new connection wins.
      const old = this.conn;
      this.guestId = id;
      this.attach(conn);
      if (old && old !== conn) old.close();
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      // After a reload the signalling server may still hold our old id briefly.
      if (err.type === 'unavailable-id' && attempt < 6) {
        this.onStatus('Reclaiming room…');
        setTimeout(() => this.host(code, attempt + 1), 2500);
      } else this.onStatus(`Connection error: ${err.type || err}`);
    });
  }

  join(code) {
    this.close();
    this.role = 'guest';
    this.code = code;
    this.onStatus('Connecting…');
    const peer = new Peer(peerOptions());
    this.peer = peer;
    this.everConnected = false;
    peer.on('open', () => this.dial());
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        if (this.everConnected) this.scheduleRedial();
        else this.onStatus('Room not found. Check the code, or ask the host to reopen it.');
      } else this.onStatus(`Connection error: ${err.type || err}`);
    });
  }

  dial() {
    if (!this.peer || this.peer.destroyed) return;
    this.attach(this.peer.connect(PREFIX + this.code, { reliable: true, metadata: { guestId: guestId() } }));
  }

  // Guests keep trying to reach a host that dropped (e.g. refreshed the page).
  scheduleRedial() {
    clearTimeout(this.redialTimer);
    this.redialTimer = setTimeout(() => this.dial(), 3000);
  }

  attach(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.everConnected = true;
      if (this.role === 'guest') conn.send({ type: 'hello' });
      this.onStatus('Connected');
      this.onMessage({ type: 'connected' });
    });
    conn.on('data', (msg) => {
      if (this.conn === conn) this.onMessage(msg);
    });
    conn.on('close', () => {
      // A connection we already replaced closing is not a disconnect.
      if (this.conn !== conn) return;
      this.conn = null;
      this.onStatus(this.role === 'host' ? 'Friend disconnected. Waiting for them to rejoin…' : 'Lost the host. Reconnecting…');
      this.onMessage({ type: 'disconnected' });
      if (this.role === 'guest' && this.peer && !this.peer.destroyed) this.scheduleRedial();
    });
  }

  send(msg) {
    if (this.connected) this.conn.send(msg);
  }

  close() {
    clearTimeout(this.redialTimer);
    // Detach first: destroying the peer fires our close handlers synchronously.
    const peer = this.peer;
    this.peer = null;
    this.conn = null;
    this.guestId = null;
    if (peer) peer.destroy();
  }
}
