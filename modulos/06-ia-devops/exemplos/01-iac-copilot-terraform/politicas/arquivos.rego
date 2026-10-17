# Políticas da plataforma para arquivos gerados pelo IaC (rodam sobre o JSON do `tofu plan`).
# Conftest procura regras `deny` no pacote `main`; cada mensagem vira um erro que volta ao LLM.
package main

import rego.v1

# Recursos que o plano vai criar ou alterar.
mudancas contains rc if {
	some rc in input.resource_changes
	some acao in rc.change.actions
	acao in {"create", "update"}
}

arquivos contains rc if {
	some rc in mudancas
	rc.type in {"local_file", "local_sensitive_file"}
}

# Regra 1: sem acesso para "outros". Atenção: o default do provider local é "0777",
# então omitir file_permission também cai aqui (o plano já mostra o valor efetivo).
deny contains msg if {
	some rc in arquivos
	perm := rc.change.after.file_permission
	not endswith(perm, "0")
	msg := sprintf("%s: file_permission %q dá acesso a outros usuários; use \"0640\" ou mais restrito", [rc.address, perm])
}

# Regra 2: segredo (random_password) nunca vai para local_file comum (que aparece em texto no plano/log).
deny contains msg if {
	some res in input.configuration.root_module.resources
	res.type == "local_file"
	some ref in res.expressions.content.references
	# references traz "random_password.db" e "random_password.db.result": olhamos só o primeiro.
	regex.match(`^random_password\.[a-z0-9_]+$`, ref)
	msg := sprintf("local_file.%s grava %s em texto puro; use local_sensitive_file", [res.name, ref])
}
