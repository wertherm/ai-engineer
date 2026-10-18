"""Contrato do Requirements Copilot: o LLM só pode devolver algo que passe neste modelo (pydantic no lugar do zod)."""
from pydantic import BaseModel, Field


class Historia(BaseModel):
    id: str = Field(description="ex.: HU-01")
    como: str = Field(description="persona, ex.: cliente")
    quero: str
    para: str
    criterios: list[str] = Field(description="critérios de aceite no formato Dado/Quando/Então")
    tarefas: list[str] = Field(description="decomposição técnica em tarefas curtas")


class Epico(BaseModel):
    id: str = Field(description="ex.: EP-01")
    titulo: str
    historias: list[Historia]


class Mudanca(BaseModel):
    descricao: str
    afeta: list[str] = Field(description="ids das histórias afetadas")


class Requisitos(BaseModel):
    epicos: list[Epico]
    mudancas: list[Mudanca] = Field(description="requisitos de mudança (change requests) citados no texto")
    duvidas: list[str] = Field(description="ambiguidades a perguntar ao PO")
