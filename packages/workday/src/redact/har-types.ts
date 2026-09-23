/**
 * Minimal HAR (HTTP Archive) types. Only the fields the redactor reads.
 * We intentionally do not depend on a full HAR type package.
 */

export interface HarHeader {
  name: string;
  value: string;
}

export interface HarQueryParam {
  name: string;
  value: string;
}

export interface HarPostData {
  mimeType?: string;
  text?: string;
}

export interface HarContent {
  mimeType?: string;
  text?: string;
}

export interface HarRequest {
  method: string;
  url: string;
  headers?: HarHeader[];
  queryString?: HarQueryParam[];
  postData?: HarPostData;
}

export interface HarResponse {
  status: number;
  headers?: HarHeader[];
  content?: HarContent;
}

export interface HarEntry {
  request: HarRequest;
  response: HarResponse;
}

export interface Har {
  log: {
    entries: HarEntry[];
  };
}
