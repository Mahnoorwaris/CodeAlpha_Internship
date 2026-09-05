const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

class WebRTCManager {
  constructor({ socket, onRemoteStream, onParticipantState }) {
    this.socket = socket;
    this.onRemoteStream = onRemoteStream;
    this.onParticipantState = onParticipantState;
    this.localStream = null;
    this.screenStream = null;
    this.isScreenSharing = false;
    this.peers = new Map(); // socketId -> RTCPeerConnection
    this.selfSocketId = null;
    this.tracksEnabled = { audio: true, video: true };
  }

  async getUserMedia() {
    if (this.localStream) return this.localStream;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    return this.localStream;
  }

  setSelfSocketId(id) {
    this.selfSocketId = id;
  }

  getPeer(socketId) {
    return this.peers.get(socketId);
  }

  async createPeer(socketId, isInitiator) {
    if (this.peers.has(socketId)) return this.peers.get(socketId);

    const peer = new RTCPeerConnection(RTC_CONFIG);

    this.localStream.getTracks().forEach((track) => {
      peer.addTrack(track, this.localStream);
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          targetSocketId: socketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    peer.ontrack = (event) => {
      const streams = event.streams && event.streams[0];
      if (streams) {
        this.onRemoteStream(socketId, streams);
      }
    };

    peer.onconnectionstatechange = () => {
      this.onParticipantState &&
        this.onParticipantState(socketId, { connectionState: peer.connectionState });
    };

    this.peers.set(socketId, peer);

    if (isInitiator) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.socket.emit('webrtc-offer', {
        targetSocketId: socketId,
        offer: offer.toJSON(),
      });
    }

    return peer;
  }

  async handleOffer(payload) {
    const peer = await this.createPeer(payload.callerSocketId, false);
    await peer.setRemoteDescription(payload.offer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    this.socket.emit('webrtc-answer', {
      targetSocketId: payload.callerSocketId,
      answer: answer.toJSON(),
    });
  }

  async handleAnswer(payload) {
    const peer = this.peers.get(payload.answererSocketId);
    if (!peer) return;
    await peer.setRemoteDescription(payload.answer);
  }

  async handleIceCandidate(payload) {
    const peer = this.peers.get(payload.senderSocketId);
    if (!peer) return;
    try {
      await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } catch (error) {
      console.error('addIceCandidate error:', error.message);
    }
  }

  removePeer(socketId) {
    const peer = this.peers.get(socketId);
    if (peer) {
      peer.close();
      this.peers.delete(socketId);
    }
  }

  setTrackEnabled(kind, enabled) {
    if (!this.localStream) return;
    this.localStream.getTracks().forEach((track) => {
      if (track.kind === kind) track.enabled = enabled;
    });
    this.tracksEnabled[kind] = enabled;
  }

  async toggleScreenShare() {
    if (this.isScreenSharing) {
      this.stopScreenShare();
      return false;
    }
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = this.screenStream.getVideoTracks()[0];
      screenTrack.onended = () => this.stopScreenShare();

      const videoTrack = this.localStream.getVideoTracks()[0];
      videoTrack.stop();
      this.localStream.removeTrack(videoTrack);
      this.localStream.addTrack(screenTrack);

      this.peers.forEach((peer) => {
        const sender = peer.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      this.isScreenSharing = true;
      return true;
    } catch (error) {
      console.error('Screen share error:', error.message);
      return false;
    }
  }

  stopScreenShare() {
    if (!this.isScreenSharing) return;
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    const screenTrack = this.localStream.getVideoTracks()[0];
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((newStream) => {
        const videoTrack = newStream.getVideoTracks()[0];
        this.localStream.removeTrack(screenTrack);
        screenTrack.stop();
        this.localStream.addTrack(videoTrack);
        this.peers.forEach((peer) => {
          const sender = peer.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(videoTrack);
        });
        this.isScreenSharing = false;
      })
      .catch((error) => console.error('Could not restore camera:', error.message));
  }

  closeAll() {
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
  }
}

if (typeof window !== 'undefined') {
  window.WebRTCManager = WebRTCManager;
}