"""Primeira chamada ao vLLM usando o SDK oficial da OpenAI.

O vLLM fala o "dialeto" da OpenAI, então qualquer código que já usa esse SDK
passa a usar o seu modelo self-hosted trocando só o base_url.
"""
import os

from openai import OpenAI

# api_key é obrigatória no SDK, mas o vLLM local foi subido sem --api-key: qualquer valor serve.
client = OpenAI(base_url=os.getenv("VLLM_URL", "http://localhost:8000") + "/v1", api_key="local")

resposta = client.chat.completions.create(
    model="qwen-mini",  # tem de bater com o --served-model-name do servidor
    messages=[
        {"role": "system", "content": "Responda em português, em uma frase."},
        {"role": "user", "content": "O que é um container?"},
    ],
    max_tokens=60,
    temperature=0,  # 0 = sempre o token mais provável -> resposta reprodutível
)

print(resposta.choices[0].message.content)
print(f"tokens: entrada={resposta.usage.prompt_tokens} saída={resposta.usage.completion_tokens}")
print(f"motivo de parada: {resposta.choices[0].finish_reason}")
