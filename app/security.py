import ipaddress
import logging
from urllib.parse import urlsplit

from starlette.responses import JSONResponse

logger = logging.getLogger('worklog')
MAX_BODY = 512 * 1024


def error_response(code: str, status: int, fields=None):
    return JSONResponse({'code':code,'fields':fields or []},status_code=status)


def source_ip(request, trusted_proxies):
    try:
        peer = ipaddress.ip_address(request.client.host)
    except (ValueError, AttributeError):
        return 'unknown'
    trusted = lambda address:any(address in network for network in trusted_proxies)
    if not trusted(peer):
        return str(peer)
    header = request.headers.get('x-forwarded-for','')
    if len(header)>2048:
        return str(peer)
    try:
        chain = [ipaddress.ip_address(value.strip()) for value in header.split(',')] + [peer]
        if len(chain)>21:
            return str(peer)
    except ValueError:
        return str(peer)
    while len(chain)>1 and trusted(chain[-1]):
        chain.pop()
    return str(chain[-1])


class RequestBoundary:
    def __init__(self, app, config):
        self.app,self.config = app,config
        self.host = urlsplit(config.boardOrigin).netloc

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope,receive,send)
        pairs = scope.get('headers',[])
        headers = dict(pairs)
        started = False
        async def secure_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
                additions = {
                    b'cache-control':b'no-store',
                    b'x-content-type-options':b'nosniff',
                    b'referrer-policy':b'no-referrer',
                    b'content-security-policy':b"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
                }
                message['headers'] = [(k,v) for k,v in message.get('headers',[]) if k.lower() not in additions] + list(additions.items())
            await send(message)
        async def reject(code,status):
            await error_response(code,status)(scope,receive,secure_send)
        for name in (b'host',b'origin',b'content-type',b'x-worklog-request',b'content-length'):
            if sum(key==name for key,_ in pairs)>1:
                return await reject('invalid_headers',400)
        if headers.get(b'host',b'').decode('latin-1') != self.host:
            return await reject('forbidden',403)
        origin = headers.get(b'origin')
        if origin is not None and origin.decode('latin-1') != self.config.boardOrigin:
            return await reject('forbidden',403)
        mutation = scope['method'] not in ('GET','HEAD','OPTIONS')
        buffered = None
        if mutation:
            if origin is None or headers.get(b'x-worklog-request') != b'1':
                return await reject('forbidden',403)
            if headers.get(b'content-type',b'').split(b';')[0].strip().lower() != b'application/json':
                return await reject('unsupported_media_type',415)
            length = headers.get(b'content-length')
            if length is not None:
                if not length.isdigit():
                    return await reject('invalid_headers',400)
                if int(length)>MAX_BODY:
                    return await reject('body_too_large',413)
            chunks, size = [],0
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                chunk = message.get('body',b'')
                size += len(chunk)
                if size>MAX_BODY:
                    return await reject('body_too_large',413)
                chunks.append(chunk)
                if not message.get('more_body',False):
                    break
            buffered = b''.join(chunks)
        delivered = False
        async def bounded_receive():
            nonlocal delivered
            if buffered is not None and not delivered:
                delivered = True
                return {'type':'http.request','body':buffered,'more_body':False}
            return await receive()
        try:
            await self.app(scope,bounded_receive,secure_send)
        except Exception:
            logger.error('operation=internal_error')
            if not started:
                await reject('internal_error',500)
            else:
                await send({'type':'http.response.body','body':b'','more_body':False})
