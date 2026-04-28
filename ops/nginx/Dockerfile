FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY ops/nginx/openssl.cnf /etc/nginx/openssl.cnf
COPY ops/nginx/start-proxy.sh /start-proxy.sh

RUN chmod +x /start-proxy.sh

CMD ["/start-proxy.sh"]
