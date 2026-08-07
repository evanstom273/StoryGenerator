import { ArrayBufferTarget, Muxer } from "webm-muxer";
import { decodeWavToPcm16 } from "../aiDocumentGenerator/wavEncode";

const OPUS_SAMPLE_RATE = 48_000;
const OPUS_BITRATE = 64_000;
const OPUS_FRAME_SIZE = 960;
const YIELD_FRAME_INTERVAL = OPUS_FRAME_SIZE * 250;

export type OpusTranscodeResult = {
	bytes: Uint8Array;
	mimeType: "audio/webm";
};

async function wavBytesToAudioBuffer(wavBytes: Uint8Array): Promise<AudioBuffer> {
	const wavCopy = wavBytes.slice().buffer;
	const audioContext = new AudioContext();

	try {
		return await audioContext.decodeAudioData(wavCopy);
	} catch {
		const { pcm, sampleRate } = decodeWavToPcm16(wavBytes);
		const frameCount = Math.floor(pcm.byteLength / 2);
		const audioBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
		const channel = audioBuffer.getChannelData(0);
		const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);

		for (let index = 0; index < frameCount; index += 1) {
			channel[index] = view.getInt16(index * 2, true) / 32768;
		}

		return audioBuffer;
	} finally {
		void audioContext.close();
	}
}

async function resampleToMono48k(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
	if (
		audioBuffer.numberOfChannels === 1 &&
		audioBuffer.sampleRate === OPUS_SAMPLE_RATE
	) {
		return audioBuffer;
	}

	const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * OPUS_SAMPLE_RATE));
	const offline = new OfflineAudioContext(1, frameCount, OPUS_SAMPLE_RATE);
	const monoAtSource = offline.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
	const mono = monoAtSource.getChannelData(0);

	if (audioBuffer.numberOfChannels === 1) {
		mono.set(audioBuffer.getChannelData(0));
	} else {
		for (let index = 0; index < audioBuffer.length; index += 1) {
			let sample = 0;
			for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
				sample += audioBuffer.getChannelData(channelIndex)[index] ?? 0;
			}
			mono[index] = sample / audioBuffer.numberOfChannels;
		}
	}

	const source = offline.createBufferSource();
	source.buffer = monoAtSource;
	source.connect(offline.destination);
	source.start(0);
	return offline.startRendering();
}

async function isWebCodecsOpusSupported(): Promise<boolean> {
	if (typeof AudioEncoder === "undefined") {
		return false;
	}

	try {
		const result = await AudioEncoder.isConfigSupported({
			codec: "opus",
			sampleRate: OPUS_SAMPLE_RATE,
			numberOfChannels: 1,
			bitrate: OPUS_BITRATE,
		});
		return Boolean(result.supported);
	} catch {
		return false;
	}
}

async function encodeWithWebCodecs(audioBuffer: AudioBuffer): Promise<Uint8Array | null> {
	if (!(await isWebCodecsOpusSupported())) {
		return null;
	}

	const resampled = await resampleToMono48k(audioBuffer);
	const channel = resampled.getChannelData(0);
	const encodedChunks: EncodedAudioChunk[] = [];
	let encoderError = false;

	const encoder = new AudioEncoder({
		output: (chunk) => {
			encodedChunks.push(chunk);
		},
		error: () => {
			encoderError = true;
		},
	});

	encoder.configure({
		codec: "opus",
		sampleRate: OPUS_SAMPLE_RATE,
		numberOfChannels: 1,
		bitrate: OPUS_BITRATE,
	});

	const totalFrames = resampled.length;
	for (let offset = 0; offset < totalFrames; offset += OPUS_FRAME_SIZE) {
		const frameCount = Math.min(OPUS_FRAME_SIZE, totalFrames - offset);
		const frameData = channel.subarray(offset, offset + frameCount);
		const audioData = new AudioData({
			format: "f32-planar",
			sampleRate: OPUS_SAMPLE_RATE,
			numberOfChannels: 1,
			numberOfFrames: frameCount,
			timestamp: Math.round((offset / OPUS_SAMPLE_RATE) * 1_000_000),
			data: frameData,
		});

		encoder.encode(audioData);
		audioData.close();

		if (offset > 0 && offset % YIELD_FRAME_INTERVAL === 0) {
			await new Promise<void>((resolve) => {
				window.setTimeout(resolve, 0);
			});
		}
	}

	await encoder.flush();
	encoder.close();

	if (encoderError || encodedChunks.length === 0) {
		return null;
	}

	const target = new ArrayBufferTarget();
	const muxer = new Muxer({
		target,
		audio: {
			codec: "A_OPUS",
			sampleRate: OPUS_SAMPLE_RATE,
			numberOfChannels: 1,
		},
		firstTimestampBehavior: "offset",
	});

	for (const chunk of encodedChunks) {
		muxer.addAudioChunk(chunk);
	}

	muxer.finalize();
	return new Uint8Array(target.buffer);
}

export function canTranscodeToOpus(): boolean {
	return typeof AudioEncoder !== "undefined";
}

export async function transcodeWavToOpus(wavBytes: Uint8Array): Promise<OpusTranscodeResult | null> {
	try {
		const audioBuffer = await wavBytesToAudioBuffer(wavBytes);
		const bytes = await encodeWithWebCodecs(audioBuffer);
		if (!bytes?.length) {
			return null;
		}

		return { bytes, mimeType: "audio/webm" };
	} catch {
		return null;
	}
}
