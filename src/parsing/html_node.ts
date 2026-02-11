export type TypeTextContent = Text | string | Array<Text>;

export class Text {
  static tag?: string;
  static attr?: string;

  tag?: string;
  attr?: string;
  param?: string;
  content: TypeTextContent;

  constructor(content: TypeTextContent, param?: string, _opts?: { copy?: boolean }) {
    if (content == null) content = "";
    this.param = param;
    const ctor = this.constructor as typeof Text;
    this.tag = ctor.tag;
    this.attr = ctor.attr;
    if (content instanceof Text) {
      const sameType = content.constructor === this.constructor;
      const isBaseText = content.constructor === Text;
      this.content = sameType || isBaseText ? content.content : content;
    } else if (typeof content === "string") {
      this.content = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    } else {
      this.content = content;
    }
  }

  isNested(): boolean {
    return typeof this.content !== "string";
  }

  isListed(): boolean {
    return Array.isArray(this.content);
  }

  copy(): Text {
    if (this.isNested()) {
      const contentCopy = this.isListed()
        ? (this.content as Array<Text>).map((t) => t.copy())
        : (this.content as Text).copy();
      return new (this.constructor as typeof Text)(contentCopy, this.param, { copy: true });
    }
    return this;
  }

  strip(deeper = false, stripL = true, stripR = true): void {
    if (!this.isNested()) {
      if (stripL) {
        this.content = String(this.content).replace(/^\s+/, "");
      }
      if (stripR) {
        this.content = String(this.content).replace(/\s+$/, "");
      }
      return;
    }
    if (!this.isListed()) {
      if (deeper) {
        (this.content as Text).strip(deeper, stripL, stripR);
      }
      return;
    }
    const list = this.content as Array<Text>;
    while (stripL && list.length > 0 && list[0] instanceof Br) {
      list.shift();
    }
    while (stripR && list.length > 0 && list[list.length - 1] instanceof Br) {
      list.pop();
    }
    if (deeper) {
      list.forEach((t) => t.strip(deeper, stripL, stripR));
    }
  }

  lstrip(deeper = false): void {
    this.strip(deeper, true, false);
  }

  rstrip(deeper = false): void {
    this.strip(deeper, false, true);
  }

  isEmpty(allowWhitespace = false): boolean {
    if (this.isListed()) {
      return (this.content as Array<Text>).every((t) => t.isEmpty(allowWhitespace));
    }
    if (this.isNested()) {
      return (this.content as Text).isEmpty(allowWhitespace);
    }
    const value = String(this.content);
    return !value || (!allowWhitespace && !value.trim());
  }

  getHtml(plain = false): string {
    let result = "";
    if (this.isListed()) {
      result = (this.content as Array<Text>).map((t) => t.getHtml(plain)).join("");
    } else if (this.isNested()) {
      result = (this.content as Text).getHtml(plain);
    } else {
      result = String(this.content);
    }

    if (!plain) {
      if (this.attr && this.param) {
        return `<${this.tag} ${this.attr}="${this.param}">${result}</${this.tag}>`;
      }
      if (this.tag) {
        return `<${this.tag}>${result}</${this.tag}>`;
      }
    }
    return result;
  }

  splitHtml(lengthLimitHead: number, headCount = -1, lengthLimitTail = 4096): Array<string> {
    const splitList: Array<string> = [];
    if (Array.isArray(this.content)) {
      let length = 0;
      let splitCount = 0;
      let result = "";
      let currLength = 0;
      let lastSub: Text | null = null;
      for (const sub of this.content) {
        lastSub = sub;
        currLength = sub.length();
        const currLimit = headCount === -1 || splitCount < headCount ? lengthLimitHead : lengthLimitTail;
        if (length + currLength >= currLimit && result) {
          const stripped = result.trim();
          result = "";
          length = 0;
          if (stripped) {
            splitCount += 1;
            splitList.push(stripped);
          }
        }
        if (currLength >= currLimit) {
          const subList = sub.splitHtml(currLimit);
          splitCount += subList.length;
          splitList.push(...subList);
          continue;
        }
        length += currLength;
        result += sub.getHtml();
      }
      const currLimit = headCount === -1 || splitCount < headCount ? lengthLimitHead : lengthLimitTail;
      if (length < currLimit && result) {
        const stripped = result.trim();
        if (stripped) splitList.push(stripped);
      } else if (currLength >= currLimit && lastSub) {
        splitList.push(...lastSub.splitHtml(currLimit));
      }
      return splitList;
    }

    if (typeof this.content === "string") {
      const value = this.content;
      if (value.length >= lengthLimitHead) {
        for (let i = 0; i < value.length; i += lengthLimitHead - 1) {
          splitList.push(value.slice(i, i + lengthLimitHead - 1));
        }
      } else {
        splitList.push(value);
      }
    } else {
      splitList.push(...(this.content as Text).splitHtml(lengthLimitHead));
    }

    return splitList.map((text) => {
      if (this.attr && this.param) return `<${this.tag} ${this.attr}=${this.param}>${text}</${this.tag}>`;
      if (this.tag) return `<${this.tag}>${text}</${this.tag}>`;
      return text;
    });
  }

