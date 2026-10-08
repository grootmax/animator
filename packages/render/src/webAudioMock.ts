export class MockAudioBuffer implements AudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private channelData: Float32Array<ArrayBuffer>[];

  constructor(options: {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
  }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.duration = options.length / options.sampleRate;
    this.channelData = Array.from(
      { length: options.numberOfChannels },
      () => new Float32Array(new ArrayBuffer(options.length * 4)),
    );
  }

  getChannelData(channel: number): Float32Array<ArrayBuffer> {
    const data = this.channelData[channel];
    if (!data) {
      throw new Error(`Channel index out of bounds: ${channel}`);
    }
    return data;
  }

  copyFromChannel(
    destination: Float32Array,
    channelNumber: number,
    bufferOffset = 0,
  ): void {
    const data = this.getChannelData(channelNumber);
    destination.set(
      data.subarray(bufferOffset, bufferOffset + destination.length),
    );
  }

  copyToChannel(
    source: Float32Array,
    channelNumber: number,
    bufferOffset = 0,
  ): void {
    const data = this.getChannelData(channelNumber);
    data.set(source, bufferOffset);
  }
}

export class MockGainNode {
  gain = { value: 1.0 };
  destinationNode: MockGainNode | MockDestinationNode | null = null;

  connect(destination: MockGainNode | MockDestinationNode): void {
    this.destinationNode = destination;
  }
}

export class MockDestinationNode {
  readonly numberOfInputs = 1;
}

export class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  destinationNode: MockGainNode | MockDestinationNode | null = null;
  scheduledStartTime = 0;
  scheduledMediaOffset = 0;
  scheduledDuration: number | undefined = undefined;
  started = false;

  connect(destination: MockGainNode | MockDestinationNode): void {
    this.destinationNode = destination;
  }

  start(when = 0, offset = 0, duration?: number): void {
    this.scheduledStartTime = when;
    this.scheduledMediaOffset = offset;
    this.scheduledDuration = duration;
    this.started = true;
  }
}

export class MockOfflineAudioContext {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly destination = new MockDestinationNode();
  private scheduledSources: {
    source: MockAudioBufferSourceNode;
    gain: number;
  }[] = [];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
  }

  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): MockAudioBuffer {
    return new MockAudioBuffer({ numberOfChannels, length, sampleRate });
  }

  createBufferSource(): MockAudioBufferSourceNode {
    const source = new MockAudioBufferSourceNode();
    this.scheduledSources.push({ source, gain: 1.0 });
    return source;
  }

  createGain(): MockGainNode {
    const gainNode = new MockGainNode();
    return gainNode;
  }

  async startRendering(): Promise<AudioBuffer> {
    const outputBuffer = new MockAudioBuffer({
      numberOfChannels: this.numberOfChannels,
      length: this.length,
      sampleRate: this.sampleRate,
    });

    for (const item of this.scheduledSources) {
      const source = item.source;
      if (!source.started || !source.buffer) continue;

      let gainVal = 1.0;
      if (source.destinationNode instanceof MockGainNode) {
        gainVal = source.destinationNode.gain.value;
      }

      const srcBuffer = source.buffer;
      const startTime = source.scheduledStartTime;
      const mediaOffset = source.scheduledMediaOffset;
      const duration =
        source.scheduledDuration ?? srcBuffer.duration - mediaOffset;

      const startSample = Math.floor(startTime * this.sampleRate);
      const endSample = Math.min(
        this.length,
        Math.floor((startTime + duration) * this.sampleRate),
      );

      for (let channel = 0; channel < this.numberOfChannels; channel++) {
        const srcChannelIndex =
          channel < srcBuffer.numberOfChannels ? channel : 0;
        const srcData = srcBuffer.getChannelData(srcChannelIndex);
        const outData = outputBuffer.getChannelData(channel);

        for (let sample = startSample; sample < endSample; sample++) {
          const currentTime = sample / this.sampleRate;
          const srcTime = currentTime - startTime + mediaOffset;
          const srcSample = Math.floor(srcTime * srcBuffer.sampleRate);

          if (srcSample >= 0 && srcSample < srcBuffer.length) {
            const val = srcData[srcSample];
            const currentOut = outData[sample];
            if (val !== undefined && currentOut !== undefined) {
              outData[sample] = currentOut + val * gainVal;
            }
          }
        }
      }
    }

    return outputBuffer as unknown as AudioBuffer;
  }
}
