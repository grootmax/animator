export interface EncoderOptions {
  width: number;
  height: number;
  fps: number;
  codec?: string | undefined;
  bitrate?: number | undefined;
  onChunk: (chunk: ArrayBuffer, timestamp: number, isKeyFrame: boolean) => void;
}

export class WebCodecsEncoder {
  private options: EncoderOptions;
  // biome-ignore lint/suspicious/noExplicitAny: VideoEncoder global type definition fallback
  private encoder: any = null;
  private frameCount = 0;
  private isConfigured = false;

  constructor(options: EncoderOptions) {
    this.options = options;
  }

  public static isSupported(): boolean {
    return typeof globalThis !== "undefined" && "VideoEncoder" in globalThis;
  }

  public async init(): Promise<void> {
    if (WebCodecsEncoder.isSupported()) {
      // biome-ignore lint/suspicious/noExplicitAny: VideoEncoder initialization
      const VideoEncoderClass = (globalThis as any).VideoEncoder;
      this.encoder = new VideoEncoderClass({
        // biome-ignore lint/suspicious/noExplicitAny: EncodedVideoChunk callback
        output: (chunk: any) => {
          const buffer = new ArrayBuffer(chunk.byteLength);
          chunk.copyTo(buffer);
          const isKeyFrame = chunk.type === "key";
          this.options.onChunk(buffer, chunk.timestamp, isKeyFrame);
        },
        error: (err: Error) => {
          console.error("WebCodecs VideoEncoder error:", err);
        },
      });

      const codec = this.options.codec ?? "avc1.42001f";
      const bitrate = this.options.bitrate ?? 2_000_000;

      await this.encoder.configure({
        codec,
        width: this.options.width,
        height: this.options.height,
        bitrate,
        framerate: this.options.fps,
      });

      this.isConfigured = true;
    } else {
      // Fallback path when WebCodecs is not present
      this.isConfigured = true;
    }
  }

  public async encodeFrame(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    frameIndex: number,
    isKeyFrame = false,
  ): Promise<void> {
    if (!this.isConfigured) {
      await this.init();
    }

    const timestampUs = Math.round((frameIndex / this.options.fps) * 1_000_000);

    if (
      this.encoder &&
      typeof globalThis !== "undefined" &&
      "VideoFrame" in globalThis
    ) {
      // biome-ignore lint/suspicious/noExplicitAny: VideoFrame global construct
      const VideoFrameClass = (globalThis as any).VideoFrame;
      const videoFrame = new VideoFrameClass(canvas, {
        timestamp: timestampUs,
      });

      this.encoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();
    } else {
      // Fallback encoding mechanism: extract frame data and emit fallback chunk
      const ctx = canvas.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;

      let chunkData: ArrayBuffer;

      if (ctx) {
        const imageData = ctx.getImageData(
          0,
          0,
          this.options.width,
          this.options.height,
        );
        chunkData = imageData.data.buffer.slice(0);
      } else {
        chunkData = new ArrayBuffer(
          this.options.width * this.options.height * 4,
        );
      }

      this.options.onChunk(chunkData, timestampUs, isKeyFrame);
    }

    this.frameCount++;
  }

  public async flush(): Promise<void> {
    if (this.encoder && typeof this.encoder.flush === "function") {
      await this.encoder.flush();
    }
  }

  public async close(): Promise<void> {
    if (this.encoder && typeof this.encoder.close === "function") {
      this.encoder.close();
    }
    this.encoder = null;
    this.isConfigured = false;
  }

  public getFrameCount(): number {
    return this.frameCount;
  }
}