  findInstances<T extends Text>(cls: new (...args: any[]) => T, shallow = false): Array<T> | null {
    const result: Array<T> = [];
    if (this instanceof cls) result.push(this as T);
    if (this.isListed()) {
      const list = this.content as Array<Text>;
      if (shallow) {
        return list.filter((t) => t instanceof cls) as Array<T>;
      }
      for (const sub of list) {
        const instance = sub.findInstances(cls);
        if (instance) result.push(...instance);
      }
      return result.length ? result : null;
    }
    if (this.isNested()) {
      const instance = (this.content as Text).findInstances(cls, shallow);
      if (instance) result.push(...instance);
    }
    return result.length ? result : null;
  }

  length(): number {
    if (Array.isArray(this.content)) {
      return this.content.reduce((sum, t) => sum + t.length(), 0);
    }
    if (this.content instanceof Text) return this.content.length();
    return String(this.content).length;
  }

  valueOf(): boolean {
    return Boolean(this.content);
  }

  toString(): string {
    return this.getHtml();
  }
}

export class HtmlTree extends Text {}

class TagWithParam extends Text {
  constructor(content: TypeTextContent, param?: string, opts?: { copy?: boolean }) {
    super(content, param, opts);
  }
}

class TagWithOptionalParam extends Text {
  constructor(content: TypeTextContent, param?: string, opts?: { copy?: boolean }) {
    super(content, param, opts);
  }
}

class TagWithoutParam extends Text {
  constructor(content: TypeTextContent, _param?: string, opts?: { copy?: boolean }) {
    super(content, undefined, opts);
  }
}

class ListParent extends TagWithoutParam {}

export class Link extends TagWithParam {
  static tag = "a";
  static attr = "href";
}

export class Bold extends TagWithoutParam {
  static tag = "b";
}

export class Italic extends TagWithoutParam {
  static tag = "i";
}

export class Underline extends TagWithoutParam {
  static tag = "u";
}

export class Strike extends TagWithoutParam {
  static tag = "s";
}

export class Blockquote extends TagWithoutParam {
  static tag = "blockquote";
}

export class Code extends TagWithOptionalParam {
  static tag = "code";
  static attr = "class";
}

export class Pre extends TagWithoutParam {
  static tag = "pre";
}

export class Br extends TagWithoutParam {
  constructor(count = 1, _param?: string, opts?: { copy?: boolean }) {
    if (opts?.copy) {
      super(count as unknown as TypeTextContent, undefined, opts);
      return;
    }
    const repeat = Number.isFinite(count as number) ? Math.max(1, Math.trunc(count as number)) : 1;
    super("\n".repeat(repeat));
  }

  getHtml(plain = false): string {
    return plain ? "" : super.getHtml(plain);
  }
}

export class Hr extends TagWithoutParam {
  constructor(_content?: TypeTextContent, _param?: string, opts?: { copy?: boolean }) {
    if (opts?.copy) {
      super(_content as TypeTextContent, undefined, opts);
      return;
    }
    super("\n----------------------\n");
  }

  getHtml(plain = false): string {
    return plain ? "" : super.getHtml(plain);
  }
}

export class ListItem extends TagWithoutParam {
  constructor(content: TypeTextContent, _param?: string, opts?: { copy?: boolean }) {
    super(content, undefined, opts);
    if (opts?.copy) return;
    const nestedLists = this.findInstances(ListParent);
    if (!nestedLists) return;
    for (const nestedList of nestedLists) {
      nestedList.rstrip();
      const nestedItems = nestedList.findInstances(ListItem, true);
      if (!nestedItems) return;
      for (const nestedItem of nestedItems) {
        nestedItem.content = [new Text("    "), new Text(nestedItem.content as TypeTextContent)];
      }
      nestedItems[nestedItems.length - 1].rstrip(true);
    }
  }
}

export class OrderedList extends ListParent {
  constructor(content: TypeTextContent, _param?: string, opts?: { copy?: boolean }) {
    super(content, undefined, opts);
    if (opts?.copy) return;
    const listItems = this.findInstances(ListItem, true);
    if (!listItems) return;
    listItems.forEach((item, idx) => {
      item.content = [new Bold(`${idx + 1}. `), new Text(item.content as TypeTextContent), new Br()];
    });
  }
}

export class UnorderedList extends ListParent {
  constructor(content: TypeTextContent, _param?: string, opts?: { copy?: boolean }) {
    super(content, undefined, opts);
    if (opts?.copy) return;
    const listItems = this.findInstances(ListItem, true);
    if (!listItems) return;
    listItems.forEach((item) => {
      item.content = [new Bold("\u25cf "), new Text(item.content as TypeTextContent), new Br()];
    });
  }
}
