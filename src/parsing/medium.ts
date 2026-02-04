import { Text, Link } from "./html_node";
import { isAbsoluteHttpLink } from "./utils";

export type MediumType = "image" | "video" | "audio" | "animation" | "file";

export class AbstractMedium {
  type: MediumType;
  urls: Array<string>;
  originalUrls: Array<string>;
  chosenUrl: string;
  valid: boolean | null = null;
  dropSilently = false;

  constructor(type: MediumType, urls: Array<string> | string) {
    this.type = type;
    this.urls = Array.isArray(urls) ? urls.filter(Boolean) : [urls];
    this.originalUrls = [...this.urls];
    this.chosenUrl = this.urls[0] || "";
  }

  get hash(): string {
    return this.originalUrls.join("|");
  }

  getMultimediaHtml(): string | null {
    if (!this.chosenUrl) return null;
    if (this.type === "image" || this.type === "animation") {
      return `<img src="${this.chosenUrl}">`;
    }
    if (this.type === "video") {
      return `<video src="${this.chosenUrl}"></video>`;
    }
    if (this.type === "audio") {
      return `<audio src="${this.chosenUrl}"></audio>`;
    }
    return `<a href="${this.chosenUrl}">${this.chosenUrl}</a>`;
  }

  getLinkHtmlNode(): Text | null {
    if (!this.chosenUrl) return null;
    if (!isAbsoluteHttpLink(this.chosenUrl)) {
      return new Text(this.chosenUrl);
    }
    return new Link("source", this.chosenUrl);
  }
}

export class Image extends AbstractMedium {
  constructor(urls: Array<string> | string) {
    super("image", urls);
  }
}

export class Animation extends AbstractMedium {
  constructor(urls: Array<string> | string) {
    super("animation", urls);
  }
}

export class Video extends AbstractMedium {
  poster?: string;
  constructor(urls: Array<string> | string, poster?: string) {
    super("video", urls);
    this.poster = poster;
  }
}

export class Audio extends AbstractMedium {
  constructor(urls: Array<string> | string) {
    super("audio", urls);
  }
}

export class File extends AbstractMedium {
  constructor(urls: Array<string> | string) {
    super("file", urls);
  }
}

export class UploadedImage extends AbstractMedium {
  constructor(urls: Array<string> | string) {
    super("image", urls);
  }
}

export class Media {
  private items: Array<AbstractMedium> = [];

  add(medium: AbstractMedium): void {
    if (!medium) return;
    this.items.push(medium);
  }

  urlExists(url: string, loose = false): AbstractMedium | null {
    const normalized = loose ? stripQuery(url) : url;
    for (const medium of this.items) {
      for (const candidate of medium.originalUrls) {
        const target = loose ? stripQuery(candidate) : candidate;
        if (target === normalized) return medium;
      }
    }
    return null;
  }

  estimateMessageCounts(): number {
    const images: Array<AbstractMedium> = [];
    const videos: Array<AbstractMedium> = [];
    const gifs: Array<AbstractMedium> = [];
    const audios: Array<AbstractMedium> = [];
    const files: Array<AbstractMedium> = [];
    for (const medium of this.items) {
      if (medium.dropSilently) continue;
      if (medium.type === "image") images.push(medium);
      else if (medium.type === "video") videos.push(medium);
      else if (medium.type === "animation") gifs.push(medium);
      else if (medium.type === "audio") audios.push(medium);
      else files.push(medium);
    }
    const groupable = images.length + videos.length;
    let count = 0;
    if (groupable > 0) count += Math.ceil(groupable / 10);
    count += gifs.length + audios.length + files.length;
    return count;
  }

  listUrls(): Array<string> {
    return this.items.map((m) => m.chosenUrl).filter(Boolean);
  }

  get length(): number {
    return this.items.filter((m) => !m.dropSilently).length;
  }

  get hasMedia(): boolean {
    return this.length > 0;
  }

  getItems(): Array<AbstractMedium> {
    return this.items;
  }
}

const stripQuery = (url: string): string => url.split("?")[0];

export const weservParamEncode = (param: string): string => {
  const hashIndex = param.indexOf("#");
  const trimmed = hashIndex >= 0 ? param.slice(0, hashIndex) : param;
  return trimmed.replace(/%/g, "%25").replace(/&/g, "%26");
};

export const constructWeservUrl = (
  base: string,
  url: string,
  options?: {
    width?: number;
    height?: number;
    fit?: string;
    output?: string;
    quality?: number;
    withoutEnlargement?: boolean;
    defaultImage?: string;
  }
): string => {
  const params: Array<string> = [`url=${weservParamEncode(url)}`];
  if (options?.width) params.push(`w=${options.width}`);
  if (options?.height) params.push(`h=${options.height}`);
  if (options?.fit) params.push(`fit=${options.fit}`);
  if (options?.output) params.push(`output=${options.output}`);
  if (options?.quality) params.push(`q=${options.quality}`);
  if (options?.withoutEnlargement) params.push("we=1");
  if (options?.defaultImage) params.push(`default=${weservParamEncode(options.defaultImage)}`);
  return `${base}?${params.join("&")}`;
};

export const constructWeservUrlConvertTo2560 = (base: string, url: string): string =>
  constructWeservUrl(base, url, {
    width: 2560,
    height: 2560,
    output: "jpg",
    quality: 89,
    withoutEnlargement: true
  });
