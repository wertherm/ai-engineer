"""Estado da aplicação (em memória). A UI web e o servidor MCP leem e escrevem o MESMO estado: é isso
que permite a um agente agir pela interface e conferir o resultado pelo MCP."""

import threading


class Estado:
    def __init__(self) -> None:
        self._lock = threading.Lock()  # uvicorn roda numa thread e os testes em outra
        self.resetar()

    def listar(self) -> list[dict]:
        with self._lock:
            return [dict(t) for t in self._tarefas]

    def adicionar(self, titulo: str) -> dict:
        t = {"id": 0, "titulo": str(titulo).strip(), "concluida": False}
        if not t["titulo"]:
            raise ValueError("Título vazio")
        with self._lock:
            t["id"] = self._proximo_id
            self._proximo_id += 1
            self._tarefas.append(t)
            return dict(t)

    def concluir(self, id_: int) -> dict | None:
        with self._lock:
            t = next((x for x in self._tarefas if x["id"] == int(id_)), None)
            if t is None:
                return None
            t["concluida"] = True
            return dict(t)

    def resetar(self) -> None:
        with self._lock:
            self._tarefas: list[dict] = []
            self._proximo_id = 1
