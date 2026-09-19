import { describe, expect, it } from 'vitest';
import corpus from '../fixtures/resource-links.json';
import configs from '../fixtures/site-config.json';
import { validateConfig } from '../../src/contracts/config';
import { parseResource } from '../../src/contracts/resource-links';
import { parseRequest, parseReply } from '../../src/contracts/preview-messages';

for (const sample of configs.cases) it('shared configuration '+JSON.stringify(sample.input), () => {
  if (sample.expected === null) expect(() => validateConfig(sample.input)).toThrow();
  else expect(validateConfig(sample.input)).toEqual(sample.expected);
});
it('accepts configured deployment contexts and normalizes HTTPS default ports', () => {
  const config = validateConfig(configs.cases[0]!.input);
  expect(parseResource('jira','https://JIRA.EXAMPLE:443/team/jira/browse/demo-1',config).url).toBe('https://jira.example/team/jira/browse/DEMO-1');
  expect(parseResource('mattermost','https://chat.example/chat/demo/pl/'+'a'.repeat(26),config).id).toBe('a'.repeat(26));
});

describe('shared Python/TypeScript link corpus', () => {
  for (const sample of corpus.cases) {
    it(sample.input, () => {
      const config = validateConfig(corpus.config);
      if (sample.expected === null) expect(() => parseResource(sample.kind, sample.input, config)).toThrow();
      else expect(parseResource(sample.kind, sample.input, config)).toEqual(sample.expected);
    });
  }
});

it('validates every fixed operation, including cancel and Mattermost', () => {
  const messages = [
    {version:1,id:'a',op:'hello'},
    {version:1,id:'b',op:'cancel',targetId:'a'},
    {version:1,id:'c',op:'mattermost.preview',postId:'a'.repeat(26),team:'demo'},
    {version:1,id:'d',op:'jira.preview',key:'DEMO-1'},
  ];
  for (const message of messages) {
    expect(parseRequest(message)).toEqual(message);
    for (const key of Object.keys(message)) {
      const missing: Record<string,unknown> = {...message}; delete missing[key];
      expect(() => parseRequest(missing)).toThrow();
      expect(() => parseRequest({...message,[key]:null})).toThrow();
    }
    expect(() => parseRequest({...message,url:'https://evil.invalid'})).toThrow();
    expect(() => parseRequest({...message,id:'x'.repeat(65)})).toThrow();
  }
  for (const team of ['..','a/b','a%2fb']) expect(() => parseRequest({...messages[2],team})).toThrow();
});

it('rejects raw private fields and malformed preview responses', () => {
  const data = {kind:'jira',key:'DEMO-1',url:corpus.config.jiraBaseUrl+'/browse/DEMO-1',summary:'合成',assignee:null,status:'Open',comment:null};
  const reply = {version:1,id:'a',ok:true,data};
  expect(parseReply(reply,validateConfig(corpus.config))).toEqual(reply);
  for (const invalid of [{...reply,data:{...data,Cookie:'synthetic'}},{...reply,data:{...data,comment:{body:'raw'}}},{...reply,data:{...data,url:'https://evil.invalid'}},{...reply,ok:false}, {version:1,id:'a',ok:false,error:{code:'network',body:'raw'}}]) {
    expect(() => parseReply(invalid,validateConfig(corpus.config))).toThrow();
  }
  expect(parseReply({version:1,id:'a',ok:false,error:{code:'rate_limited',retryAfterMs:2000}},validateConfig(corpus.config))).toEqual({version:1,id:'a',ok:false,error:{code:'rate_limited',retryAfterMs:2000}});
  expect(() => parseReply({version:1,id:'a',ok:false,error:{code:['network']}},validateConfig(corpus.config))).toThrow();
});

it('accepts only fixed preview operations and identifiers', () => {
  const valid = { version:1, id:'request_1', op:'jira.preview', key:'DEMO-1' };
  expect(parseRequest(valid)).toEqual(valid);
  expect(parseRequest({version:1,id:'hello_1',op:'hello'})).toEqual({version:1,id:'hello_1',op:'hello'});
  for (const invalid of [
    {...valid, url:'http://evil.localhost/'}, {...valid, headers:{Cookie:'synthetic'}},
    {...valid, method:'POST'}, {...valid, version:2}, {...valid, key:'../private'},
    {...valid, id:''}, {...valid, op:'fetch'}, null, [],
    {version:1,id:'a',op:'mattermost.preview',postId:'invalid',team:'demo'},
  ]) expect(() => parseRequest(invalid)).toThrow();
});

it('validates configured sources before any request', () => {
  expect(validateConfig(corpus.config)).toEqual(corpus.config);
  for (const patch of [
    {boardOrigin:'http://board.localhost:4173/path'},
    {jiraBaseUrl:'http://u:p@jira.localhost:4180/jira'},
    {jiraBaseUrl:'http://jira.localhost:4180/jira/../jira'},
    {mattermostBaseUrl:'http://board.localhost:4181'},
    {jiraBaseUrl:'http://jira.localhost:4180/jira?token=x'},
    {privateCookie:'synthetic'},
  ]) expect(() => validateConfig({...corpus.config,...patch})).toThrow();
});

it('rejects trailing controls before URL and identifier normalization', () => {
  const config = validateConfig(corpus.config);
  for (const suffix of ['\n','\r','\t']) {
    expect(() => parseResource('jira','DEMO-1'+suffix,config)).toThrow();
    expect(() => validateConfig({...corpus.config,jiraBaseUrl:corpus.config.jiraBaseUrl+suffix})).toThrow();
    expect(() => parseRequest({version:1,id:'a'+suffix,op:'hello'})).toThrow();
    expect(() => parseRequest({version:1,id:'a',op:'jira.preview',key:'DEMO-1'+suffix})).toThrow();
  }
});
