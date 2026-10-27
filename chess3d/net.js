// Peer-to-peer online play over WebRTC using PeerJS (global `Peer`).
// The host owns the authoritative game; the guest receives the full move
// list on connect so a refresh on either side can resync.

const PREFIX = 'rationalbonding-chess3d-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Optional PeerJS options (e.g. a self-hosted signalling server); defaults to the free PeerJS cloud.
const peerOptions = () => window.CHESS3D_PEER_OPTIONS || {};

export const randomCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

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
      if (this.connected) {
        conn.on('open', () => {
          conn.send({ type: 'full' });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }
      this.attach(conn);
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
    if (this.peer && !this.peer.destroyed) this.attach(this.peer.connect(PREFIX + this.code, { reliable: true }));
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
      this.onStatus('Connected');
      this.onMessage({ type: 'connected' });
    });
    conn.on('data', (msg) => this.onMessage(msg));
    conn.on('close', () => {
      if (this.conn === conn) this.conn = null;
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
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.conn = null;
  }
}
