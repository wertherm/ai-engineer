// SNAPSHOT DE ESTUDO. Não use em produção e não rode: ele existe para ser lido, analisado por engenharia reversa e endurecido.
// Origem: mcp-server/tools/http/get.js do repositório jps-agents (privado), commit 81d4a2e. Sem alterações no código abaixo.
// Roteiro de análise: ../README.md e ../../engenharia-reversa/README.md.

import axios from 'axios';

export const httpGet = {
  name: 'http_get',
  description: 'Make an HTTP GET request to a URL and return the response data',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to make GET request to'
      },
      headers: {
        type: 'object',
        description: 'Optional HTTP headers',
        default: {}
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds (default: 10000)',
        default: 10000
      }
    },
    required: ['url']
  },
  execute: async (args) => {
    const { url, headers = {}, timeout = 10000 } = args;
    
    try {
      const msg = '[http_get] Requesting: ' + url;
      console.log(msg);
      
      const response = await axios.get(url, {
        headers,
        timeout,
        maxRedirects: 5
      });
      
      let data = response.data;
      if (typeof data === 'object') {
        data = JSON.stringify(data, null, 2);
      }
      
      const logMsg = '[http_get] Success: ' + response.status + ' - ' + data.length + ' chars';
      console.log(logMsg);
      
      return {
        success: true,
        url,
        status: response.status,
        statusText: response.statusText,
        data: data,
        headers: response.headers
      };
    } catch (error) {
      const errMsg = '[http_get] Error: ' + error.message;
      console.error(errMsg);
      
      return {
        success: false,
        url,
        error: error.message,
        status: error.response?.status || null
      };
    }
  }
};
