// kintone JS API の最小の自前型宣言。
// 使う API を追加したらここにも追記すること。

declare const kintone: {
  $PLUGIN_ID: string;
  api: {
    (pathOrUrl: string, method: string, params: object): Promise<any>;
    url(path: string, detectGuestSpace?: boolean): string;
  };
  events: {
    on(type: string | string[], handler: (event: any) => any): void;
  };
  getLoginUser(): {
    id: string;
    code: string;
    name: string;
    email?: string;
    url?: string;
    employeeNumber?: string;
    phone?: string;
    mobilePhone?: string;
    extensionNumber?: string;
  };
  app: {
    getId(): number | null;
    record: {
      getId(): number | null;
      getSpaceElement(id: string): HTMLElement | null;
      getHeaderMenuSpaceElement(): HTMLElement | null;
    };
  };
  mobile: {
    app: {
      getId(): number | null;
      getHeaderSpaceElement(): HTMLElement | null;
      record: {
        getId(): number | null;
        getSpaceElement(id: string): HTMLElement | null;
      };
    };
  };
  plugin: {
    app: {
      getConfig(pluginId: string): Record<string, string>;
      setConfig(config: Record<string, string>, cb?: () => void): void;
      setProxyConfig(
        url: string,
        method: string,
        headers: Record<string, string>,
        data: Record<string, unknown>,
        cb?: () => void
      ): void;
      getProxyConfig(
        url: string,
        method: string
      ): { headers: Record<string, string>; data: Record<string, unknown> } | null;
      proxy(
        pluginId: string,
        url: string,
        method: string,
        headers: Record<string, string>,
        data: unknown,
        success: (body: string, status: number, headers: Record<string, string>) => void,
        error: (err: unknown) => void
      ): void;
    };
  };
};
