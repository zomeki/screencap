export default class Capture {
  static IMAGE_FORMATS = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
  };

  constructor(options = {}) {
    this.options = options;
  }

  async capture(stream) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    try {
      await video.play();
      await this.#waitForVideo(video);
      return await this.#captureVideo(video);
    } finally {
      video.pause();
      video.srcObject = null;
    }
  }

  #waitForVideo(video) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
    });
  }

  async #captureVideo(video) {
    const viewport = this.#resolveViewport();
    const sourceViewport = this.#resolveSourceViewport(video, viewport);
    const canvas = this.#createCanvas(viewport);
    await this.#draw(canvas, video, viewport, sourceViewport);
    return this.#canvasToBlob(canvas);
  }

  #resolveViewport() {
    const root = document.scrollingElement || document.documentElement;
    return {
      width: Math.ceil(Math.max(root.scrollWidth, window.innerWidth)),
      height: Math.ceil(Math.max(root.scrollHeight, window.innerHeight)),
      displayWidth: window.innerWidth,
      displayHeight: window.innerHeight
    };
  }

  #resolveSourceViewport(video, viewport) {
    const videoAspect = video.videoWidth / video.videoHeight;
    const viewportAspect = viewport.displayWidth / viewport.displayHeight;

    let width = video.videoWidth;
    let height = video.videoHeight;
    let left = 0;
    let top = 0;

    if (videoAspect > viewportAspect) {
      width = video.videoHeight * viewportAspect;
      left = (video.videoWidth - width) / 2;
    } else if (videoAspect < viewportAspect) {
      height = video.videoWidth / viewportAspect;
      top = (video.videoHeight - height) / 2;
    }

    return {
      left: Math.max(0, Math.floor(left)),
      top: Math.max(0, Math.floor(top)),
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height))
    };
  }

  #createCanvas(viewport) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    return canvas;
  }

  #draw(canvas, video, viewport, sourceViewport) {
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const xPositions = this.#scrollPositions(viewport.width, viewport.displayWidth);
    const yPositions = this.#scrollPositions(viewport.height, viewport.displayHeight);
    const steps = yPositions.flatMap(y => xPositions.map(x => ({ x, y })));

    return steps.reduce((promise, step) => {
      return promise.then(() => {
        return this.#drawStep(context, video, viewport, sourceViewport, step);
      });
    }, Promise.resolve());
  }

  #scrollPositions(value, displayValue) {
    if (value <= displayValue) {
      return [0];
    }

    const stride = Math.max(1, displayValue - this.options.captureTileOverlapPx);
    const positions = [0];

    while (positions[positions.length - 1] + displayValue < value) {
      const prev = positions[positions.length - 1];
      const next = Math.min(prev + stride, value - displayValue);
      if (next === prev) {
        break;
      }
      positions.push(next);
    }

    return [...new Set(positions)];
  }

  async #drawStep(context, video, viewport, sourceViewport, step) {
    window.scrollTo({ left: step.x, top: step.y, behavior: 'auto' });

    await this.#waitForRendering();

    const drawWidth = Math.min(viewport.displayWidth, viewport.width - step.x);
    const drawHeight = Math.min(viewport.displayHeight, viewport.height - step.y);

    const scaleX = sourceViewport.width / viewport.displayWidth;
    const scaleY = sourceViewport.height / viewport.displayHeight;

    const srcWidth = Math.min(sourceViewport.width, drawWidth * scaleX);
    const srcHeight = Math.min(sourceViewport.height, drawHeight * scaleY);

    const dstLeft = step.x;
    const dstTop = step.y;
    const dstWidth = drawWidth;
    const dstHeight = drawHeight;

    context.drawImage(
      video,
      sourceViewport.left,
      sourceViewport.top,
      srcWidth,
      srcHeight,
      dstLeft,
      dstTop,
      dstWidth,
      dstHeight
    );
  }

  async #waitForRendering() {
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    await new Promise(resolve => {
      setTimeout(resolve, this.options.captureWaitTimeMsec);
    });
  }

  #canvasToBlob(canvas) {
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), this.constructor.IMAGE_FORMATS[this.options.imageFormat] || 'image/png');
    });
  }
}
