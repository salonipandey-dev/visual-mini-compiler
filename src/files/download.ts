/**
 * download.ts — offer the editor text as a .mcl file download.
 *
 * Uses the long-standing Blob + object URL + <a download> technique, which
 * works in every current browser. The newer File System Access API is not
 * required.
 *
 * "Started" is all this can ever report: the browser may ask where to save,
 * the user may cancel, or the disk write may fail, and the page is told none
 * of this.
 */

/** UTF-8 bytes of the text, exactly as in the editor (LF newlines). */
export function sourceBlob(text: string): Blob {
  // Blob always encodes JavaScript strings as UTF-8.
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}

/** The minimum this module needs from an <a> element. */
export interface DownloadLink {
  href: string;
  download: string;
  rel: string;
  click(): void;
  remove(): void;
}

/** Browser services, injectable so tests can check the clean-up. */
export interface DownloadEnvironment {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createLink(): DownloadLink;
  attach(link: DownloadLink): void;
  /** Run clean-up after the browser has picked up the download. */
  later(callback: () => void): void;
}

export function startDownload(text: string, fileName: string, environment: DownloadEnvironment = browserEnvironment()): void {
  const url = environment.createObjectURL(sourceBlob(text));
  const link = environment.createLink();
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  environment.attach(link);
  try {
    link.click();
  } finally {
    // Clean up even if click() throws: remove the link now, release the object URL shortly after.
    link.remove();
    environment.later(() => environment.revokeObjectURL(url));
  }
}

function browserEnvironment(): DownloadEnvironment {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createLink: () => document.createElement('a'),
    attach: (link) => {
      const element = link as HTMLAnchorElement;
      element.hidden = true;
      document.body.append(element);
    },
    // A short delay: some browsers read the URL asynchronously after click().
    later: (callback) => {
      window.setTimeout(callback, 1000);
    },
  };
}
