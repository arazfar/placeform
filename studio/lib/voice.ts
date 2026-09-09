import type { BuildingSpec, Feature } from './spec';
import { actionTool, type DesignAction } from './commands';
export type VoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';
export type VoiceConnection = {
  stop: () => void;
  update: (spec: BuildingSpec, selected?: Feature) => void;
};
export async function connectVoice(
  spec: BuildingSpec,
  selected: Feature | undefined,
  onState: (s: VoiceState) => void,
  onTranscript: (text: string) => void,
  onAction: (action: DesignAction) => string,
  onMessage: (text: string) => void,
): Promise<VoiceConnection> {
  onState('connecting');
  const pc = new RTCPeerConnection();
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const audio = document.createElement('audio');
  audio.autoplay = true;
  const stop = () => {
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    pc.close();
    audio.pause();
    audio.srcObject = null;
    onState('idle');
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream!));
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      audio
        .play()
        .catch(() =>
          onMessage('Tap the voice control to enable audio playback.'),
        );
    };
    const dc = pc.createDataChannel('oai-events');
    const send = (v: unknown) => {
      if (dc.readyState === 'open') dc.send(JSON.stringify(v));
    };
    const update = (s: BuildingSpec, f?: Feature) =>
      send({
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions: `You are Watt & Wonder, a concise exterior architectural design collaborator. Current spec ${JSON.stringify({ ...s, assets: {}, evidence: undefined })}. Selected feature ${f || 'none'}. Use update_design for supported changes and wait for its result. Respect locks. Ask a short clarification for ambiguous references. For research, new concepts, or image refinement use generate with prompt starting research:, concepts:, or image: respectively. The app opens an in-app generation job for review; never mention task exports or handoffs. Never invent performance. Keep spoken feedback under 20 words.`,
          tools: [actionTool],
        },
      });
    dc.onopen = () => onState('listening');
    dc.onmessage = (e) => {
      let ev;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      if (ev.type === 'input_audio_buffer.speech_started') onState('listening');
      if (ev.type === 'input_audio_buffer.speech_stopped') onState('thinking');
      if (ev.type === 'conversation.item.input_audio_transcription.completed')
        onTranscript(ev.transcript);
      if (ev.type === 'response.output_audio_transcript.done')
        onMessage(ev.transcript);
      if (ev.type === 'output_audio_buffer.started') onState('speaking');
      if (
        ev.type === 'output_audio_buffer.stopped' ||
        ev.type === 'response.done'
      )
        onState('listening');
      if (ev.type === 'error') {
        onMessage(ev.error?.message || 'Voice provider error.');
        onState('error');
      }
      if (
        ev.type === 'response.function_call_arguments.done' &&
        ev.name === 'update_design'
      ) {
        let result;
        try {
          result = onAction(JSON.parse(ev.arguments));
        } catch {
          result = 'Invalid action. Ask a clarification.';
        }
        send({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: ev.call_id,
            output: JSON.stringify({ result }),
          },
        });
        send({ type: 'response.create' });
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        stop();
        onMessage(
          'Voice disconnected. Your design is saved. Reconnect to continue.',
        );
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch('/api/voice/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sdp: offer.sdp,
        spec: { ...spec, assets: {}, evidence: undefined },
        selected,
      }),
    });
    if (!res.ok) {
      const v = (await res.json()) as { error?: string };
      throw new Error(v.error || 'Voice unavailable.');
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    timer = setTimeout(() => {
      stop();
      onMessage(
        'Five-minute voice session ended to limit paid usage. Reconnect when ready.',
      );
    }, 300000);
    return { stop, update };
  } catch (e) {
    stop();
    onState('error');
    throw e;
  }
}
