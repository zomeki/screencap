import Capture from './capture.js';
import './index.scss';

export default class Screencap {
  constructor(options = {}) {
    this.options = {
      imageFormat: 'png',
      windowWaitTimeoutMsec: 5_000,
      windowWaitTimerMsec: 120,
      windowWaitCount: 4,
      captureTileOverlapPx: 64,
      captureWaitTimeMsec: 120,
      ...options
    };
  };

  async capture() {
    if (!window.isSecureContext) {
      throw new Error('Your browser is not in secure context.');
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Your browser does not support capture.');
    }

    return await this.#requireStream(async stream => {
      return await this.#startCapture(async () => {
        const capture = new Capture(this.options);
        return await capture.capture(stream);
      });
    });
  }

  async #requireStream(callback) {
    let stream = null;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          displaySurface: 'browser',
          cursor: 'never'
        },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        monitorTypeSurfaces: 'exclude'
      });
      return await callback(stream);
    } finally {
      if (stream) stream.getTracks().forEach(track => track.stop());
    }
  }

  async #startCapture(callback) {
    await this.#waitForWindow();
    return await this.#startStyle(async () => {
      return await this.#startScroll(async () => {
        return await callback();
      });
    });
  }

  async #waitForWindow() {
    return new Promise(resolve => {
      const timeout = Date.now() + this.options.windowWaitTimeoutMsec;
      let count = 0;
      let previous = this.#windowState();

      const timer = setInterval(() => {
        const current = this.#windowState();

        if (current === previous) {
          count += 1;
        } else {
          count = 0;
          previous = current;
        }

        if (count >= this.options.windowWaitCount || Date.now() >= timeout) {
          clearInterval(timer);
          resolve();
        }
      }, this.options.windowWaitTimerMsec);
    });
  }

  #windowState() {
    const root = document.scrollingElement || document.documentElement;

    return [
      window.innerWidth,
      window.innerHeight,
      Math.ceil(root.scrollWidth),
      Math.ceil(root.scrollHeight),
      Math.ceil(window.scrollX),
      Math.ceil(window.scrollY)
    ].join(':');
  }

  async #startStyle(callback) {
    try {
      document.documentElement.classList.add('screencap--capturing');
      return await callback();
    } finally {
      document.documentElement.classList.remove('screencap--capturing');
    }
  }

  async #startScroll(callback) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    try {
      window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
      return await callback();
    } finally {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });
    }
  }
}
