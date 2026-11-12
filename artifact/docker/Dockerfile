FROM node:24.22.1-bookworm

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      python3 \
      python3-pip \
      time \
      tshark \
      xz-utils \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
      https://github.com/WebAssembly/wabt/releases/download/1.0.42/wabt-1.0.42-linux-x64.tar.gz \
      -o /tmp/wabt.tar.gz \
 && tar -xzf /tmp/wabt.tar.gz -C /opt \
 && mv /opt/wabt-1.0.42 /opt/wabt \
 && rm /tmp/wabt.tar.gz

RUN pip3 install --no-cache-dir --break-system-packages \
      numpy safetensors gguf tiktoken

RUN python3 -c "import tiktoken; tiktoken.get_encoding('cl100k_base')"

ENV REA_WABT_BIN_DIRECTORY=/opt/wabt/bin
ENV NODE_BIN=node
WORKDIR /work/artifact
CMD ["bash"]
